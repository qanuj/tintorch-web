/**
 * Markdown with raw HTML neutralised.
 *
 * Markdown allows embedded HTML, which means a body can carry a `<script>`, an
 * `<iframe>` pointing anywhere, or a tag whose attributes break the layout of
 * whatever renders it. Sanitising the output afterwards catches the dangerous
 * part, but it is a denylist race: every consuming site has to run the same
 * sanitiser with the same allowlist, forever.
 *
 * So HTML is not a thing an author can write here: tags are dropped and the
 * text inside them kept. Two things are left alone, because neither is a tag:
 *
 *   - code spans and fenced code, where `<div>` is the subject, not markup
 *   - autolinks, `<https://example.com>`, which CommonMark defines as a link
 *
 * Blocks the CMS expands itself (`:::card`, `:::embed`) produce HTML *after*
 * this runs, so they are unaffected - they are ours, not the author's.
 */
const AUTOLINK = /^<(?:https?:\/\/[^\s<>]+|mailto:[^\s<>]+|[\w.+-]+@[\w.-]+\.\w+)>/i;

export function escapeRawHtml(md: string): string {
  const source = md ?? "";
  let out = "";
  let i = 0;

  while (i < source.length) {
    const char = source[i]!;

    // Fenced code: copy through to the closing fence, or to the end.
    if ((char === "`" || char === "~") && (i === 0 || source[i - 1] === "\n")) {
      const fence = source.slice(i).match(/^(`{3,}|~{3,})/)?.[1];
      if (fence) {
        const end = source.indexOf(`\n${fence}`, i + fence.length);
        const stop = end === -1 ? source.length : end + fence.length + 1;
        out += source.slice(i, stop);
        i = stop;
        continue;
      }
    }

    // Inline code: `<b>` inside backticks is text about a tag, not a tag.
    if (char === "`") {
      const ticks = source.slice(i).match(/^`+/)![0];
      const end = source.indexOf(ticks, i + ticks.length);
      const stop = end === -1 ? i + ticks.length : end + ticks.length;
      out += source.slice(i, stop);
      i = stop;
      continue;
    }

    if (char === "<") {
      const rest = source.slice(i);

      const autolink = rest.match(AUTOLINK)?.[0];
      if (autolink) {
        out += autolink;
        i += autolink.length;
        continue;
      }

      /*
       * A tag is dropped, not escaped. Escaping shows the reader
       * `<div style="display:flex">` where a layout used to be, which is worse
       * than the markup it replaced; dropping leaves the words inside it and
       * loses only the formatting that was never supported here.
       */
      const comment = rest.match(/^<!--[\s\S]*?-->/)?.[0];
      if (comment) {
        i += comment.length;
        continue;
      }

      const tag = rest.match(/^<\/?[A-Za-z][^>]*>/)?.[0];
      if (tag) {
        i += tag.length;
        continue;
      }

      // A stray `<` that opens nothing is text, and has to stay readable.
      out += "&lt;";
      i += 1;
      continue;
    }

    out += char;
    i += 1;
  }

  return out;
}
