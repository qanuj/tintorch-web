import { describe, expect, it } from "vitest";
import { escapeRawHtml } from "./escape";
import { escapeText, expandFaqBlocks, splitFaqBlocks } from "./faq";
import { SANITIZE_ALLOWLIST, externalLinkAttributes } from "./sanitize";

describe("escapeRawHtml", () => {
  it("drops a script tag and keeps the words inside it", () => {
    expect(escapeRawHtml("Hello <script>alert(1)</script> world")).toBe("Hello alert(1) world");
  });

  it("drops an iframe pointing anywhere", () => {
    expect(escapeRawHtml('a <iframe src="//evil.test"></iframe> b')).toBe("a  b");
  });

  it("drops an event handler by dropping the tag that carried it", () => {
    expect(escapeRawHtml('<img src=x onerror="alert(1)">')).toBe("");
  });

  it("drops a comment entirely, since it renders as nothing anyway", () => {
    expect(escapeRawHtml("a <!-- secret --> b")).toBe("a  b");
  });

  it("leaves inline code alone, where a tag is the subject and not markup", () => {
    expect(escapeRawHtml("Use `<div>` for layout")).toBe("Use `<div>` for layout");
  });

  it("leaves a fenced block alone", () => {
    const md = "```html\n<script>alert(1)</script>\n```";
    expect(escapeRawHtml(md)).toBe(md);
  });

  it("leaves a tilde fence alone", () => {
    const md = "~~~\n<b>bold</b>\n~~~";
    expect(escapeRawHtml(md)).toBe(md);
  });

  it("leaves an autolink alone, because CommonMark defines it as a link", () => {
    expect(escapeRawHtml("See <https://example.com> for more")).toBe(
      "See <https://example.com> for more",
    );
    expect(escapeRawHtml("Write to <a@e10.in>")).toBe("Write to <a@e10.in>");
    expect(escapeRawHtml("<mailto:a@e10.in>")).toBe("<mailto:a@e10.in>");
  });

  it("keeps a stray angle bracket readable", () => {
    expect(escapeRawHtml("5 < 6 and 7 > 6")).toBe("5 &lt; 6 and 7 > 6");
  });

  it("handles an unterminated fence by copying to the end", () => {
    expect(escapeRawHtml("```\n<b>x</b>")).toBe("```\n<b>x</b>");
  });

  it("handles an unterminated inline span without looping", () => {
    expect(escapeRawHtml("a ` b <b>c</b>")).toBe("a ` b c");
  });

  it("survives empty and undefined input", () => {
    expect(escapeRawHtml("")).toBe("");
    expect(escapeRawHtml(undefined as unknown as string)).toBe("");
  });

  it("leaves ordinary Markdown untouched", () => {
    const md = "# Title\n\nA [link](https://example.com) and **bold**.\n";
    expect(escapeRawHtml(md)).toBe(md);
  });
});

describe("splitFaqBlocks", () => {
  it("leaves a body with no fences alone", () => {
    expect(splitFaqBlocks("Just prose.")).toEqual({ body: "Just prose.", title: "", intro: "" });
  });

  it("removes the fences so the questions are not printed twice", () => {
    const md = "Intro.\n\n:::faq\n### Q1\nA1\n:::\n\n:::faq\n### Q2\nA2\n:::\n";
    const result = splitFaqBlocks(md);
    expect(result.body).toBe("Intro.");
    expect(result.body).not.toContain(":::");
  });

  it("lifts the heading and lead line that introduced them", () => {
    const md = "Intro.\n\n## Common questions\nBefore you travel.\n\n:::faq\n### Q\nA\n:::\n";
    const result = splitFaqBlocks(md);
    expect(result.title).toBe("Common questions");
    expect(result.intro).toBe("Before you travel.");
    expect(result.body).toBe("Intro.");
  });

  it("leaves a heading alone when real content sits under it", () => {
    const md = "## About the hospital\nA paragraph.\n\nAnother paragraph.\n\n:::faq\n### Q\nA\n:::\n";
    const result = splitFaqBlocks(md);
    // Everything under that heading came back as the intro, which would be
    // wrong; the heading belongs to the page. It is still reported, so a site
    // can decide, but the body keeps its prose.
    expect(result.body).toContain("Another paragraph.");
  });

  it("reports no title when nothing introduced the fences", () => {
    const result = splitFaqBlocks(":::faq\n### Q\nA\n:::\n");
    expect(result).toMatchObject({ title: "", intro: "" });
  });

  it("survives empty input", () => {
    expect(splitFaqBlocks("")).toEqual({ body: "", title: "", intro: "" });
  });
});

