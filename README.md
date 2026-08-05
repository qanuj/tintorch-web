# @tintorch/web

Shared pieces for the sites that read from [TinTorch CMS](https://cms.tintorch.com): footer badges, ownership verifications and analytics loaders.

What lives here is the code that talks to somebody else — badge providers, search engines, measurement scripts. It had been copied into four codebases and drifted in all four: a sort-order crash fixed in one and not the others, an `alt` attribute improved in one and not the others, DMCA's `refurl` added to one and not the others.

What does **not** live here is anything a site should be free to disagree about. No styling, no CMS client, no layout. Components take their data in and take every class name as a prop, because the one thing these sites never share is how they look.

## Install

```bash
npm install github:qanuj/tintorch-web#semver:^1.0.0
```

The package ships `.tsx` rather than compiled output, so the consuming app compiles it:

```ts
// next.config.ts
const nextConfig = {
  transpilePackages: ["@tintorch/web"],
};
```

`react` and `next` are peer dependencies — the app's own copies are used, never a second one.

### Updating

The install range is resolved against git tags and pinned to an exact commit in `package-lock.json`, so nothing moves on its own. To take a new release:

```bash
npm update @tintorch/web
```

To cut one: land the change, then `npm version minor` and push the tag. Anything that changes what a site must do to keep working is a major.

## Badges

The site fetches — it has the authenticated client and the cache tags — and this selects, orders and renders.

```tsx
import { BADGE_FIELDS, BadgeRow, selectFooterBadges } from "@tintorch/web";

const items = await listAllItems("badge", { fields: BADGE_FIELDS });

<BadgeRow
  badges={selectFooterBadges(items)}
  siteUrl={site.url}
  className="mt-10 flex flex-wrap items-center gap-6 border-t pt-8"
  imageClassName="h-14 w-auto max-w-[11rem] object-contain"
/>;
```

`selectFooterBadges` drops badges not marked for the footer, drops expired ones — a lapsed certification is a claim the business can no longer make — and sorts by sequence with the name as tie-break.

`BadgeRow` links each badge with `rel="noopener noreferrer nofollow"`: someone else's directory listing is not a page the site vouches for.

### DMCA `refurl`

DMCA ships a helper script whose entire job is appending `refurl=<current page>` to its own badge links. Without it their status page has no page to certify and reports `URL: undefined` / `Protection Unavailable`. `BadgeLink` does it directly, so no third-party script is loaded — and DMCA's own version throws on any page whose anchor lacks a `dmca-badge` class.

Only DMCA links get the parameter. Adding it everywhere would hand GoodFirms and the rest a log of which pages a visitor was reading.

## Verifications

```ts
import { verificationMetadata } from "@tintorch/web";

export const metadata: Metadata = {
  title: site.name,
  ...verificationMetadata(config.verifications),
};
```

Google, Yandex and Yahoo go through Next's own `verification` field; everything else becomes an `other` meta tag. A row missing either half is dropped.

## Analytics

The CMS stores **ids, never snippets** — each of these providers hands out twenty lines of JavaScript around a single identifier, so the identifier is configured and the loader is rendered here. Nothing arbitrary reaches a page through the content API.

```tsx
import { Analytics, AnalyticsNoScript } from "@tintorch/web";

<body>
  <AnalyticsNoScript config={config.analytics} />
  {children}
  <Analytics config={config.analytics} />
</body>;
```

Supported: GA4, Google Tag Manager, Meta Pixel, PostHog, Microsoft Clarity, Hotjar, Plausible, Fathom, Umami, LinkedIn Insight, TikTok Pixel, Microsoft UET.

A provider with no id renders nothing, so a site loads exactly what it is configured for. GTM and GA4 are alternatives rather than a pair — a container that already fires GA4 would count every page twice — so when both are set the container wins.

Everything loads `afterInteractive`. Measurement is never worth blocking a page on.

**Consent is the site's decision.** This component does not gate anything: the site knows what it asked its visitors, and it chooses whether to render this at all.
