import { describe, expect, it, vi } from "vitest";
import { cmsSlugSource, createSlugGuard, type SlugSource } from "./slug-guard";

const sections = { treatments: "treatment", blog: "blog" };

function guardWith(source: SlugSource, clock = { t: 0 }) {
  return createSlugGuard({ sections, source, ttlMs: 1000, now: () => clock.t });
}

describe("createSlugGuard", () => {
  it("admits a published slug and refuses one nobody published", async () => {
    const guard = guardWith({
      listSlugs: async (type) => (type === "treatment" ? ["knee-replacement"] : ["hello"]),
    });

    await expect(guard.isKnownSlug("treatments", "knee-replacement")).resolves.toBe(true);
    await expect(guard.isKnownSlug("treatments", "knee-replacment")).resolves.toBe(false);
  });

  it("keeps each section's slugs to itself", async () => {
    const guard = guardWith({
      listSlugs: async (type) => (type === "treatment" ? ["knee"] : ["hello"]),
    });

    await expect(guard.isKnownSlug("blog", "knee")).resolves.toBe(false);
  });

  it("admits a retired slug, which still deserves its redirect", async () => {
    const guard = guardWith({
      listSlugs: async () => ["bengaluru"],
      listRetiredSlugs: async () => ["bangalore"],
    });

    await expect(guard.isKnownSlug("treatments", "bangalore")).resolves.toBe(true);
  });

  it("fails open when the CMS is unreachable", async () => {
    // Refusing on a missing list turns one failed fetch into a site that
    // answers 404 to everything.
    const guard = guardWith({
      listSlugs: async () => {
        throw new Error("ECONNREFUSED");
      },
    });

    await expect(guard.isKnownSlug("treatments", "anything")).resolves.toBe(true);
  });

  it("fails open on an empty list, which reads as 'we do not know yet'", async () => {
    const guard = guardWith({ listSlugs: async () => [] });
    await expect(guard.isKnownSlug("treatments", "anything")).resolves.toBe(true);
  });

  it("keeps the previous list when a refresh fails", async () => {
    const clock = { t: 0 };
    let fail = false;
    const guard = guardWith(
      {
        listSlugs: async () => {
          if (fail) throw new Error("down");
          return ["knee"];
        },
      },
      clock,
    );

    await guard.isKnownSlug("treatments", "knee");
    fail = true;
    clock.t = 5000;
    // The stale answer comes from what we had; the refresh behind it fails.
    await guard.isKnownSlug("treatments", "knee");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(guard.snapshot()).toEqual({ treatments: 1, blog: 1 });
    await expect(guard.isKnownSlug("treatments", "invented")).resolves.toBe(false);
  });

  it("loads once for a burst of questions rather than once each", async () => {
    const listSlugs = vi.fn(async () => ["knee"]);
    const guard = guardWith({ listSlugs });

    await Promise.all([
      guard.isKnownSlug("treatments", "knee"),
      guard.isKnownSlug("treatments", "hip"),
      guard.isKnownSlug("blog", "hello"),
    ]);

    // Two sections, one load.
    expect(listSlugs).toHaveBeenCalledTimes(2);
  });

  it("serves the stale list immediately and refreshes behind it", async () => {
    const clock = { t: 0 };
    const listSlugs = vi.fn(async () => ["knee"]);
    const guard = guardWith({ listSlugs }, clock);

    await guard.isKnownSlug("treatments", "knee");
    expect(listSlugs).toHaveBeenCalledTimes(2);

    clock.t = 500;
    await guard.isKnownSlug("treatments", "knee");
    expect(listSlugs).toHaveBeenCalledTimes(2);

    clock.t = 2000;
    await guard.isKnownSlug("treatments", "knee");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(listSlugs).toHaveBeenCalledTimes(4);
  });

  it("survives a source with no retired endpoint", async () => {
    const guard = guardWith({ listSlugs: async () => ["knee"] });
    await expect(guard.isKnownSlug("treatments", "knee")).resolves.toBe(true);
  });

  it("ignores a failing retired lookup rather than losing the whole section", async () => {
    const guard = guardWith({
      listSlugs: async () => ["knee"],
      listRetiredSlugs: async () => {
        throw new Error("404 on an older CMS");
      },
    });

    await expect(guard.isKnownSlug("treatments", "knee")).resolves.toBe(true);
  });

  it("forgets on demand, so a publish is reachable without waiting out the TTL", async () => {
    let published = ["knee"];
    const guard = guardWith({ listSlugs: async () => published });

    await expect(guard.isKnownSlug("treatments", "hip")).resolves.toBe(false);
    published = ["knee", "hip"];
    guard.forget();
    await expect(guard.isKnownSlug("treatments", "hip")).resolves.toBe(true);
  });
});

describe("cmsSlugSource", () => {
  it("reads retired slugs across pages", async () => {
    const request = vi.fn(async (path: string) => {
      const page = Number(new URL(path, "https://x").searchParams.get("page"));
      return page === 1
        ? { data: [{ slug: "a" }], meta: { pageCount: 2 } }
        : { data: [{ slug: "b" }], meta: { pageCount: 2 } };
    });

    const source = cmsSlugSource({ listSlugs: async () => [], request: request as never });
    await expect(source.listRetiredSlugs!("blog")).resolves.toEqual(["a", "b"]);
    expect(request.mock.calls[0]![0]).toContain("retired=1");
  });

  it("returns nothing when an older CMS has no retired endpoint", async () => {
    const source = cmsSlugSource({ listSlugs: async () => [], request: async () => null });
    await expect(source.listRetiredSlugs!("blog")).resolves.toEqual([]);
  });

  it("asks for slugs uncached, because a guard reading a stale list 404s real pages", async () => {
    const listSlugs = vi.fn(async () => ["a"]);
    const source = cmsSlugSource({ listSlugs, request: async () => null });
    await source.listSlugs("blog");
    expect(listSlugs).toHaveBeenCalledWith("blog", 0);
  });
});
