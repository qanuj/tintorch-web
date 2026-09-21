/**
 * Which slugs a section actually publishes, for the edge to check before a
 * page renders.
 *
 * A site that renders on demand caches what visitors read, which is what you
 * want - but a render writes a cache entry whether it produced a page or a
 * 404, and the slugs a scanner invents have no limit. Without a guard, one
 * afternoon of somebody's crawler fills the cache with 404s.
 *
 * Three rules, each of which a hand-written copy of this got wrong somewhere:
 *
 *   - Fail open. An unknown list lets the request through to the page, which
 *     does its own lookup and 404s properly. Refusing on a missing list turns
 *     one failed fetch into a site that answers 404 to everything.
 *   - Never truncate silently. A partial list is not fail-open, it is a site
 *     that 404s real pages, so hitting the page ceiling throws.
 *   - Include retired slugs. They are not published any more, but they still
 *     deserve the 301 the page itself will issue.
 *
 * This module holds no environment of its own: a site builds the loader with
 * its own CMS client, so the key is read in one place.
 */

/** How long a fetched list is served before a refresh starts. */
const DEFAULT_TTL_MS = 5 * 60_000;

/** A ceiling that is reached is a bug to hear about, not a list to truncate. */
const MAX_PAGES = 60;

export type SlugSource = {
  /** Every published slug of a type. */
  listSlugs(type: string): Promise<string[]>;
  /**
   * Slugs that have been retired. Best effort: an older CMS has no such
   * endpoint, and the guard is still correct without them, just stricter.
   */
  listRetiredSlugs?(type: string): Promise<string[]>;
};

export type SlugGuardOptions<Section extends string> = {
  /** Path prefix -> the CMS type whose slugs answer beneath it. */
  sections: Record<Section, string>;
  source: SlugSource;
  ttlMs?: number;
  /** Injected in tests so a stale window can be crossed without waiting. */
  now?: () => number;
};

export type SlugGuard<Section extends string> = {
  /**
   * Whether a section publishes this slug. True when the answer is not yet
   * known, which is the fail-open case.
   */
  isKnownSlug(section: Section, slug: string): Promise<boolean>;
  /** Drop everything and reload on the next question. Used after a publish. */
  forget(): void;
  /** What the guard currently believes, for a health endpoint or a test. */
  snapshot(): Record<string, number>;
};

export function createSlugGuard<Section extends string>(
  options: SlugGuardOptions<Section>,
): SlugGuard<Section> {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const now = options.now ?? Date.now;
  const sections = Object.keys(options.sections) as Section[];

  let known: Map<Section, Set<string>> | null = null;
  /*
   * Separate from `loadedAt`, because "never tried" and "tried at time zero"
   * are different answers and a single number cannot hold both.
   */
  let attempted = false;
  let loadedAt = 0;
  let inFlight: Promise<void> | null = null;

  async function load(): Promise<Map<Section, Set<string>>> {
    const lists = await Promise.all(
      sections.map(async (section) => {
        const type = options.sections[section];
        const [current, retired] = await Promise.all([
          options.source.listSlugs(type),
          options.source.listRetiredSlugs?.(type).catch(() => []) ?? Promise.resolve([]),
        ]);
        return [section, new Set([...current, ...retired])] as const;
      }),
    );
    return new Map(lists);
  }

  function refresh(): Promise<void> {
    inFlight ??= load()
      .then((next) => {
        known = next;
        attempted = true;
        loadedAt = now();
      })
      .catch(() => {
        /*
         * Keep what we had, and mark the attempt so a down CMS is retried on a
         * schedule rather than on every request.
         */
        attempted = true;
        loadedAt = now();
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }

  return {
    async isKnownSlug(section, slug) {
      // The very first question waits; a later stale one is answered from what
      // we have while the refresh runs behind it.
      if (!attempted) await refresh();
      else if (now() - loadedAt > ttlMs) void refresh();

      const set = known?.get(section);
      if (!set || set.size === 0) return true;
      return set.has(slug);
    },

    forget() {
      known = null;
      attempted = false;
      loadedAt = 0;
    },

    snapshot() {
      const out: Record<string, number> = {};
      for (const [section, set] of known ?? []) out[section] = set.size;
      return out;
    },
  };
}

/**
 * A source backed by the delivery API.
 *
 * Kept separate from the guard so a test can drive the guard with a fake, and
 * so a site that holds its slugs somewhere else can say so.
 */
export function cmsSlugSource(cms: {
  listSlugs(type: string, revalidate?: number): Promise<string[]>;
  request<T>(path: string, revalidate?: number): Promise<T | null>;
}): SlugSource {
  return {
    listSlugs: (type) => cms.listSlugs(type, 0),

    async listRetiredSlugs(type) {
      const out: string[] = [];
      for (let page = 1; page <= MAX_PAGES; page++) {
        const body = await cms.request<{
          data?: { slug?: string }[];
          meta?: { pageCount?: number };
        }>(`/${type}?retired=1&limit=100&page=${page}&fields=slug`, 0);
        if (!body) return out;
        for (const row of body.data ?? []) if (row.slug) out.push(row.slug);
        if (page >= (body.meta?.pageCount ?? 1)) return out;
      }
      throw new Error(`[slug-guard] ${type}: more than ${MAX_PAGES} pages of retired slugs`);
    },
  };
}
