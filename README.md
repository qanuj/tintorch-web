# @tintorch/web

Shared pieces for the sites that read from [TinTorch CMS](https://cms.tintorch.com): footer badges, ownership verifications and analytics loaders.

What lives here is the code that talks to somebody else — badge providers, search engines, measurement scripts. It had been copied into four codebases and drifted in all four: a sort-order crash fixed in one and not the others, an `alt` attribute improved in one and not the others, DMCA's `refurl` added to one and not the others.

Since 2.0 the CMS client lives here too, along with the Markdown safety rules and the slug guard. The line has not moved, the reading of it has: how a site *talks* to the CMS turned out not to be something a site should disagree about. Six repos had written that file and the six had drifted, and each difference cost an incident before anybody noticed it was there.

What does **not** live here is anything a site should be free to disagree about. No styling, no layout, no content model. Components take their data in and take every class name as a prop, because the one thing these sites never share is how they look, and a site still writes its own readers because only the site knows that its `treatment` type calls its body `content`.

## Install

```bash
npm install github:qanuj/tintorch-web#semver:^2.1.0
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

## CMS client

```ts
import { cms, field, itemSummary, type CmsItem } from "@tintorch/web/cms";

const posts = await cms.listAllItems("blog", { fields: "slug,title", revalidate: 3600 });
const post = await cms.getItem("blog", slug);
```

`cms` is built from `TINTORCH_CMS_URL` and `TINTORCH_CMS_KEY`. Server-only: never import it from a client component, and never expose the key with a `NEXT_PUBLIC_` prefix. `createCmsClient({ baseUrl, key, fetch })` is there for tests and for a site that reads two workspaces.

Four rules it enforces, each one a bug some copy of this file had:

| Rule | Why |
|---|---|
| A 404 is `null`, anything else throws | A swallowed 500 during a build once shipped whole sections as 404s under a green check |
| `listAllItems` throws at 60 pages | Truncating silently is worse than failing: a partial list 404s real pages and prunes real URLs from the sitemap |
| `http://` is upgraded to `https://` | The redirect drops the `Authorization` header, which reads as "no content" rather than as an error |
| An unset key is a soft failure | A site has to build before the CMS is wired up |

Every read is tagged `cms` and `cms:<type>`, so a publish webhook can drop one type or everything.

### Field readers

`field`, `fieldList`, `fieldBool`, `fieldNumber`, `fieldRecords` and the `item*` helpers coerce what the CMS actually stores: a number field arriving as `"240"`, a repeater arriving as JSON text from a textarea, a `description` that is a summary on one type and the whole body on another.

`fieldNumber` returns `null` rather than `0` for anything unparseable, so a missing bed count never renders as a hospital with no beds.

### Home page sections

```ts
import { cms, homeSections, homeCount } from "@tintorch/web/cms";

const site = await cms.request("/site");
for (const section of homeSections(site.data.config.home, site.data.types)) {
  // section.type, .count, .title, .subtitle, .eyebrow, .moreLabel, .moreHref, .showImage
}
```

Settings › Site › Home page keeps an entry per content type. `count` is the switch as well as the size (zero hides the section and keeps its wording), and `sequence` is the drag order, global across every type, so the numbers that come back have gaps in them. `homeSections` sorts rather than indexes, which makes the gaps harmless, and breaks ties on the type key so a page is stable before anyone has ordered it.

`homeSectionsFor(home, renderable, types)` narrows the list to types this site actually has a route for. `homeCount(home, type, fallback)` is for a page that only wants a number, and honours a configured zero rather than falling back.

Old workspaces stored a bare number under a plural key (`{ services: 6 }`). Both shapes read the same.

### Forms

```ts
import { cms, getForm, submitForm, clientIpFrom } from "@tintorch/web/cms";

const form = await getForm(cms, "contact");
const result = await submitForm(cms, "contact", data, sourceUrl, {
  turnstileToken,
  clientIp: clientIpFrom(headers),
  trap: honeypotValue,
});
```

All three anti-spam signals go through one call, because a site that forgets one loses the protection silently. `clientIp` is the one that matters most: every site relays submissions from its own server, so without it the CMS counts the container rather than the visitor and rate limits a whole site as one person.

`submitForm` never throws. A form that cannot reach the CMS says so on the page rather than rendering an error boundary over the route.

## Markdown

```ts
import { escapeRawHtml, splitFaqBlocks, SANITIZE_ALLOWLIST } from "@tintorch/web/markdown";
```

Dependency-free on purpose: the sites render with `marked`, `react-markdown` or their own walker, and this package should not pick. What is shared is what an author may write and what the renderer may emit.

- `escapeRawHtml` drops an author's tags before the Markdown is parsed, keeping the words inside them. Code spans, fences and autolinks are left alone.
- `SANITIZE_ALLOWLIST` is the allowlist to hand `sanitize-html` afterwards. No `script`, no `iframe`, no `style` attribute, no `javascript:` scheme, `data:` for images only.
- `splitFaqBlocks` takes the `:::faq` fences out of a body for a site that renders `item.faqs` itself; `expandFaqBlocks` turns them into `<details>` for a site that does not.

Run both layers. The escaper decides what an author may write, the allowlist decides what the renderer may emit, and the pair is what keeps a compromised editor account out of a reader's browser.

## Slug guard

```ts
import { cms } from "@tintorch/web/cms";
import { createSlugGuard, cmsSlugSource } from "@tintorch/web/slug-guard";

export const guard = createSlugGuard({
  sections: { treatments: "treatment", hospitals: "business", blog: "blog" },
  source: cmsSlugSource(cms),
});

// in middleware
if (!(await guard.isKnownSlug("treatments", slug))) return new Response("Not found", { status: 404 });
```

A render writes a cache entry whether it produced a page or a 404, and invented slugs have no limit. The guard answers before anything renders.

It fails **open**: an unknown or empty list admits the request, which then 404s properly on its own. Refusing on a missing list turns one failed fetch into a site that answers 404 to everything. Retired slugs are admitted too, so the page can still issue its 301. `guard.forget()` after a publish makes new content reachable without waiting out the five-minute TTL.

## Tests

```bash
npm test
```

138 unit tests, no network. They are the contract: the error rules, the pagination ceiling, the fail-open guard, the escaper's treatment of code spans and autolinks, and the exact shape of a form submission are all asserted, because those are the things six hand-written copies each got differently.

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
