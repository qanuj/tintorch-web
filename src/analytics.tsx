import Script from "next/script";

/**
 * Measurement loaders.
 *
 * The CMS stores ids, never snippets: every one of these providers hands out
 * twenty lines of JavaScript wrapped around a single identifier, so the
 * identifier is what a workspace configures and this renders the loader. That
 * keeps the content API from becoming a way to put arbitrary JavaScript onto
 * every page of a site.
 *
 * Nothing renders for a provider with no id, so a site loads exactly what it
 * has been configured for and no more. Consent gating belongs to the site: it
 * knows what it asked its visitors, and it decides whether to render this at
 * all.
 *
 * `afterInteractive` throughout - measurement is never worth blocking a page
 * on, and every one of these queues calls made before its own script arrives.
 */

export type SiteAnalytics = {
  ga4?: string;
  gtm?: string;
  metaPixel?: string;
  posthog?: string;
  posthogHost?: string;
  clarity?: string;
  hotjar?: string;
  plausible?: string;
  fathom?: string;
  umami?: string;
  linkedin?: string;
  tiktokPixel?: string;
  bingUet?: string;
};

const POSTHOG_DEFAULT_HOST = "https://us.i.posthog.com";

export function Analytics({ config }: { config: SiteAnalytics | undefined }) {
  const ids = config ?? {};
  const has = (value?: string) => Boolean(value?.trim());

  return (
    <>
      {/*
        GA4 and GTM are alternatives, not a pair: a container that already
        fires GA4 would count every page twice. A workspace that has set both
        means the container, so the container wins.
      */}
      {has(ids.gtm) ? (
        <Script id="tt-gtm" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${ids.gtm}');`}
        </Script>
      ) : (
        has(ids.ga4) && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${ids.ga4}`}
              strategy="afterInteractive"
            />
            <Script id="tt-ga4" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${ids.ga4}');`}
            </Script>
          </>
        )
      )}

      {has(ids.metaPixel) && (
        <Script id="tt-meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${ids.metaPixel}');fbq('track','PageView');`}
        </Script>
      )}

      {has(ids.posthog) && (
        <Script id="tt-posthog" strategy="afterInteractive">
          {`!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys onSessionId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);posthog.init('${ids.posthog}',{api_host:'${(ids.posthogHost || POSTHOG_DEFAULT_HOST).replace(/\/+$/, "")}'});`}
        </Script>
      )}

      {has(ids.clarity) && (
        <Script id="tt-clarity" strategy="afterInteractive">
          {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${ids.clarity}");`}
        </Script>
      )}

      {has(ids.hotjar) && (
        <Script id="tt-hotjar" strategy="afterInteractive">
          {`(function(h,o,t,j,a,r){h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};h._hjSettings={hjid:${Number(ids.hotjar)},hjsv:6};a=o.getElementsByTagName('head')[0];r=o.createElement('script');r.async=1;r.src=t+h._hjSettings.hjid+j;a.appendChild(r);})(window,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');`}
        </Script>
      )}

      {has(ids.plausible) && (
        <Script
          defer
          data-domain={ids.plausible}
          src="https://plausible.io/js/script.js"
          strategy="afterInteractive"
        />
      )}

      {has(ids.fathom) && (
        <Script
          src="https://cdn.usefathom.com/script.js"
          data-site={ids.fathom}
          defer
          strategy="afterInteractive"
        />
      )}

      {has(ids.umami) && (
        <Script
          src="https://cloud.umami.is/script.js"
          data-website-id={ids.umami}
          defer
          strategy="afterInteractive"
        />
      )}

      {has(ids.linkedin) && (
        <Script id="tt-linkedin" strategy="afterInteractive">
          {`_linkedin_partner_id="${ids.linkedin}";window._linkedin_data_partner_ids=window._linkedin_data_partner_ids||[];window._linkedin_data_partner_ids.push(_linkedin_partner_id);(function(l){if(!l){window.lintrk=function(a,b){window.lintrk.q.push([a,b])};window.lintrk.q=[]}var s=document.getElementsByTagName("script")[0];var b=document.createElement("script");b.type="text/javascript";b.async=true;b.src="https://snap.licdn.com/li.lms-analytics/insight.min.js";s.parentNode.insertBefore(b,s);})(window.lintrk);`}
        </Script>
      )}

      {has(ids.tiktokPixel) && (
        <Script id="tt-tiktok" strategy="afterInteractive">
          {`!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=r;ttq._t=ttq._t||{};ttq._t[e]=+new Date;ttq._o=ttq._o||{};ttq._o[e]=n||{};var o=d.createElement("script");o.type="text/javascript";o.async=!0;o.src=r+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load('${ids.tiktokPixel}');ttq.page();}(window,document,'ttq');`}
        </Script>
      )}

      {has(ids.bingUet) && (
        <Script id="tt-bing-uet" strategy="afterInteractive">
          {`(function(w,d,t,r,u){var f,n,i;w[u]=w[u]||[],f=function(){var o={ti:"${ids.bingUet}",enableAutoSpaTracking:true};o.q=w[u],w[u]=new UET(o),w[u].push("pageLoad")},n=d.createElement(t),n.src=r,n.async=1,n.onload=n.onreadystatechange=function(){var s=this.readyState;s&&s!=="loaded"&&s!=="complete"||(f(),n.onload=n.onreadystatechange=null)},i=d.getElementsByTagName(t)[0],i.parentNode.insertBefore(n,i)})(window,document,"script","//bat.bing.com/bat.js","uetq");`}
        </Script>
      )}
    </>
  );
}

/**
 * The GTM `<noscript>` frame, which belongs immediately after `<body>` rather
 * than wherever the loader sits. Rendering nothing when GTM is not configured,
 * so a site can place it unconditionally.
 */
export function AnalyticsNoScript({ config }: { config: SiteAnalytics | undefined }) {
  const gtm = config?.gtm?.trim();
  if (!gtm) return null;

  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${gtm}`}
        height="0"
        width="0"
        style={{ display: "none", visibility: "hidden" }}
        title="Google Tag Manager"
      />
    </noscript>
  );
}
