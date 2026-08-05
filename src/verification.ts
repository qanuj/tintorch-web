import type { Metadata } from "next";

/**
 * Ownership proofs, as Next metadata.
 *
 * Search Console, Bing, Pinterest, Meta and the rest all verify the same way:
 * they hand you a `<meta>` tag and look for it. The CMS reads the tag into a
 * name and a token; this puts them back into the head.
 *
 * Inert by construction - a meta tag runs nothing and asks for nothing. That is
 * why these live in configuration while analytics ids get a component that
 * decides what to load.
 */

export type SiteVerification = { name: string; content: string };

/**
 * Names Next has a first-class field for. Using it rather than `other` means
 * Next writes the tag its own way and cannot end up emitting it twice if a site
 * also sets the field directly.
 */
const NATIVE: Record<string, "google" | "yandex" | "yahoo"> = {
  "google-site-verification": "google",
  "yandex-verification": "yandex",
  "y_key": "yahoo",
};

/**
 * Merge into a route's `metadata`.
 *
 * ```ts
 * export const metadata: Metadata = {
 *   title: site.name,
 *   ...verificationMetadata(config.verifications),
 * };
 * ```
 *
 * A name with no token, or the other way round, is dropped: half a verification
 * tag proves nothing and an empty `content` is a tag every crawler logs as
 * malformed.
 */
export function verificationMetadata(rows: SiteVerification[] | undefined): Metadata {
  const clean = (rows ?? []).filter((row) => row?.name?.trim() && row?.content?.trim());
  if (!clean.length) return {};

  const verification: NonNullable<Metadata["verification"]> = {};
  const other: Record<string, string> = {};

  for (const row of clean) {
    const name = row.name.trim();
    const content = row.content.trim();
    const native = NATIVE[name.toLowerCase()];

    if (native) verification[native] = content;
    else other[name] = content;
  }

  return {
    ...(Object.keys(verification).length ? { verification } : {}),
    ...(Object.keys(other).length ? { other } : {}),
  };
}
