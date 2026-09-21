/**
 * `:::faq` fences.
 *
 * The CMS parses them out of a body into the item's `faqs` array and leaves
 * the fences in the body as well. A site that renders both prints every
 * question twice - once as prose with a stray `:::` after it, once as the
 * accordion - so one of the two has to go, and which one depends on whether
 * the site has an FAQ component.
 *
 * `splitFaqBlocks` is for a site that renders `item.faqs` itself: it takes the
 * fences out of the body and hands back the heading and lead line that
 * introduced them, so those become the FAQ section's own title rather than
 * being lost.
 *
 * `expandFaqBlocks` is for a site that renders the body and nothing else: the
 * fences become `<details>` in place.
 */

export type SplitFaqResult = {
  /** The body with every `:::faq` fence, and their heading, removed. */
  body: string;
  /** The heading that introduced them, without its `##`. */
  title: string;
  /** Whatever prose sat between that heading and the first fence. */
  intro: string;
};

export function splitFaqBlocks(body: string): SplitFaqResult {
  const source = body ?? "";
  const first = source.indexOf(":::faq");
  if (first === -1) return { body: source, title: "", intro: "" };

  const withoutBlocks = source.replace(/:::faq[\s\S]*?:::\s*/g, "").trimEnd();

  /*
   * What introduced them: the last heading before the first fence, plus
   * whatever prose followed it. Only taken when nothing else sits between -
   * a heading with real content under it belongs to the page, not to the FAQs.
   */
  const before = source.slice(0, first);
  const heading = before.lastIndexOf("\n## ");
  if (heading === -1) return { body: withoutBlocks, title: "", intro: "" };

  const tail = before.slice(heading + 1);
  const lines = tail.split("\n").map((line) => line.trim()).filter(Boolean);
  const title = lines[0]?.replace(/^#+\s*/, "") ?? "";
  const intro = lines.slice(1).join(" ");

  return {
    body: (
      withoutBlocks.slice(0, heading) + withoutBlocks.slice(heading + tail.length + 1)
    ).trimEnd(),
    title,
    intro,
  };
}

export type ExpandFaqOptions = {
  /** The class on each generated `<details>`. */
  className?: string;
};

/**
 * `:::faq` blocks become `<details>`, matching how the CMS stores them.
 *
 * The question is text, so it is escaped: it is going into markup here rather
 * than through the Markdown renderer. The answer is left as Markdown and
 * surrounded by blank lines so the renderer still parses it.
 */
export function expandFaqBlocks(md: string, options: ExpandFaqOptions = {}): string {
  const className = options.className ?? "faq";

  return (md ?? "").replace(
    /^:::faq[ \t]*\n([\s\S]*?)^:::[ \t]*$/gm,
    (_all, inner: string) => {
      const [first = "", ...rest] = inner.trim().split("\n");
      const question = first.replace(/^#{1,6}\s*/, "").trim();
      if (!question) return "";
      const answer = rest.join("\n").trim();
      return `<details class="${className}"><summary>${escapeText(question)}</summary>\n\n${answer}\n\n</details>\n`;
    },
  );
}

/** The five characters that change meaning inside markup. */
export function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
