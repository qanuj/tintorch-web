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

/**
 * How many times a read is attempted before it gives up.
 *
 * A build asks the CMS a few thousand questions in a row from one machine, and
 * one of them failing to connect used to fail the whole build: a site with two
 * thousand pages needs two thousand consecutive successes over the public
 * internet, which is not a thing that happens. The failures are not the CMS
 * being down - the request before and the request after both succeed - so they
 * are worth asking again rather than reporting.
 *
 * Only transient failures are retried. A 404 is an answer, a 401 is a wrong
 * key, and a 422 is a bad request; asking any of those twice gets the same
 * reply more slowly.
 */
export const MAX_ATTEMPTS = 3;

/** Backoff between attempts, in milliseconds. Short: a build is waiting. */
const BACKOFF_MS = [250, 1000];

/**
 * How long one attempt gets, headers and body together.
 *
 * Without a limit a stalled socket holds a build worker until the platform's
 * own timeout. Generous rather than tight, because the slowest thing here is a
 * hundred items with their bodies, which is a real payload over a real link
 * and not a sign that anything is wrong.
 */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Statuses worth asking about again: the CMS is busy, not answering "no". */
const TRANSIENT = new Set([408, 425, 429, 500, 502, 503, 504]);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class CmsError extends Error {
  readonly status: number | undefined;
  readonly path: string;
  /**
   * Whether asking again could plausibly answer differently.
   *
   * Carried on the error rather than worked out from the status, because the
   * two do not line up: a body that stops arriving halfway through is reported
   * against whatever status its headers carried, and a 200 that never finished
   * is every bit as transient as a connection that never opened. Deciding from
   * the status alone got that exact case wrong, and it is the one that fails
   * builds.
   */
  readonly transient: boolean;

  constructor(path: string, status?: number, cause?: unknown, transient = false) {
    super(status ? `[cms] ${status} ${path}` : `[cms] request failed: ${path}`, { cause });
    this.name = "CmsError";
    this.status = status;
    this.path = path;
    this.transient = transient;
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
  /** How long to wait for one attempt. Default 15s. */
  timeoutMs?: number;
  /** How many attempts a transient failure gets. Default 3; 1 disables retry. */
  attempts?: number;
  /** Injected in tests so backoff does not cost real seconds. */
  sleep?: (ms: number) => Promise<unknown>;
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
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const attempts = Math.max(1, options.attempts ?? MAX_ATTEMPTS);
  const sleep = options.sleep ?? wait;

  /**
   * A site has to build before the CMS is wired up, so a missing key is a soft
   * failure rather than a crash: reads answer null and pages fall back.
   */
  const configured = Boolean(baseUrl && key);

  async function attempt<T>(path: string, revalidate: number): Promise<T | null> {
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}/api/v1/content${path}`, {
        headers: { Authorization: `Bearer ${key}` },
        next: { revalidate, tags: tagsFor(path) },
        signal: AbortSignal.timeout(timeoutMs),
      } as RequestInit);
    } catch (cause) {
      // Nothing came back at all: a refused connection, a DNS failure, or a
      // timeout before the headers.
      throw new CmsError(path, undefined, cause, true);
    }

    if (response.status === 404) return null;
    /*
     * Loud, not null. Null means the CMS answered "no such thing"; anything
     * else has to throw, because a build's generateStaticParams decides what
     * exists - a swallowed 500 once shipped whole sections as 404s under a
     * green check.
     */
    if (!response.ok) {
      throw new CmsError(path, response.status, undefined, TRANSIENT.has(response.status));
    }

    try {
      return (await response.json()) as T;
    } catch (cause) {
      /*
       * The headers said 200 and then the body stopped. Transient whatever the
       * status was: the answer was on its way and did not finish arriving.
       * Malformed JSON lands here too and is retried once or twice for
       * nothing, which is a cheaper mistake than failing a build on a
       * half-delivered list.
       */
      throw new CmsError(path, response.status, cause, true);
    }
  }

  async function request<T>(path: string, revalidate = defaultRevalidate): Promise<T | null> {
    if (!configured) return null;

    let last: unknown;
    for (let at = 0; at < attempts; at++) {
      try {
        return await attempt<T>(path, revalidate);
      } catch (error) {
        last = error;
        const transient = error instanceof CmsError && error.transient;
        if (at === attempts - 1 || !transient) break;
        await sleep(BACKOFF_MS[at] ?? BACKOFF_MS[BACKOFF_MS.length - 1]!);
      }
    }
    throw last;
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
