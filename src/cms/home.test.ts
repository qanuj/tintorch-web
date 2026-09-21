import { describe, expect, it } from "vitest";
import {
  homeCount,
  homeEntry,
  homeSectionFor,
  homeSections,
  homeSectionsFor,
} from "./home";

const TYPES = [
  { key: "blog", pluralName: "Blog" },
  { key: "service", pluralName: "Services" },
  { key: "location", pluralName: "Gaushalas" },
];

/** The shape the CMS writes today. */
const entry = (count: number, sequence: number, rest: Record<string, unknown> = {}) => ({
  count,
  eyebrow: "",
  title: "",
  subtitle: "",
  moreLabel: "",
  moreHref: "",
  showImage: true,
  sequence,
  ...rest,
});

describe("homeEntry", () => {
  it("reads the current object shape", () => {
    expect(homeEntry({ blog: entry(6, 3) }, "blog").count).toBe(6);
  });

  it("reads the bare number the setting used to be", () => {
    // `{ services: 6 }` is the oldest shape. Ignoring it would blank the home
    // page of a workspace that has never opened this screen.
    expect(homeEntry({ services: 6 }, "service")).toEqual({ count: 6 });
  });

  it("prefers the type key over its legacy alias", () => {
    expect(homeEntry({ blog: entry(7, 1), posts: 2 }, "blog").count).toBe(7);
  });

  it("returns an empty entry for anything it cannot read", () => {
    expect(homeEntry(null, "blog")).toEqual({});
    expect(homeEntry(undefined, "blog")).toEqual({});
    expect(homeEntry("nonsense", "blog")).toEqual({});
    expect(homeEntry({ blog: "6" }, "blog")).toEqual({});
    expect(homeEntry({}, "blog")).toEqual({});
  });
});

describe("homeCount", () => {
  it("uses the configured count", () => {
    expect(homeCount({ blog: entry(9, 1) }, "blog", 3)).toBe(9);
  });

  it("uses the site's own number when the workspace has not set one", () => {
    expect(homeCount({}, "blog", 3)).toBe(3);
  });

  it("honours a configured zero rather than falling back to the site's number", () => {
    // Zero is the workspace hiding the section, not an absent value.
    expect(homeCount({ blog: entry(0, 1) }, "blog", 3)).toBe(0);
  });
});

describe("homeSections", () => {
  const home = {
    page: entry(0, 0),
    badge: entry(0, 1),
    gaumata: entry(6, 2),
    blog: entry(7, 3),
    location: entry(6, 6),
    product: entry(9, 13, { title: "Gau Seva & Cow Care Services" }),
  };

  it("returns only the sections with a count", () => {
    expect(homeSections(home).map((s) => s.type)).toEqual([
      "gaumata",
      "blog",
      "location",
      "product",
    ]);
  });

  it("orders by sequence, not by key order", () => {
    // Key order is whatever the last save wrote; it is not an ordering anyone
    // chose. Reversing the object must not reverse the page.
    const reversed = Object.fromEntries(Object.entries(home).reverse());
    expect(homeSections(reversed).map((s) => s.type)).toEqual(
      homeSections(home).map((s) => s.type),
    );
  });

  it("tolerates the gaps hidden sections leave in the sequence", () => {
    expect(homeSections(home).map((s) => s.sequence)).toEqual([2, 3, 6, 13]);
  });

  it("breaks a tie on the type key, so a page is stable before anyone orders it", () => {
    const flat = { service: entry(3, 0), blog: entry(3, 0), product: entry(3, 0) };
    expect(homeSections(flat).map((s) => s.type)).toEqual(["blog", "product", "service"]);
  });

  it("labels a section with the workspace's plural name", () => {
    expect(homeSections(home, TYPES).find((s) => s.type === "location")?.label).toBe("Gaushalas");
  });

  it("falls back to the type key when the workspace has no name for it", () => {
    expect(homeSections(home, TYPES).find((s) => s.type === "gaumata")?.label).toBe("gaumata");
  });

  it("carries the wording through, trimmed", () => {
    const section = homeSections({ blog: entry(6, 1, { title: "  Writing  ", subtitle: " " }) })[0]!;
    expect(section.title).toBe("Writing");
    expect(section.subtitle).toBe("");
  });

  it("treats an absent showImage as on", () => {
    expect(homeSections({ blog: { count: 3 } })[0]!.showImage).toBe(true);
  });

  it("respects showImage turned off", () => {
    expect(homeSections({ blog: { count: 3, showImage: false } })[0]!.showImage).toBe(false);
  });

  it("reads a workspace still on the bare-number shape", () => {
    expect(homeSections({ services: 6, posts: 3 }).map((s) => [s.type, s.count])).toEqual([
      ["posts", 3],
      ["services", 6],
    ]);
  });

  it("returns nothing rather than throwing on a missing or malformed config", () => {
    expect(homeSections(undefined)).toEqual([]);
    expect(homeSections(null)).toEqual([]);
    expect(homeSections("nonsense")).toEqual([]);
    expect(homeSections({})).toEqual([]);
  });

  it("survives a sequence the CMS wrote as a string", () => {
    const sections = homeSections({ a: { count: 1, sequence: "5" }, b: { count: 1, sequence: "2" } });
    expect(sections.map((s) => s.type)).toEqual(["b", "a"]);
  });
});

describe("homeSectionsFor", () => {
  const home = { blog: entry(6, 1), country: entry(12, 2), treatment: entry(24, 3) };

  it("drops a section this site has no route for", () => {
    // The two lists come from the same workspace, but a type can be added for
    // another site on the same content and would otherwise be linked to a 404.
    expect(homeSectionsFor(home, ["blog", "treatment"]).map((s) => s.type)).toEqual([
      "blog",
      "treatment",
    ]);
  });

  it("keeps the configured order among what is left", () => {
    expect(homeSectionsFor(home, ["treatment", "blog"]).map((s) => s.type)).toEqual([
      "blog",
      "treatment",
    ]);
  });

  it("returns nothing when the site renders none of them", () => {
    expect(homeSectionsFor(home, [])).toEqual([]);
  });
});

describe("homeSectionFor", () => {
  it("resolves one type whether or not it is shown", () => {
    expect(homeSectionFor({ blog: entry(0, 4) }, "blog", TYPES)).toMatchObject({
      type: "blog",
      label: "Blog",
      count: 0,
      sequence: 4,
      showImage: true,
    });
  });

  it("resolves a type the config has never heard of", () => {
    expect(homeSectionFor({}, "video")).toMatchObject({ type: "video", count: 0, sequence: 0 });
  });
});