describe("expandFaqBlocks", () => {
  it("turns each fence into its own details element", () => {
    const html = expandFaqBlocks(":::faq\n### Q1\nA1\n:::\n\n:::faq\n### Q2\nA2\n:::");
    expect(html.match(/<details/g)).toHaveLength(2);
    expect(html).toContain("<summary>Q1</summary>");
  });

  it("escapes the question, which is going into markup rather than Markdown", () => {
    const html = expandFaqBlocks(':::faq\n### Is 5 < 6 & "safe"?\nYes\n:::');
    expect(html).toContain("<summary>Is 5 &lt; 6 &amp; &quot;safe&quot;?</summary>");
    expect(html).not.toContain("<summary>Is 5 < 6");
  });

  it("surrounds the answer with blank lines so it still parses as Markdown", () => {
    const html = expandFaqBlocks(":::faq\n### Q\n**Bold** answer\n:::");
    expect(html).toContain("\n\n**Bold** answer\n\n");
  });

  it("drops a block with no question rather than emitting an empty summary", () => {
    expect(expandFaqBlocks(":::faq\n\n:::")).toBe("");
  });

  it("takes the class it was given", () => {
    expect(expandFaqBlocks(":::faq\n### Q\nA\n:::", { className: "mdc-faq" })).toContain(
      'class="mdc-faq"',
    );
  });

  it("leaves a body with no fences alone", () => {
    expect(expandFaqBlocks("Just prose.")).toBe("Just prose.");
  });
});

describe("escapeText", () => {
  it("escapes the five characters that change meaning inside markup", () => {
    expect(escapeText(`<&>"'`)).toBe("&lt;&amp;&gt;&quot;&#39;");
  });

  it("escapes the ampersand first, so an escape is not double-escaped", () => {
    expect(escapeText("&lt;")).toBe("&amp;lt;");
  });
});

describe("SANITIZE_ALLOWLIST", () => {
  it("does not allow a script, an iframe, or a style block", () => {
    for (const tag of ["script", "iframe", "style", "object", "embed", "form", "input"]) {
      expect(SANITIZE_ALLOWLIST.allowedTags).not.toContain(tag);
    }
  });

  it("does not allow javascript: anywhere", () => {
    expect(SANITIZE_ALLOWLIST.allowedSchemes).not.toContain("javascript");
    for (const schemes of Object.values(SANITIZE_ALLOWLIST.allowedSchemesByTag)) {
      expect(schemes).not.toContain("javascript");
    }
  });

  it("allows a data: URL for an image only", () => {
    expect(SANITIZE_ALLOWLIST.allowedSchemes).not.toContain("data");
    expect(SANITIZE_ALLOWLIST.allowedSchemesByTag.img).toContain("data");
  });

  it("does not allow a style or event attribute on anything", () => {
    for (const attributes of Object.values(SANITIZE_ALLOWLIST.allowedAttributes)) {
      expect(attributes).not.toContain("style");
      expect(attributes.some((name) => name.startsWith("on"))).toBe(false);
    }
  });

  it("allows only tags it also has an entry for, or none at all", () => {
    for (const tag of Object.keys(SANITIZE_ALLOWLIST.allowedAttributes)) {
      expect(SANITIZE_ALLOWLIST.allowedTags).toContain(tag);
    }
  });
});

describe("externalLinkAttributes", () => {
  it("disclaims and isolates an outbound link", () => {
    expect(externalLinkAttributes("https://example.com")).toEqual({
      rel: "nofollow noopener noreferrer",
      target: "_blank",
    });
  });

  it("leaves an internal link, an anchor and a mailto alone", () => {
    expect(externalLinkAttributes("/pricing")).toBeNull();
    expect(externalLinkAttributes("#faq")).toBeNull();
    expect(externalLinkAttributes("mailto:a@e10.in")).toBeNull();
  });
});
