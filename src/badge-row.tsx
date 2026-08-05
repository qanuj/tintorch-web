import { BadgeLink } from "./badge-link";
import { badgeAlt, type SiteBadge } from "./badges";

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
