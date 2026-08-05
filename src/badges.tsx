"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Footer badges: awards, certifications, directory rankings and registrations.
 *
 * Artwork and a link, never the provider's embed snippet. Those snippets are
 * `<script src>` tags that fetch an image anyway, and mounting one lets a third
 * party run code on every page of the site and takes the footer down whenever
 * their CDN has a bad day. The CMS reads the snippet into fields; this renders
 * the fields.
 */

/** A badge as the CMS delivers it, once narrowed by `selectFooterBadges`. */
export type SiteBadge = {
  id: string;
  name: string;
  image: string;
  url: string;
  issuer: string;
};

/** The shape of a raw CMS item, as much of it as this file reads. */
type CmsItemLike = {
  id: string;
  slug?: string;
  title?: string;
  fields?: Record<string, unknown> | null;
};

/** The `fields` a badge listing needs. Narrowing keeps the response cacheable. */
export const BADGE_FIELDS = "name,image,url,issuer,showInFooter,sequence,expiresOn";

function text(item: CmsItemLike, key: string): string {
  const value = item.fields?.[key];
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function order(item: CmsItemLike): number {
  const value = Number(item.fields?.sequence);
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

/**
 * The badges a footer should show, in order.
 *
 * Takes items rather than fetching them: every site has its own authenticated
 * CMS client with its own cache tags, and this has no business owning that.
 *
 * Mapped before sorting, so the tie-break reads a name that is certainly there.
 * Sorting the raw items compared `title`, which a narrowed response does not
 * carry - so the comparator threw the first time two badges shared a sequence,
 * and the whole footer stopped rendering.
 *
 * An expired badge drops out on its own: a lapsed certification is a claim the
 * business can no longer make.
 */
export function selectFooterBadges(items: CmsItemLike[], today = new Date()): SiteBadge[] {
  const on = today.toISOString().slice(0, 10);

  return items
    .filter((item) => item.fields?.showInFooter === true && text(item, "image"))
    .filter((item) => {
      const expires = text(item, "expiresOn");
      return !expires || expires >= on;
    })
    .map((item) => ({
      id: item.id,
      name: text(item, "name") || item.title || item.slug || "",
      image: text(item, "image"),
      url: text(item, "url"),
      issuer: text(item, "issuer"),
      order: order(item),
    }))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    .map(({ order: _order, ...badge }) => badge);
}

/** What a badge's artwork should be described as. */
export function badgeAlt(badge: SiteBadge): string {
  return badge.issuer && badge.issuer !== badge.name
    ? `${badge.name} - ${badge.issuer}`
    : badge.name;
}

/**
 * The link on a badge.
 *
 * DMCA ships a helper script whose entire job is to append `refurl=<current
 * page>` to its own badge links, so a click tells DMCA which page the badge was
 * on. Without it their status page has no page to certify and reports "URL:
 * undefined" and "Protection Unavailable". Doing it here meets that
 * expectation with no third-party script - and their version reads
 * `n[0].getAttribute(...)` with no null check, so it throws on any page whose
 * anchor carries no `dmca-badge` class.
 *
 * A client component so the path is known: a footer lives in the layout, and a
 * server component cannot see which page it is on. `usePathname` resolves
 * during the server render too, so the href is right in the HTML rather than
 * patched in after hydration.
 */
export function BadgeLink({
  href,
  siteUrl,
  title,
  className,
  children,
}: {
  href: string;
  /** Origin, without a trailing slash. The path is added here. */
  siteUrl: string;
  title: string;
  className?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <a
      href={withRefurl(href, `${siteUrl}${pathname}`)}
      target="_blank"
      /* Someone else's listing is not a page this site vouches for, so the
         link passes no ranking signal. */
      rel="noopener noreferrer nofollow"
      title={title}
      className={className}
    >
      {children}
    </a>
  );
}

/**
 * A badge's link, carrying the page it was clicked from - DMCA only.
 *
 * Appended as plain text rather than through `searchParams`, which would
 * percent-encode it. DMCA's own script writes `+ "refurl=" + document.location`
 * with no encoding and their status page reads back what that produces, so an
 * encoded URL is a different string from the one they expect.
 *
 * Only DMCA gets the parameter. Adding it to every provider would hand
 * GoodFirms and the rest a log of which pages a visitor was reading, which none
 * of them asked for and none of them need.
 */
export function withRefurl(href: string, pageUrl: string): string {
  try {
    const url = new URL(href);
    if (!/(^|\.)dmca\.com$/i.test(url.hostname)) return href;
    // Already carries one - a link stored with the parameter baked in.
    if (url.searchParams.has("refurl")) return href;
  } catch {
    // Not a URL we can take apart; leave it exactly as the CMS holds it.
    return href;
  }

  return `${href}${href.includes("?") ? "&" : "?"}refurl=${pageUrl}`;
}

/**
 * The whole row.
 *
 * Drawn as supplied, with no plate behind the artwork - these are other
 * people's marks, and boxing in a badge that already carries its own background
 * is not a footer's call to make. Every class is passed in, because the one
 * thing that is never shared between these sites is how a footer looks.
 */
export function BadgeRow({
  badges,
  siteUrl,
  className,
  itemClassName,
  imageClassName,
}: {
  badges: SiteBadge[];
  siteUrl: string;
  className?: string;
  itemClassName?: string;
  imageClassName?: string;
}) {
  if (!badges.length) return null;

  return (
    <ul className={className}>
      {badges.map((badge) => {
        const mark = (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={badge.image}
            alt={badgeAlt(badge)}
            loading="lazy"
            className={imageClassName}
          />
        );

        return (
          <li key={badge.id} className={itemClassName}>
            {badge.url ? (
              <BadgeLink href={badge.url} siteUrl={siteUrl} title={badge.name}>
                {mark}
              </BadgeLink>
            ) : (
              mark
            )}
          </li>
        );
      })}
    </ul>
  );
}
