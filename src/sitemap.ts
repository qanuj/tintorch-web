/**
 * Sitemaps.
 *
 * One index at /sitemap.xml pointing at one file per content type, because a
 * single flat sitemap tells you nothing when it goes wrong: "12 of 4,000 URLs
 * not indexed" is a number, while "the whole blog file is failing" is a lead.
 *
 * A type with no records is left out of the index entirely. An empty `<urlset>`
 * is a valid document that Search Console reports as an error, and a link to
 * one is a link to a problem the site does not have.
 *
 * Sites hand in their own URLs. Which types exist, where each one is published
 * and how to list it are the things these sites genuinely disagree about, and a
 * shared package that decided any of it would be a package nobody could adopt.
 */

/**
 * The protocol's ceiling: 50,000 URLs or 50 MB uncompressed per file. Anything
 * over it is split, which is what the index is for.
 */
export const SITEMAP_MAX_URLS = 50_000;

export type SitemapUrl = {
  /** Path as the site serves it, leading slash, no trailing one. */
  path: string;
  lastModified?: string | Date | null;
};

/** One content type's worth of URLs. */
export type SitemapSection = {
  /** Filename stem: "blog" becomes /sitemap/blog.xml. */
  key: string;
  /** How many URLs it holds. Zero keeps it out of the index. */
  total: number;
  lastModified?: string | Date | null;
};

/**
 * `&` in a query string is the one that actually bites: an unescaped ampersand
 * makes the whole document fail to parse, and a sitemap that does not parse is
 * a sitemap that is silently ignored.
 */
export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** W3C datetime, which is what `<lastmod>` takes. Invalid dates are dropped. */
function lastmod(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function head(stylesheet?: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    // Optional: it only makes the file readable to a person who opens it.
    ...(stylesheet ? [`<?xml-stylesheet type="text/xsl" href="${xmlEscape(stylesheet)}"?>`] : []),
  ].join("\n");
}

/** Origin with any trailing slash removed, so joins cannot double up. */
function origin(siteUrl: string): string {
  return (siteUrl ?? "").replace(/\/+$/, "");
}

/**
 * The absolute URL for a path.
 *
 * The root keeps its slash - "https://example.com/" is the page - and nothing
 * else gets one. A site that serves /about and redirects /about/ to it turns
 * every trailing slash in a sitemap into a "Page with redirect" verdict, and
 * that is not a thing anyone notices from the site itself.
 */
export function sitemapUrl(siteUrl: string, path: string): string {
  const clean = path === "/" || path === "" ? "/" : `/${path.replace(/^\/+/, "").replace(/\/+$/, "")}`;
  return `${origin(siteUrl)}${clean}`;
}

/** How many files a section needs. Zero when it has no records. */
export function sectionPageCount(total: number, pageSize = SITEMAP_MAX_URLS): number {
  return total > 0 ? Math.ceil(total / pageSize) : 0;
}

/**
 * Where a section's file lives. The first page keeps the plain name so an
 * existing /sitemap/blog.xml does not move; later pages are numbered.
 */
export function sectionPath(key: string, page = 1): string {
  return page <= 1 ? `/sitemap/${key}.xml` : `/sitemap/${key}-${page}.xml`;
}

/** Read `blog-2` back into its key and page. */
export function parseSectionPath(segment: string): { key: string; page: number } {
  const name = segment.replace(/\.xml$/i, "");
  const match = /^(.*)-(\d+)$/.exec(name);
  if (!match) return { key: name, page: 1 };
  return { key: match[1]!, page: Number(match[2]) };
}

/**
 * The index at /sitemap.xml.
 *
 * Sections with no records are dropped rather than linked to an empty file.
 */
