import { describe, expect, it, vi } from "vitest";
import {
  CmsError,
  MAX_PAGES,
  createCmsClient,
  normaliseBaseUrl,
  tagsFor,
} from "./client";
import type { CmsItem } from "./types";

/** A minimal item; tests only ever read `slug`. */
const item = (slug: string) => ({ slug }) as CmsItem;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** What a recorded fetch call looks like, so the assertions can read it. */
type FetchCall = [string, RequestInit & { next?: unknown }];

const callsOf = (fn: { mock: { calls: unknown[] } }) => fn.mock.calls as FetchCall[];

function client(fetchImpl: typeof globalThis.fetch) {
  return createCmsClient({ baseUrl: "https://cms.test", key: "ttck_x", fetch: fetchImpl });
}

describe("normaliseBaseUrl", () => {
  it("drops trailing slashes", () => {
    expect(normaliseBaseUrl("https://cms.test///")).toBe("https://cms.test");
  });

  it("upgrades http, because a redirect would drop the Authorization header", () => {
    expect(normaliseBaseUrl("http://cms.test")).toBe("https://cms.test");
  });

  it("survives an empty value", () => {
    expect(normaliseBaseUrl("")).toBe("");
  });
});

describe("tagsFor", () => {
  it("tags a listing with its type", () => {
    expect(tagsFor("/blog?page=1&limit=24")).toEqual(["cms", "cms:blog"]);
  });

  it("tags an item read with its type, not its slug", () => {
    expect(tagsFor("/treatment/knee-replacement")).toEqual(["cms", "cms:treatment"]);
  });

  it("falls back to the bare tag when there is no type", () => {
    expect(tagsFor("/")).toEqual(["cms"]);
  });
});

describe("configuration", () => {
  it("is a soft failure: an unkeyed client reads null rather than throwing", async () => {
    const fetchImpl = vi.fn();
    const cms = createCmsClient({ baseUrl: "https://cms.test", key: "", fetch: fetchImpl as never });

    expect(cms.configured).toBe(false);
    await expect(cms.getItem("blog", "hello")).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends the key as a bearer token and tags the request", async () => {
    const fetchImpl = vi.fn(async () => json({ data: item("hello") }));
    await client(fetchImpl as never).getItem("blog", "hello");

    const [url, init] = callsOf(fetchImpl)[0]!;
    expect(url).toBe("https://cms.test/api/v1/content/blog/hello");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer ttck_x");
    expect(init.next).toEqual({ revalidate: 300, tags: ["cms", "cms:blog"] });
  });

  it("encodes a slug so a path separator cannot escape the type", async () => {
    const fetchImpl = vi.fn(async () => json({ data: item("x") }));
    await client(fetchImpl as never).getItem("blog", "a/b?c");

    expect(callsOf(fetchImpl)[0]![0]).toBe("https://cms.test/api/v1/content/blog/a%2Fb%3Fc");
  });
});

describe("error rules", () => {
  it("reads a 404 as 'no such thing'", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 404 }));
    await expect(client(fetchImpl as never).getItem("blog", "gone")).resolves.toBeNull();
  });

  it("throws on a 500, because a swallowed one ships a section as 404s", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 500 }));
    await expect(client(fetchImpl as never).getItem("blog", "x")).rejects.toBeInstanceOf(CmsError);
  });

  it("throws on a 401, which is a wrong key rather than empty content", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 401 }));
    await expect(client(fetchImpl as never).listItems("blog")).rejects.toMatchObject({ status: 401 });
  });

  it("throws when the network fails", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    await expect(client(fetchImpl as never).getItem("blog", "x")).rejects.toBeInstanceOf(CmsError);
  });

  it("throws when a 200 body is not JSON", async () => {
    const fetchImpl = vi.fn(async () => new Response("<html>oops</html>", { status: 200 }));
    await expect(client(fetchImpl as never).getItem("blog", "x")).rejects.toBeInstanceOf(CmsError);
  });
});

