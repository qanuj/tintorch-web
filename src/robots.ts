import type { MetadataRoute } from "next";

/**
 * robots.txt.
 *
 * Two jobs: keep crawlers out of the handful of paths that are machinery rather
 * than content, and point at the sitemap index - which is the only reliable way
 * a crawler finds a sitemap it was never submitted.
 *
 * AI crawlers are allowed by default. These sites publish an llms.txt precisely
 * so they are read, and blocking the crawler while advertising a file for it
 * would be a contradiction. A site that wants them out passes `allowAi: false`,
 * and gets a named block rather than a blanket one, because that is the only
 * form the named crawlers honour.
 */

/**
 * Paths that are never content.
 *
 * `/_next/image` is the optimizer: every picture on the site is also reachable
 * there, under a URL carrying the source as a query parameter. Indexed, those
 * become duplicates of the real images that lead nowhere a person would want to
 * land.
 */
export const DEFAULT_DISALLOW = ["/api/", "/_next/image", "/_vercel/"];

/**
 * Deliberately allowed.
 *
 * `/_next/static` holds the CSS and JS. A crawler that cannot fetch those
 * renders the site as a wall of unstyled text and judges it accordingly - which
 * is what a blanket `/_next/` block does.
 */
export const DEFAULT_ALLOW = ["/", "/_next/static/"];

/**
 * Image crawlers need the optimizer. Content imagery is served through it -
 * that is what makes a 160px thumbnail cost 160px worth of bytes - so blocking
 * the path for these would hide every picture on the site from image search
 * rather than merely hiding duplicates.
 */
export const IMAGE_CRAWLERS = ["Googlebot-Image", "Bingbot-Image"];

/**
 * The crawlers that read for a model rather than for a search index. Named
 * because a blanket `User-agent: *` block does not reach them - each of these
 * looks for its own token first.
 */
export const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "meta-externalagent",
];

/**
 * Crawlers that read for a training set and cite nobody.
 *
 * Separated from the ones above because the trade is different: an AI search
 * crawler sends people back, and Google-Extended is what feeds AI Overviews, so
 * blocking those costs visibility. These offer nothing in return.
 */
export const AI_SCRAPERS = ["Bytespider", "CCBot", "AI2Bot"];

export type RobotsOptions = {
  siteUrl: string;
  /** Added to the defaults rather than replacing them. */
  disallow?: string[];
  /** Sitemaps beyond /sitemap.xml - a news or video sitemap, say. */
  sitemaps?: string[];
  /** False writes a named block for every crawler in AI_CRAWLERS. */
  allowAi?: boolean;
  /** False lets the training-only scrapers in. They are blocked by default. */
  blockScrapers?: boolean;
  /** Groups appended after the defaults, for anything a site needs to say. */
  extraRules?: NonNullable<MetadataRoute.Robots["rules"]>;
  /**
   * A staging or preview origin has no business in an index, and the surest way
   * to keep it out is to say so here rather than to rely on nobody linking it.
   */
  indexable?: boolean;
};

function origin(siteUrl: string): string {
  return (siteUrl ?? "").replace(/\/+$/, "");
}

/** The rules, as Next's `app/robots.ts` wants them. */
export function robotsRules({
  siteUrl,
  disallow = [],
  sitemaps = [],
  allowAi = true,
  blockScrapers = true,
  extraRules = [],
  indexable = true,
}: RobotsOptions): MetadataRoute.Robots {
  const base = origin(siteUrl);
  const blocked = [...new Set([...DEFAULT_DISALLOW, ...disallow])];

  if (!indexable) {
    return {
      rules: [{ userAgent: "*", disallow: "/" }],
      ...(base ? { host: base } : {}),
    };
  }

  /*
   * A named group replaces the wildcard rather than adding to it, so every
   * group has to repeat what it needs. Leaving it out is how the optimizer was
   * once left open to Googlebot alone.
   */
  return {
    rules: [
      { userAgent: "*", allow: DEFAULT_ALLOW, disallow: blocked },
      {
        userAgent: IMAGE_CRAWLERS,
        allow: [...DEFAULT_ALLOW, "/_next/image"],
        disallow: blocked.filter((path) => path !== "/_next/image"),
      },
      ...(allowAi
        ? [{ userAgent: AI_CRAWLERS, allow: DEFAULT_ALLOW, disallow: blocked }]
        : [{ userAgent: AI_CRAWLERS, disallow: "/" }]),
      ...(blockScrapers ? [{ userAgent: AI_SCRAPERS, disallow: "/" }] : []),
      ...extraRules,
    ],
    ...(base
      ? { sitemap: [`${base}/sitemap.xml`, ...sitemaps.map((path) => `${base}${path}`)], host: base }
      : {}),
  };
}

/** The same thing as text, for a site serving it from a route handler. */
export function robotsTxt(options: RobotsOptions): string {
  const rules = robotsRules(options);
  const lines: string[] = [];

  // `rules` is one group or many, so it is normalised before it is walked.
  const groups = (Array.isArray(rules.rules) ? rules.rules : [rules.rules]).filter(Boolean);

  for (const rule of groups) {
    if (!rule) continue;
    const agents = Array.isArray(rule.userAgent) ? rule.userAgent : [rule.userAgent ?? "*"];
    for (const agent of agents) lines.push(`User-agent: ${agent}`);

    for (const allow of toList(rule.allow)) lines.push(`Allow: ${allow}`);
    for (const deny of toList(rule.disallow)) lines.push(`Disallow: ${deny}`);
    lines.push("");
  }

  for (const sitemap of toList(rules.sitemap)) lines.push(`Sitemap: ${sitemap}`);

  return `${lines.join("\n").trimEnd()}\n`;
}

function toList(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}