export function sitemapIndexXml({
  siteUrl,
  sections,
  stylesheet,
  pageSize = SITEMAP_MAX_URLS,
}: {
  siteUrl: string;
  sections: SitemapSection[];
  stylesheet?: string;
  pageSize?: number;
}): string {
  const entries: string[] = [];

  for (const section of sections) {
    const pages = sectionPageCount(section.total, pageSize);
    const when = lastmod(section.lastModified);

    for (let page = 1; page <= pages; page++) {
      const loc = xmlEscape(`${origin(siteUrl)}${sectionPath(section.key, page)}`);
      entries.push(
        when
          ? `  <sitemap><loc>${loc}</loc><lastmod>${when}</lastmod></sitemap>`
          : `  <sitemap><loc>${loc}</loc></sitemap>`,
      );
    }
  }

  return `${head(stylesheet)}
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join("\n")}
</sitemapindex>
`;
}

/** One section's file. */
export function urlSetXml({
  siteUrl,
  urls,
  stylesheet,
}: {
  siteUrl: string;
  urls: SitemapUrl[];
  stylesheet?: string;
}): string {
  const entries = urls.map((url) => {
    const loc = xmlEscape(sitemapUrl(siteUrl, url.path));
    const when = lastmod(url.lastModified);
    return when
      ? `  <url><loc>${loc}</loc><lastmod>${when}</lastmod></url>`
      : `  <url><loc>${loc}</loc></url>`;
  });

  return `${head(stylesheet)}
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join("\n")}
</urlset>
`;
}

/** The slice of URLs a numbered file holds. */
export function sitemapPage<T>(urls: T[], page: number, pageSize = SITEMAP_MAX_URLS): T[] {
  const start = (Math.max(1, page) - 1) * pageSize;
  return urls.slice(start, start + pageSize);
}

/** An XML response with the caching a sitemap wants. */
export function sitemapResponse(xml: string, maxAge = 3600): Response {
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": `public, max-age=${maxAge}`,
    },
  });
}

/* ── The whole thing, for a site that wants it built ────────────────────── */

/**
 * A section, and how to list it.
 *
 * `total` exists so the index does not have to fetch every URL of every type
 * just to learn which types are empty - most CMS listings report a count in
 * their first page of results. Without one, the list is used.
 */
export type SitemapSource = {
  key: string;
  list: () => Promise<SitemapUrl[]>;
  total?: () => Promise<number>;
  lastModified?: string | Date | null;
};

/**
 * Handlers for /sitemap.xml and /sitemap/<key>.xml.
 *
 * ```ts
 * const sitemap = sitemapHandlers({ siteUrl: site.url, sources, stylesheet: "/sitemap.xsl" });
 * export const GET = () => sitemap.index();
 * ```
 */
export function sitemapHandlers({
  siteUrl,
  sources,
  stylesheet,
  pageSize = SITEMAP_MAX_URLS,
  maxAge = 3600,
}: {
  siteUrl: string;
  sources: SitemapSource[];
  stylesheet?: string;
  pageSize?: number;
  maxAge?: number;
}) {
  return {
    async index(): Promise<Response> {
      const sections = await Promise.all(
        sources.map(async (source) => ({
          key: source.key,
          total: source.total ? await source.total() : (await source.list()).length,
          lastModified: source.lastModified,
        })),
      );

      return sitemapResponse(
        sitemapIndexXml({ siteUrl, sections, stylesheet, pageSize }),
        maxAge,
      );
    },

    /**
     * One section. A key nothing publishes is a 404 rather than an empty
     * document, because an empty sitemap is an error in Search Console and a
     * 404 is just a URL that is not there.
     */
    async section(segment: string): Promise<Response> {
      const { key, page } = parseSectionPath(segment);
      const source = sources.find((entry) => entry.key === key);
      if (!source) return new Response("Not found", { status: 404 });

      const urls = sitemapPage(await source.list(), page, pageSize);
      if (!urls.length) return new Response("Not found", { status: 404 });

      return sitemapResponse(urlSetXml({ siteUrl, urls, stylesheet }), maxAge);
    },
  };
}
