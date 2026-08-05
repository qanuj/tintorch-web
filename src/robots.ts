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
 * Paths that are never content. `/api/` is machinery, and the two Next
 * internals are files a crawler gains nothing from and spends budget on.
 */
export const DEFAULT_DISALLOW = ["/api/", "/_next/", "/_vercel/"];

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
  "CCBot",
  "meta-externalagent",
  "Bytespider",
];

export type RobotsOptions = {
  siteUrl: string;
  /** Added to the defaults rather than replacing them. */
  disallow?: string[];
  /** Sitemaps beyond /sitemap.xml - a news or video sitemap, say. */
  sitemaps?: string[];
  /** False writes a named block for every crawler in AI_CRAWLERS. */
  allowAi?: boolean;
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

  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: blocked },
      ...(allowAi ? [] : [{ userAgent: AI_CRAWLERS, disallow: "/" }]),
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

  for (const rule of Array.isArray(rules.rules) ? rules.rules : [rules.rules]) {
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
