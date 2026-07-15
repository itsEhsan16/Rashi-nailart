import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

// installSerwist's precache manifest is injected by the @serwist/next build
// plugin at `npm run build` time (it replaces self.__SW_MANIFEST).
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * Critical correctness note (read before touching this file):
 *
 * Next.js Server Actions submit via a plain POST to the *same URL* the
 * calling component is rendered on — e.g. the booking form posts to "/",
 * an admin mutation posts to "/admin/bookings", a login form posts to
 * "/login". Every rule below that matches by pathname (rules 1-7, and the
 * page-cache entries inside `defaultCache`) is registered through
 * Serwist's `runtimeCaching` mechanism, which buckets routes by HTTP
 * method and defaults unset `method` to "GET" (see serwist's `Route`
 * class). That means a POST never even reaches these `matcher` functions —
 * it's bucketed separately and falls straight through to the network,
 * untouched by the service worker. This is what makes it safe for rules
 * 1-7 to match on pathname alone, for every GET request shape (full page
 * navigation, RSC data fetch, next/link prefetch) — not just top-level
 * navigations — which is exactly what we want for routes that must never
 * be cached.
 *
 * The one place a stray POST *could* be dangerous is a caching strategy
 * (NetworkFirst/StaleWhileRevalidate/CacheFirst) that calls `Cache.put()`,
 * since `Cache.put()` throws on non-GET requests. Rules 1-7 are all
 * `NetworkOnly`, which never calls `Cache.put()`, so they can't crash a
 * submission even in principle. The only caching (non-NetworkOnly) rules
 * in this file come from Serwist's own `defaultCache` (rule 8) — battle
 * tested for exactly this scenario — and the offline-fallback plugin
 * below, whose matcher explicitly guards on `request.mode === "navigate"`
 * before anything else so it only ever intercepts a real top-level page
 * navigation, never a Server Action POST or a failed fetch/XHR.
 */
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // 1. Every API route (Cashfree webhooks, booking/admin/staff/manager
    //    APIs) — always a live round-trip, never cached.
    {
      matcher: ({ url }) => url.pathname.startsWith("/api/"),
      handler: new NetworkOnly(),
    },
    // 2. Booking payment confirmation — polls live Cashfree order status;
    //    a cached response could show a stale or wrong payment outcome.
    {
      matcher: ({ url }) => url.pathname.startsWith("/booking/confirm"),
      handler: new NetworkOnly(),
    },
    // 3. Membership payment confirmation — same reasoning as #2.
    {
      matcher: ({ url }) => url.pathname.startsWith("/membership/confirm"),
      handler: new NetworkOnly(),
    },
    // 4. Auth — customer/admin/manager/staff login screens and redirects.
    {
      matcher: ({ url }) => url.pathname.startsWith("/login"),
      handler: new NetworkOnly(),
    },
    // 5. Admin dashboard — bookings, payouts, team, settings.
    {
      matcher: ({ url }) => url.pathname.startsWith("/admin"),
      handler: new NetworkOnly(),
    },
    // 6. Manager dashboard — reassignments, walk-ins, cancellations.
    {
      matcher: ({ url }) => url.pathname.startsWith("/manager"),
      handler: new NetworkOnly(),
    },
    // 7. Staff dashboard — own bookings, earnings, tasks.
    {
      matcher: ({ url }) => url.pathname.startsWith("/staff"),
      handler: new NetworkOnly(),
    },
    // 8. Everything else — Serwist's Next.js defaults (fonts, static
    //    assets, images, RSC payloads, and public-page HTML caching).
    //    MUST be last: Serwist/Workbox routing is first-match-wins, and
    //    `defaultCache`'s own page-cache entry matches broadly by response
    //    Content-Type rather than by pathname, so it has to sit behind the
    //    7 explicit, path-scoped exclusions above or it would shadow them.
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/offline.html",
        matcher({ request }) {
          // Guard on request.mode === "navigate" before anything else.
          // This plugin attaches to every Strategy above (including the 7
          // NetworkOnly rules), so without this guard a failed background
          // fetch/XHR/Server-Action request could be swapped for an HTML
          // page. Checking navigate mode first means the offline fallback
          // only ever answers a real, top-level page load.
          return request.mode === "navigate";
        },
      },
    ],
  },
});

serwist.addEventListeners();
