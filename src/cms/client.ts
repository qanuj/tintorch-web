/**
 * The authenticated client for the TinTorch CMS delivery API.
 *
 * Six sites had written this file, and the six had drifted: one capped its
 * pagination loop and one did not, one deduplicated reads per request and one
 * did not, one threw on a 500 and one returned an empty list. The differences
 * were not decisions, they were the order the copies were taken in, and each
 * one cost a production incident before anybody noticed.
 *
 * So the transport lives here and the content model does not. A site still
 * writes its own readers - only the site knows that its `treatment` type calls
 * its body `content` and its summary `excerpt` - but it no longer writes the
 * fetch, the tags, the pagination or the error rules.
 */
import type { CmsItem, CmsMeta, ListOptions, ListResult } from "./types";

/** The tag every CMS fetch carries, so "revalidate everything" has one name. */
export const CMS_TAG = "cms";

/**
 * A runaway `pageCount` must not spin forever. Sixty pages of a hundred is
 * six thousand items, comfortably more than any type these sites hold, and a
 * ceiling that is hit is a bug worth hearing about rather than a hang.
 */
export const MAX_PAGES = 60;

export class CmsError extends Error {
  readonly status: number | undefined;
  readonly path: string;

  constructor(path: string, status?: number, cause?: unknown) {
    super(status ? `[cms] ${status} ${path}` : `[cms] request failed: ${path}`, { cause });
    this.name = "CmsError";
    this.status = status;
    this.path = path;
  }
}

export type CmsClientOptions = {
  /** The CMS origin. A trailing slash is harmless; http is upgraded to https. */
  baseUrl: string;
  /** A `ttck_` delivery key. Server-only, never exposed with NEXT_PUBLIC_. */
  key: string;
  /** Default cache window for a read, in seconds. */
  revalidate?: number;
  /** Injected for tests; defaults to the global. */
  fetch?: typeof globalThis.fetch;
};

/**
 * An http:// base would be redirected to https by the CMS, and a redirect
 * drops the Authorization header - which reads as "no content" rather than as
 * an error. Upgrade it here instead of debugging an empty site later.
 */
export function normaliseBaseUrl(url: string): string {
  return (url ?? "").replace(/\/+$/, "").replace(/^http:\/\//i, "https://");
}

/** `cms:blog`, `cms:treatment` - so a publish drops one type, not everything. */
export function tagsFor(path: string): string[] {
  const type = path.replace(/^\//, "").split(/[/?]/)[0];
  return type ? [CMS_TAG, `${CMS_TAG}:${type}`] : [CMS_TAG];
}

export type CmsClient = ReturnType<typeof createCmsClient>;

export function createCmsClient(options: CmsClientOptions) {
  const baseUrl = normaliseBaseUrl(options.baseUrl);
  const key = options.key ?? "";
  const defaultRevalidate = options.revalidate ?? 300;
  const doFetch = options.fetch ?? globalThis.fetch;

  /**
   * A site has to build before the CMS is wired up, so a missing key is a soft
   * failure rather than a crash: reads answer null and pages fall back.
   */
  const configured = Boolean(baseUrl && key);

  async function request<T>(path: string, revalidate = defaultRevalidate): Promise<T | null> {
    if (!configured) return null;

    let response: Response;
    try {
      response = await doFetch(`${baseUrl}/api/v1/content${path}`, {
        headers: { Authorization: `Bearer ${key}` },
        next: { revalidate, tags: tagsFor(path) },
      } as RequestInit);
    } catch (cause) {
      throw new CmsError(path, undefined, cause);
    }

    if (response.status === 404) return null;
    /*
     * Loud, not null. Null means the CMS answered "no such thing"; anything
     * else has to throw, because a build's generateStaticParams decides what
     * exists - a swallowed 500 once shipped whole sections as 404s under a
     * green check.
     */
    if (!response.ok) throw new CmsError(path, response.status);

    try {
      return (await response.json()) as T;
    } catch (cause) {
      throw new CmsError(path, response.status, cause);
    }
  }

  async function listItems(type: string, options: ListOptions = {}): Promise<ListResult> {
    const { page = 1, limit = 24, search, fields, revalidate } = options;
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set("q", search);
    if (fields) params.set("fields", fields);

    const body = await request<{ data: CmsItem[]; meta: CmsMeta }>(
      `/${type}?${params.toString()}`,
      revalidate,
    );
    return { items: body?.data ?? [], meta: body?.meta ?? null };
  }

  /**
   * Every item of a type, following pagination.
   *
   * Throws rather than truncating at the ceiling. A partial list is worse than
   * an error here: it is what a slug guard reads to decide what exists, and a
   * short list turns real pages into 404s and prunes real URLs out of the
   * sitemap.
   */
  async function listAllItems(
    type: string,
    options: { fields?: string; revalidate?: number; limit?: number } = {},
  ): Promise<CmsItem[]> {
    const all: CmsItem[] = [];
    const limit = options.limit ?? 100;

    for (let page = 1; page <= MAX_PAGES; page++) {
      const { items, meta } = await listItems(type, { ...options, page, limit });
      all.push(...items);
      if (!meta?.hasMore || page >= (meta?.pageCount ?? 1)) return all;
    }

    throw new CmsError(`/${type}`, undefined, new Error(`more than ${MAX_PAGES} pages`));
  }

  async function getItem(type: string, slug: string): Promise<CmsItem | null> {
    const body = await request<{ data: CmsItem }>(`/${type}/${encodeURIComponent(slug)}`);
    return body?.data ?? null;
  }

  /**
   * Where a slug lives now, if it has moved.
   *
   * Authors re-slug content - `bangalore` became `bengaluru` - and the CMS
   * keeps the old URL working by 301ing it to the current one. `fetch` follows
   * that redirect, so what comes back is the item at its new slug; comparing
   * tells us the request came in on a retired URL and where it should go.
   *
   * Null when the slug is simply unknown, which is a 404 and not a redirect.
   */
  async function currentSlug(type: string, slug: string): Promise<string | null> {
    const item = await getItem(type, slug);
    if (!item) return null;
    return item.slug !== slug ? item.slug : null;
  }

  /** Slugs of every published item of a type, for a sitemap or a slug guard. */
  async function listSlugs(type: string, revalidate = 3600): Promise<string[]> {
    const items = await listAllItems(type, { fields: "slug", revalidate });
    return items.map((item) => item.slug).filter(Boolean);
  }

  return {
    baseUrl,
    key,
    configured,
    /** The same fetch every read uses, so a write goes through it too. */
    fetch: doFetch,
    request,
    listItems,
    listAllItems,
    listSlugs,
    getItem,
    currentSlug,
  };
}
