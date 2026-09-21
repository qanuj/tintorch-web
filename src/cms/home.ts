/**
 * What the home page shows, according to the workspace.
 *
 * Settings › Site › Home page keeps an entry per content type carrying a
 * count, a sequence and its own wording. `count` is the switch as well as the
 * size - zero means the section is not shown, and the wording is kept so that
 * putting it back restores what was written for it.
 *
 * Four sites had each read some of this and ignored the rest. One honoured the
 * counts but not the order, one honoured the order only for the types it had
 * no layout for, and two ignored the whole thing - so dragging a section in the
 * CMS moved it on one site, did nothing on two, and on the fourth moved it
 * only if it happened to be a type nobody had written a section for.
 *
 * The reading is here. What a site does with the answer is still the site's:
 * these are strips of other people's items, and no two of these sites lay them
 * out the same way.
 */

/** One entry as the CMS stores it. Every field is optional; old rows are thin. */
export type HomeSectionConfig = {
  count?: number;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  moreLabel?: string;
  moreHref?: string;
  showImage?: boolean;
  sequence?: number;
};

/** One entry, resolved: no optionals, nothing to re-check at the call site. */
export type HomeSection = {
  /** The CMS type key this section shows. */
  type: string;
  /** The type's plural name, for a section whose heading is not set. */
  label: string;
  count: number;
  /** Header parts. Emphasis inside title and subtitle is inline Markdown. */
  eyebrow: string;
  title: string;
  subtitle: string;
  /** The closing link. Drawn only when both are set: a label alone is not one. */
  moreLabel: string;
  moreHref: string;
  /** Whether the cards carry each item's artwork. On unless turned off. */
  showImage: boolean;
  sequence: number;
};

/**
 * Keys the setting used before it was keyed by type.
 *
 * An older workspace stored `posts: 6` where a newer one stores
 * `blog: { count: 6 }`. Both are still out there and both mean the same thing.
 */
const ALIASES: Record<string, string> = {
  service: "services",
  product: "products",
  client: "clients",
  review: "reviews",
  blog: "posts",
  industry: "industries",
  location: "locations",
  business: "businesses",
  job: "jobs",
  person: "people",
  professional: "professionals",
};

/** The raw `config.home`, whatever shape it arrived in. */
type HomeMap = Record<string, unknown>;

function asMap(home: unknown): HomeMap {
  return home && typeof home === "object" ? (home as HomeMap) : {};
}

/**
 * One type's entry.
 *
 * A bare number is the oldest shape the setting had - `{ services: 6 }` - and
 * reading it as a count rather than ignoring it is what keeps a workspace that
 * has never opened this screen showing what it always showed.
 */
export function homeEntry(home: unknown, type: string): HomeSectionConfig {
  const map = asMap(home);
  const raw = map[type] ?? map[ALIASES[type] ?? ""];
  if (typeof raw === "number") return { count: raw };
  if (raw && typeof raw === "object") return raw as HomeSectionConfig;
  return {};
}

/** How many of a type to show, or the site's own number when unset. */
export function homeCount(home: unknown, type: string, fallback: number): number {
  const value = homeEntry(home, type).count;
  return typeof value === "number" ? value : fallback;
}

function resolve(
  type: string,
  entry: HomeSectionConfig,
  nameOf: Map<string, string>,
): HomeSection {
  return {
    type,
    // The workspace's own plural name, so an unconfigured heading reads
    // "Industries" rather than the raw type key.
    label: nameOf.get(type) ?? type,
    count: entry.count ?? 0,
    eyebrow: (entry.eyebrow ?? "").trim(),
    title: (entry.title ?? "").trim(),
    subtitle: (entry.subtitle ?? "").trim(),
    moreLabel: (entry.moreLabel ?? "").trim(),
    moreHref: (entry.moreHref ?? "").trim(),
    // Absent means on: a workspace that has never touched the setting still
    // gets the artwork it has always had.
    showImage: entry.showImage !== false,
    sequence: Number(entry.sequence ?? 0),
  };
}

/** One type's section, whether or not it is shown. */
export function homeSectionFor(
  home: unknown,
  type: string,
  types: { key: string; pluralName: string }[] = [],
): HomeSection {
  return resolve(type, homeEntry(home, type), new Map(types.map((t) => [t.key, t.pluralName])));
}

/**
 * Every section the workspace asked for, in the order it put them in.
 *
 * Sorted by the stored sequence rather than by object key order, which is
 * whatever the last save happened to write and is not an ordering anyone
 * chose. Sections predating the setting share sequence 0 and fall back to
 * their key, so a page stays stable until someone orders it.
 *
 * The sequence is global across every type, including the hidden ones, so the
 * numbers that come back have gaps in them. Sorting rather than indexing is
 * what makes those gaps harmless.
 */
export function homeSections(
  home: unknown,
  types: { key: string; pluralName: string }[] = [],
): HomeSection[] {
  const nameOf = new Map(types.map((type) => [type.key, type.pluralName]));

  return Object.keys(asMap(home))
    .map((key) => resolve(key, homeEntry(home, key), nameOf))
    .filter((section) => section.count > 0)
    .sort((a, b) => a.sequence - b.sequence || a.type.localeCompare(b.type));
}

/**
 * The same list, narrowed to types this site can actually render.
 *
 * A section naming a type with no route here is dropped rather than linked
 * into a 404 or rendered as an empty heading: the two lists come from the same
 * workspace, but a type can be removed, or added for another site on the same
 * content, while its home-page entry sits there unchanged.
 */
export function homeSectionsFor(
  home: unknown,
  renderable: Iterable<string>,
  types: { key: string; pluralName: string }[] = [],
): HomeSection[] {
  const allowed = new Set(renderable);
  return homeSections(home, types).filter((section) => allowed.has(section.type));
}
