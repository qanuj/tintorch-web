/**
 * RSS.
 *
 * One feed for the blog, and one per tag - because the reason somebody
 * subscribes is usually a subject rather than a publication. A reader following
 * "security" does not want the hiring posts, and telling them to filter it
 * themselves is how a feed stops being read.
 *
 * RSS 2.0 rather than Atom: every reader takes it, and the sites already
 * advertise `feed.xml`. The self link is Atom's, which is the one part of Atom
 * RSS readers universally expect.
 */

export type FeedItem = {
  /** Path as the site serves it, leading slash. */
  path: string;
  title: string;
  /** Plain text or HTML - it is emitted in CDATA either way. */
  description?: string;
  published?: string | Date | null;
  author?: string;
  /** Tags. These are what the per-tag feeds are built from. */
  tags?: string[];
  /** Absolute URL of the post's image, for readers that show one. */
  image?: string;
};

function origin(siteUrl: string): string {
  return (siteUrl ?? "").replace(/\/+$/, "");
}

function absolute(siteUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${origin(siteUrl)}/${path.replace(/^\/+/, "")}`;
}

function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * CDATA, so a description carrying markup survives. The only sequence that can
 * break out is `]]>`, which is split across two sections rather than escaped -
 * there is no escaping inside CDATA.
 */
function cdata(value: string): string {
  return `<![CDATA[${value.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

/** RFC 822, which is what `<pubDate>` takes. Invalid dates are dropped. */
function rfc822(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toUTCString();
}

/**
 * A tag as it appears in a URL. Kept here so the feed a site links to and the
 * route that serves it cannot disagree about what "AI & ML" slugs to.
 */
export function tagSlug(tag: string): string {
  return tag
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Every tag in a set of items, with its post count, commonest first. */
export function feedTags(items: FeedItem[]): { tag: string; slug: string; count: number }[] {
  const counts = new Map<string, { tag: string; count: number }>();

  for (const item of items) {
    for (const tag of item.tags ?? []) {
      const slug = tagSlug(tag);
      if (!slug) continue;
      const found = counts.get(slug);
      if (found) found.count += 1;
      else counts.set(slug, { tag: tag.trim(), count: 1 });
    }
  }

  return [...counts.entries()]
    .map(([slug, value]) => ({ slug, ...value }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** The items carrying a tag, matched on the slug so case and spacing do not. */
export function itemsForTag(items: FeedItem[], slug: string): FeedItem[] {
  const wanted = tagSlug(slug);
  return items.filter((item) => (item.tags ?? []).some((tag) => tagSlug(tag) === wanted));
}

export function rssXml({
  siteUrl,
  title,
  description,
  feedPath,
  items,
  language = "en",
  limit = 50,
}: {
  siteUrl: string;
  title: string;
  description: string;
  /** Where this feed is served, for the self link: "/blog/feed.xml". */
  feedPath: string;
  items: FeedItem[];
  language?: string;
  limit?: number;
}): string {
  const base = origin(siteUrl);
  const self = absolute(siteUrl, feedPath);
  const newest = items[0]?.published;

  const entries = items.slice(0, limit).map((item) => {
    const link = absolute(siteUrl, item.path);
    const date = rfc822(item.published);

    return [
      "    <item>",
      `      <title>${escape(item.title)}</title>`,
      `      <link>${escape(link)}</link>`,
      /*
       * The URL as the id. `isPermaLink="true"` is the default and would have a
       * reader treat it as fetchable, which it is - but saying so explicitly
       * costs nothing and some readers are fussy about the attribute.
       */
      `      <guid isPermaLink="true">${escape(link)}</guid>`,
      ...(date ? [`      <pubDate>${date}</pubDate>`] : []),
      ...(item.author ? [`      <dc:creator>${cdata(item.author)}</dc:creator>`] : []),
      ...(item.description ? [`      <description>${cdata(item.description)}</description>`] : []),
      // One per tag: this is what a reader groups and filters on.
      ...(item.tags ?? []).map((tag) => `      <category>${escape(tag)}</category>`),
      ...(item.image
        ? [`      <enclosure url="${escape(absolute(siteUrl, item.image))}" type="image/jpeg"/>`]
        : []),
      "    </item>",
    ].join("\n");
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${escape(title)}</title>
    <link>${escape(base)}</link>
    <description>${escape(description)}</description>
    <language>${escape(language)}</language>
    <atom:link href="${escape(self)}" rel="self" type="application/rss+xml"/>
${newest ? `    <lastBuildDate>${rfc822(newest)}</lastBuildDate>\n` : ""}${entries.join("\n")}
  </channel>
</rss>
`;
}

/** An XML response with the caching a feed wants. */
export function feedResponse(xml: string, maxAge = 3600): Response {
  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": `public, max-age=${maxAge}`,
    },
  });
}
