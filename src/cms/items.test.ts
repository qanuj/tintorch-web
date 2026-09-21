import { describe, expect, it } from "vitest";
import {
  field,
  fieldBool,
  fieldList,
  fieldNumber,
  fieldRecords,
  itemBody,
  itemImage,
  itemSummary,
} from "./items";
import type { CmsItem, CmsSeo } from "./types";

const make = (fields: Record<string, unknown>, seo: CmsSeo = {}) =>
  ({ fields, seo }) as unknown as CmsItem;

describe("field", () => {
  it("returns a string as it stands", () => {
    expect(field(make({ title: "Knee replacement" }), "title")).toBe("Knee replacement");
  });

  it("stringifies a number and a boolean, so a 0 is still readable", () => {
    expect(field(make({ beds: 0 }), "beds")).toBe("0");
    expect(field(make({ featured: false }), "featured")).toBe("false");
  });

  it("returns an empty string for a missing field, a null item, or an object", () => {
    expect(field(make({}), "nope")).toBe("");
    expect(field(null, "nope")).toBe("");
    expect(field(make({ a: { b: 1 } }), "a")).toBe("");
  });
});

describe("fieldList", () => {
  it("stringifies every entry", () => {
    expect(fieldList(make({ tags: ["a", 2, true] }), "tags")).toEqual(["a", "2", "true"]);
  });

  it("returns an empty array for anything that is not one", () => {
    expect(fieldList(make({ tags: "a,b" }), "tags")).toEqual([]);
    expect(fieldList(null, "tags")).toEqual([]);
  });
});

describe("fieldBool", () => {
  it("is true only for a real true", () => {
    expect(fieldBool(make({ x: true }), "x")).toBe(true);
    // "true" and 1 are what a CMS textarea produces, and are not a ticked box.
    expect(fieldBool(make({ x: "true" }), "x")).toBe(false);
    expect(fieldBool(make({ x: 1 }), "x")).toBe(false);
    expect(fieldBool(make({}), "x")).toBe(false);
  });
});

describe("fieldNumber", () => {
  it("reads a number", () => {
    expect(fieldNumber(make({ beds: 240 }), "beds")).toBe(240);
  });

  it("reads the string form a text input produces", () => {
    expect(fieldNumber(make({ beds: "240" }), "beds")).toBe(240);
    expect(fieldNumber(make({ cost: "$1,250.50" }), "cost")).toBe(1250.5);
  });

  it("returns null rather than 0 for anything absent or unparseable", () => {
    // A missing bed count must not render as a hospital with no beds.
    expect(fieldNumber(make({}), "beds")).toBeNull();
    expect(fieldNumber(make({ beds: "" }), "beds")).toBeNull();
    expect(fieldNumber(make({ beds: "many" }), "beds")).toBeNull();
    expect(fieldNumber(make({ beds: Number.NaN }), "beds")).toBeNull();
    expect(fieldNumber(make({ beds: Number.POSITIVE_INFINITY }), "beds")).toBeNull();
  });

  it("keeps a real zero", () => {
    expect(fieldNumber(make({ waitDays: 0 }), "waitDays")).toBe(0);
  });
});

describe("fieldRecords", () => {
  it("reads an array of objects", () => {
    expect(fieldRecords(make({ rows: [{ a: 1 }, { a: 2 }] }), "rows")).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("parses the JSON string a textarea-backed field produces", () => {
    expect(fieldRecords(make({ rows: '[{"a":1}]' }), "rows")).toEqual([{ a: 1 }]);
  });

  it("drops half-formed rows rather than coercing them to blank lines", () => {
    expect(fieldRecords(make({ rows: [{ a: 1 }, null, "x", 3] }), "rows")).toEqual([{ a: 1 }]);
  });

  it("returns an empty array for malformed JSON instead of throwing", () => {
    expect(fieldRecords(make({ rows: "[{oops" }), "rows")).toEqual([]);
  });

  it("ignores a string that is not a JSON array", () => {
    expect(fieldRecords(make({ rows: "not json" }), "rows")).toEqual([]);
  });
});

describe("itemImage", () => {
  it("prefers the featured image", () => {
    expect(itemImage(make({ featuredImage: "/a.jpg", image: "/b.jpg" }))).toBe("/a.jpg");
  });

  it("walks the fallbacks in order", () => {
    expect(itemImage(make({ photo: "/c.jpg", logo: "/d.jpg" }))).toBe("/c.jpg");
  });

  it("treats a whitespace-only value as absent", () => {
    expect(itemImage(make({ image: "   ", photo: "/c.jpg" }))).toBe("/c.jpg");
  });

  it("falls back to the share image, and then to nothing", () => {
    expect(itemImage(make({}, { ogImage: "/og.jpg" }))).toBe("/og.jpg");
    expect(itemImage(make({}))).toBe("");
  });
});

describe("itemBody", () => {
  it("prefers content, then description, then body", () => {
    expect(itemBody(make({ content: "a", description: "b", body: "c" }))).toBe("a");
    expect(itemBody(make({ description: "b", body: "c" }))).toBe("b");
    expect(itemBody(make({ body: "c" }))).toBe("c");
    expect(itemBody(make({}))).toBe("");
  });
});

describe("itemSummary", () => {
  it("prefers an explicit summary field", () => {
    expect(itemSummary(make({ summary: "Short.", description: "Long." }))).toBe("Short.");
  });

  it("walks excerpt and tagline", () => {
    expect(itemSummary(make({ excerpt: "From the excerpt." }))).toBe("From the excerpt.");
    expect(itemSummary(make({ tagline: "A tagline." }))).toBe("A tagline.");
  });

  it("uses a short description, because for some types that is the summary", () => {
    expect(itemSummary(make({ description: "Two sentences. That is all." }))).toBe(
      "Two sentences. That is all.",
    );
  });

  it("refuses a description that is really the whole body", () => {
    const essay = "x".repeat(400);
    expect(itemSummary(make({ description: essay }, { metaDescription: "The meta." }))).toBe(
      "The meta.",
    );
  });

  it("refuses a multi-paragraph description however short", () => {
    expect(itemSummary(make({ description: "One.\n\nTwo." }, { metaDescription: "Meta." }))).toBe(
      "Meta.",
    );
  });

  it("returns nothing rather than inventing a summary", () => {
    expect(itemSummary(make({}))).toBe("");
    expect(itemSummary(null)).toBe("");
  });
});
