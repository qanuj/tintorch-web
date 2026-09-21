/**
 * Reading a field off a CMS item.
 *
 * Everything here is pure and synchronous: given an item, what does it say.
 * The CMS stores a field as whatever the type's editor produced - a number
 * field can arrive as the string "33", a repeater can arrive as JSON text when
 * the type uses a plain textarea - so the coercion belongs in one place rather
 * than at six hundred call sites.
 */
import type { CmsItem } from "./types";

/** One field as a string, whatever the CMS stored. */
export function field(item: CmsItem | null | undefined, key: string): string {
  const value = item?.fields?.[key];
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

export function fieldList(item: CmsItem | null | undefined, key: string): string[] {
  const value = item?.fields?.[key];
  return Array.isArray(value) ? value.map(String) : [];
}

/** Strictly true. A missing checkbox is false, never undefined. */
export function fieldBool(item: CmsItem | null | undefined, key: string): boolean {
  return item?.fields?.[key] === true;
}

/**
 * A numeric field. Accepts the string form too - a CMS text input holding "33"
 * is still thirty-three - and returns null rather than 0 for anything absent
 * or unparseable, so a missing value is never rendered as a real zero.
 */
export function fieldNumber(item: CmsItem | null | undefined, key: string): number | null {
  const value = item?.fields?.[key];
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    /*
     * Stripped first, then checked for having anything left: "many" strips to
     * an empty string, and `Number("")` is 0, which is how a field that says
     * nothing numeric used to render as a real zero.
     */
    const digits = value.replace(/[^\d.-]/g, "");
    if (!/\d/.test(digits)) return null;
    const parsed = Number(digits);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * A repeatable group field - a doctor's source links, a country's cost
 * comparison rows. Anything that is not an object is dropped rather than
 * coerced, because a half-formed row renders as a blank line on the page.
 *
 * Some fields arrive as a JSON string when the type uses a plain textarea, so
 * that is parsed here rather than at every call site.
 */
export function fieldRecords<T = Record<string, unknown>>(
  item: CmsItem | null | undefined,
  key: string,
): T[] {
  let value: unknown = item?.fields?.[key];

  if (typeof value === "string" && value.trim().startsWith("[")) {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(value)) return [];
  return value.filter((row): row is T => typeof row === "object" && row !== null);
}

/** The keys a site might have called its picture, most specific first. */
export const IMAGE_KEYS = ["featuredImage", "image", "picture", "photo", "logo", "media"];

/** The image a card or a hero should use, share image last. */
export function itemImage(item: CmsItem | null | undefined): string {
  for (const key of IMAGE_KEYS) {
    const value = field(item, key);
    if (value.trim()) return value;
  }
  return item?.seo?.ogImage ?? "";
}

/** The body of an item, whichever field this type calls it. */
export function itemBody(item: CmsItem | null | undefined): string {
  return field(item, "content") || field(item, "description") || field(item, "body");
}

/**
 * How long a `description` may be before it stops being a summary. Past this
 * it is the whole body, and using it as a card blurb prints an essay.
 */
const SUMMARY_MAX = 320;

/**
 * A sentence or two about an item.
 *
 * `description` is a summary for some types and the entire body for others, so
 * it only stands as one when it is short enough to be one. Failing that the
 * meta description does, and failing that nothing.
 */
export function itemSummary(item: CmsItem | null | undefined): string {
  for (const key of ["summary", "excerpt", "tagline"]) {
    const value = field(item, key).trim();
    if (value) return value;
  }

  const description = field(item, "description").trim();
  if (description && description.length <= SUMMARY_MAX && !description.includes("\n\n")) {
    return description;
  }

  return (item?.seo?.metaDescription ?? "").trim();
}
