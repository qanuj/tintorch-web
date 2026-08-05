"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { withRefurl } from "./badges";

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
