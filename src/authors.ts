/**
 * Who wrote a post.
 *
 * The CMS has always been able to credit several people - `authorIds` on the
 * item, delivered as `authors: [{ id, name, slug }]` - but the sites were built
 * before that and each read a single `author` field holding one person's slug.
 * So a post credited to two people in the CMS showed one author, or none: the
 * relation was populated and the field was empty, and the field was the only
 * thing the site read.
 *
 * This reads both. The relation wins when it has anything in it, the legacy
 * field is the fallback, and a site that has not migrated keeps working
 * unchanged.
 */

export type PostAuthor = {
  id: string;
  name: string;
  slug: string;
};

/** As much of a CMS item as crediting needs. */
type AuthoredItem = {
  authors?: { id: string; name: string; slug?: string }[] | null;
  fields?: Record<string, unknown> | null;
};

/** A name as a URL segment, for the legacy field which stores a slug already. */
function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "vikram-bose" reads as "Vikram Bose" when nothing better is available. */
function nameFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Everyone credited on an item, in the order the CMS holds them.
 *
 * `known` is the site's own list of people, used to turn a legacy slug into a
 * real name. Without it the slug is title-cased, which is right often enough to
 * beat printing a slug at a reader.
 */
export function postAuthors(item: AuthoredItem | null, known: PostAuthor[] = []): PostAuthor[] {
  const related = (item?.authors ?? []).filter((author) => author?.name);
  if (related.length) {
    return related.map((author) => ({
      id: author.id,
      name: author.name,
      slug: author.slug || slugify(author.name),
    }));
  }

  // The legacy single field, which holds a person's slug rather than a name.
  const legacy = item?.fields?.author;
  if (typeof legacy !== "string" || !legacy.trim()) return [];

  const slug = legacy.trim();
  const match = known.find((person) => person.slug === slug);
  return [match ?? { id: slug, name: nameFromSlug(slug), slug }];
}

/**
 * The byline, as a person would say it.
 *
 * "Vikram Bose and Kavitha Menon", not "Vikram Bose, Kavitha Menon" - a comma
 * between exactly two names reads as a list that got cut off.
 */
export function bylineText(authors: { name: string }[]): string {
  const names = authors.map((author) => author.name).filter(Boolean);
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The `author` value for Article structured data.
 *
 * An array when several people wrote it, which is what schema.org expects and
 * what search engines read for attribution. A single object for one author,
 * because that is the shape every validator example uses and there is no reason
 * to hand back a one-item array.
 *
 * `profilePath` builds each person's page - `(slug) => "/blog/authors/" + slug`
 * on a site that publishes author profiles. Omit it and the Person carries a
 * name only, which is still valid.
 */
export function schemaAuthors(
  authors: PostAuthor[],
  options: { siteUrl?: string; profilePath?: (slug: string) => string } = {},
) {
  const { siteUrl = "", profilePath } = options;

  const people = authors.map((author) => ({
    "@type": "Person" as const,
    name: author.name,
    ...(profilePath && author.slug
      ? { url: `${siteUrl.replace(/\/+$/, "")}${profilePath(author.slug)}` }
      : {}),
  }));

  if (people.length === 0) return undefined;
  return people.length === 1 ? people[0] : people;
}
