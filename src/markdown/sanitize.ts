/**
 * The allowlist a rendered CMS body is filtered through.
 *
 * Exported as data rather than as a function, because the sites that sanitise
 * do it with `sanitize-html` and this package does not want that dependency -
 * and because a site occasionally has to add one tag (an `<iframe>` for an
 * embed it controls) without forking the other forty.
 *
 * This is the second layer. The first is `escapeRawHtml`, which takes an
 * author's tags out before the Markdown is parsed at all. Running both is not
 * redundant: the escaper decides what an author may write, the allowlist
 * decides what the renderer may emit, and the pair is what keeps a compromised
 * editor account from reaching a reader's browser.
 */

export type SanitizeAllowlist = {
  allowedTags: string[];
  allowedAttributes: Record<string, string[]>;
  allowedSchemes: string[];
  allowedSchemesByTag: Record<string, string[]>;
};

export const SANITIZE_ALLOWLIST: SanitizeAllowlist = {
  allowedTags: [
    "h1", "h2", "h3", "h4", "h5", "h6",
    "p", "blockquote", "pre", "code", "span", "div", "hr", "br",
    "ul", "ol", "li",
    "strong", "em", "b", "i", "u", "s", "del", "ins", "sub", "sup", "mark", "small",
    "a", "img",
    "table", "thead", "tbody", "tfoot", "tr", "th", "td",
    "figure", "figcaption", "details", "summary",
  ],
  allowedAttributes: {
    a: ["href", "name", "target", "rel", "title", "class"],
    img: ["src", "alt", "title", "width", "height", "loading", "class"],
    code: ["class"],
    span: ["class"],
    div: ["class"],
    h3: ["class"],
    blockquote: ["class"],
    details: ["class", "open"],
    th: ["align", "colspan", "rowspan", "scope"],
    td: ["align", "colspan", "rowspan"],
  },
  /** No `javascript:`, and no `data:` outside an image. */
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { img: ["http", "https", "data"] },
};

/**
 * What an external link should carry.
 *
 * A CMS body links out to sources and directories. Those open in a new tab and
 * disclaim the endorsement; `noopener` is the part that matters, because
 * without it the opened page can navigate this one.
 */
export function externalLinkAttributes(href: string): Record<string, string> | null {
  if (!/^https?:\/\//i.test(href)) return null;
  return { rel: "nofollow noopener noreferrer", target: "_blank" };
}
