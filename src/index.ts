/**
 * Shared pieces for TinTorch CMS sites.
 *
 * What lives here is the code that talks to somebody else: badge providers,
 * ownership verifications, measurement scripts. It was copied into four
 * codebases and drifted in all four - a sort-order bug fixed in one and not the
 * others, an alt attribute improved in one and not the others.
 *
 * What does not live here is anything a site should be free to disagree about.
 * No styling, no CMS client, no layout: components take data in and take every
 * class name as a prop, because the one thing these sites never share is how
 * they look.
 */

/*
 * Split across three files rather than one, because the "use client" directive
 * is per file: with the whole lot in one, `selectFooterBadges` - a pure
 * function over CMS items - was marked as client code, and calling it from a
 * server component failed the build. Only the component that needs the current
 * path is a client component.
 */
export { BADGE_FIELDS, badgeAlt, selectFooterBadges, withRefurl, type SiteBadge } from "./badges";
export { BadgeLink } from "./badge-link";
export { BadgeRow } from "./badge-row";

export { Analytics, AnalyticsNoScript, type SiteAnalytics } from "./analytics";

export { verificationMetadata, type SiteVerification } from "./verification";

/*
 * The files every site owes a crawler. Server-side only - no React, no client
 * boundary - so a route handler can call them directly.
 */
export {
  SITEMAP_MAX_URLS,
  parseSectionPath,
  sectionPageCount,
  sectionPath,
  sitemapHandlers,
  sitemapIndexXml,
  sitemapPage,
  sitemapResponse,
  sitemapUrl,
  urlSetXml,
  xmlEscape,
  type SitemapSection,
  type SitemapSource,
  type SitemapUrl,
} from "./sitemap";

export {
  DEFAULT_SITEMAP_THEME,
  sitemapStylesheetXsl,
  stylesheetResponse,
  type SitemapTheme,
} from "./sitemap-stylesheet";

export { AI_CRAWLERS, DEFAULT_DISALLOW, robotsRules, robotsTxt, type RobotsOptions } from "./robots";

export { llmsResponse, llmsTxt, type LlmsLink, type LlmsSection } from "./llms";

export {
  feedResponse,
  feedTags,
  itemsForTag,
  rssXml,
  tagSlug,
  type FeedItem,
} from "./feed";