describe("listItems", () => {
  it("asks for the page, limit, search and fields it was given", async () => {
    const fetchImpl = vi.fn(async () => json({ data: [], meta: null }));
    await client(fetchImpl as never).listItems("blog", {
      page: 3,
      limit: 10,
      search: "knee surgery",
      fields: "slug,title",
    });

    const url = new URL(callsOf(fetchImpl)[0]![0]);
    expect(url.searchParams.get("page")).toBe("3");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("q")).toBe("knee surgery");
    expect(url.searchParams.get("fields")).toBe("slug,title");
  });

  it("returns an empty list rather than undefined when the CMS is not configured", async () => {
    const cms = createCmsClient({ baseUrl: "", key: "" });
    await expect(cms.listItems("blog")).resolves.toEqual({ items: [], meta: null });
  });
});

describe("listAllItems", () => {
  it("follows pagination to the last page", async () => {
    const pages = [
      { data: [item("a"), item("b")], meta: { total: 3, page: 1, pageCount: 2, hasMore: true } },
      { data: [item("c")], meta: { total: 3, page: 2, pageCount: 2, hasMore: false } },
    ];
    const fetchImpl = vi.fn(async (url: string) => {
      const page = Number(new URL(url).searchParams.get("page"));
      return json(pages[page - 1]);
    });

    const all = await client(fetchImpl as never).listAllItems("blog");
    expect(all.map((i) => i.slug)).toEqual(["a", "b", "c"]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("stops on a single page without asking for a second", async () => {
    const fetchImpl = vi.fn(async () =>
      json({ data: [item("a")], meta: { total: 1, page: 1, pageCount: 1, hasMore: false } }),
    );

    await client(fetchImpl as never).listAllItems("blog");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("throws rather than truncating when a runaway pageCount never ends", async () => {
    // The failure this guards: a partial list is read as "these are all the
    // slugs", which 404s real pages and prunes real URLs from the sitemap.
    const fetchImpl = vi.fn(async () =>
      json({ data: [item("a")], meta: { total: 9e9, page: 1, pageCount: 9e9, hasMore: true } }),
    );

    await expect(client(fetchImpl as never).listAllItems("blog")).rejects.toBeInstanceOf(CmsError);
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_PAGES);
  });

  it("asks for a hundred at a time by default", async () => {
    const fetchImpl = vi.fn(async () =>
      json({ data: [], meta: { total: 0, page: 1, pageCount: 1, hasMore: false } }),
    );
    await client(fetchImpl as never).listAllItems("blog");

    expect(new URL(callsOf(fetchImpl)[0]![0]).searchParams.get("limit")).toBe("100");
  });
});

describe("currentSlug", () => {
  it("reports the new slug when the CMS redirected a retired one", async () => {
    const fetchImpl = vi.fn(async () => json({ data: item("bengaluru") }));
    await expect(client(fetchImpl as never).currentSlug("location", "bangalore")).resolves.toBe(
      "bengaluru",
    );
  });

  it("reports null when the slug is already current", async () => {
    const fetchImpl = vi.fn(async () => json({ data: item("bengaluru") }));
    await expect(client(fetchImpl as never).currentSlug("location", "bengaluru")).resolves.toBeNull();
  });

  it("reports null for an unknown slug, which is a 404 and not a redirect", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 404 }));
    await expect(client(fetchImpl as never).currentSlug("location", "nowhere")).resolves.toBeNull();
  });
});

describe("listSlugs", () => {
  it("narrows the response to slugs and drops empty ones", async () => {
    const fetchImpl = vi.fn(async () =>
      json({
        data: [item("a"), { slug: "" }, item("b")],
        meta: { total: 3, page: 1, pageCount: 1, hasMore: false },
      }),
    );

    await expect(client(fetchImpl as never).listSlugs("blog")).resolves.toEqual(["a", "b"]);
    expect(new URL(callsOf(fetchImpl)[0]![0]).searchParams.get("fields")).toBe("slug");
  });
});
