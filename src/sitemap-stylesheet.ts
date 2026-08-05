/**
 * The stylesheet a browser uses when a person opens a sitemap.
 *
 * A sitemap is XML for crawlers, but people do open them - and a browser shows
 * the raw tree with a warning about missing style information, which reads like
 * something is broken. With this it renders as a page: an index as a list of
 * child sitemaps, a urlset as a table of URLs.
 *
 * XSLT 1.0, because that is what browsers implement - not a subset of 2.0, and
 * no extension functions.
 *
 * Themed per site rather than fixed. The whole reason to render this for people
 * is that it looks like the site it belongs to; a shared file in one palette
 * would look like somebody else's page on four of the five.
 */

export type SitemapTheme = {
  /** Page background. */
  background: string;
  /** Table header and any raised surface. */
  surface: string;
  /** Hairlines. */
  border: string;
  /** Links and counts. */
  accent: string;
  /** Headings. */
  heading: string;
  /** Body copy. */
  text: string;
  /** Labels and dates. */
  muted: string;
  /** A CSS font stack. */
  font: string;
};

/** Ink and cyan on dark - the palette this started life in. */
export const DEFAULT_SITEMAP_THEME: SitemapTheme = {
  background: "#0b1b33",
  surface: "#12294a",
  border: "#1e3a63",
  accent: "#00aeef",
  heading: "#f2f6fc",
  text: "#dce6f4",
  muted: "#9fb0c9",
  font: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
};

const escape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function sitemapStylesheetXsl({
  title,
  theme,
}: {
  /** Shown in the tab: "Sitemap - e10 Infotech". */
  title: string;
  theme?: Partial<SitemapTheme>;
}): string {
  const t = { ...DEFAULT_SITEMAP_THEME, ...theme };

  return `<?xml version="1.0" encoding="UTF-8"?>
<!--
  Sitemap stylesheet.

  A sitemap is XML for crawlers, but people open them too - and a browser shows
  the raw tree with a warning about missing style information. This renders both
  shapes: a sitemapindex as a list of child sitemaps, a urlset as a table of
  URLs. XSLT 1.0, because that is what browsers implement.
-->
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:s="http://www.sitemaps.org/schemas/sitemap/0.9">

  <xsl:output method="html" encoding="UTF-8" indent="yes"/>

  <xsl:template match="/">
    <html lang="en">
      <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <!-- A view of the index is not itself a page worth indexing. -->
        <meta name="robots" content="noindex"/>
        <title>${escape(title)}</title>
        <style>
          :root {
            --bg: ${t.background};
            --surface: ${t.surface};
            --line: ${t.border};
            --accent: ${t.accent};
            --heading: ${t.heading};
            --muted: ${t.muted};
          }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 48px 24px;
            background: var(--bg);
            color: ${t.text};
            font: 15px/1.6 ${t.font};
          }
          main { max-width: 1100px; margin: 0 auto; }
          h1 { margin: 0 0 4px; font-size: 28px; color: var(--heading); letter-spacing: -0.02em; }
          .lede { margin: 0 0 28px; color: var(--muted); }
          .count { color: var(--accent); font-variant-numeric: tabular-nums; }
          table { width: 100%; border-collapse: collapse; }
          th, td {
            text-align: left;
            padding: 10px 14px;
            border-bottom: 1px solid var(--line);
            vertical-align: top;
          }
          th {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.16em;
            color: var(--muted);
            background: var(--surface);
          }
          tr:hover td { background: color-mix(in srgb, var(--accent) 8%, transparent); }
          a { color: var(--accent); text-decoration: none; word-break: break-all; }
          a:hover { text-decoration: underline; }
          time { color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
          footer { margin-top: 28px; color: var(--muted); font-size: 13px; }
          @media (max-width: 640px) {
            body { padding: 28px 16px; }
            th:last-child, td:last-child { display: none; }
          }
        </style>
      </head>
      <body>
        <main>
          <xsl:apply-templates/>
        </main>
      </body>
    </html>
  </xsl:template>

  <!-- An index: one row per child sitemap. -->
  <xsl:template match="s:sitemapindex">
    <h1>Sitemap index</h1>
    <p class="lede">
      <span class="count"><xsl:value-of select="count(s:sitemap)"/></span>
      <xsl:text> sitemaps. Each one groups a single content type.</xsl:text>
    </p>
    <table>
      <tr><th>Sitemap</th><th>Last modified</th></tr>
      <xsl:for-each select="s:sitemap">
        <tr>
          <td><a href="{s:loc}"><xsl:value-of select="s:loc"/></a></td>
          <td><time><xsl:value-of select="substring(s:lastmod, 1, 10)"/></time></td>
        </tr>
      </xsl:for-each>
    </table>
    <footer>Generated for crawlers; this view is for people.</footer>
  </xsl:template>

  <!-- A urlset: one row per URL. -->
  <xsl:template match="s:urlset">
    <h1>Sitemap</h1>
    <p class="lede">
      <span class="count"><xsl:value-of select="count(s:url)"/></span>
      <xsl:text> URLs.</xsl:text>
    </p>
    <table>
      <tr><th>URL</th><th>Last modified</th></tr>
      <xsl:for-each select="s:url">
        <tr>
          <td><a href="{s:loc}"><xsl:value-of select="s:loc"/></a></td>
          <td><time><xsl:value-of select="substring(s:lastmod, 1, 10)"/></time></td>
        </tr>
      </xsl:for-each>
    </table>
    <footer>Generated for crawlers; this view is for people.</footer>
  </xsl:template>
</xsl:stylesheet>
`;
}

/** Served from a route so the theme can come from the CMS rather than a file. */
export function stylesheetResponse(xsl: string, maxAge = 86400): Response {
  return new Response(xsl, {
    headers: {
      "Content-Type": "application/xslt+xml; charset=utf-8",
      "Cache-Control": `public, max-age=${maxAge}`,
    },
  });
}
