/**
 * llms.txt.
 *
 * A model reading a site has to render JavaScript, guess at navigation and work
 * out which of forty pages actually answer anything. This is the same site as a
 * list: what it is, then its pages grouped by kind, each with a one-line
 * summary. Markdown, because that is the format the convention settled on and
 * the format a model reads best.
 *
 * Every URL is absolute. The file gets quoted, chunked and passed around
 * without its origin, and a relative link in a chunk is a link to nothing.
 */

export type LlmsLink = {
  /** Path as the site serves it, or an absolute URL. */
  path: string;
  title: string;
  /** One line. Anything longer is flattened to a single line. */
  summary?: string;
};

export type LlmsSection = {
  title: string;
  links: LlmsLink[];
};

function origin(siteUrl: string): string {
  return (siteUrl ?? "").replace(/\/+$/, "");
}

function absolute(siteUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${origin(siteUrl)}/${path.replace(/^\/+/, "")}`;
}

/**
 * One line, no markdown that would break the list item.
 *
 * A summary comes out of a CMS field that may hold newlines, and a newline
 * inside a list item ends the item - which silently truncates every entry after
 * the first that has one.
 */
function oneLine(value: string, max = 200): string {
  const flat = value.replace(/\s+/g, " ").replace(/[[\]]/g, "").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/**
 * Build the file.
 *
 * Empty sections are dropped: a heading with nothing under it tells a reader
 * the site has that kind of content and then fails to show any.
 */
export function llmsTxt({
  siteUrl,
  name,
  summary,
  notes,
  sections,
}: {
  siteUrl: string;
  /** The site, as it calls itself. */
  name: string;
  /** The blockquote under the title - one line on what this is. */
  summary?: string;
  /** Paragraphs after the summary: what the business does, how to get in touch. */
  notes?: string[];
  sections: LlmsSection[];
}): string {
  const lines: string[] = [`# ${name}`];

  if (summary?.trim()) lines.push("", `> ${oneLine(summary)}`);
  for (const note of notes ?? []) {
    if (note?.trim()) lines.push("", oneLine(note, 500));
  }

  for (const section of sections) {
    const links = (section.links ?? []).filter((link) => link?.path && link?.title);
    if (!links.length) continue;

    lines.push("", `## ${section.title}`, "");
    for (const link of links) {
      const url = absolute(siteUrl, link.path);
      const note = link.summary?.trim() ? `: ${oneLine(link.summary)}` : "";
      lines.push(`- [${oneLine(link.title, 120)}](${url})${note}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

/** A text response with the caching this wants. */
export function llmsResponse(text: string, maxAge = 3600): Response {
  return new Response(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": `public, max-age=${maxAge}`,
    },
  });
}
