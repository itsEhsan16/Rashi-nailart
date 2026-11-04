import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Canonical host from NEXT_PUBLIC_SITE_URL. Only set when it's a real custom
 * domain — if the env still points at *.vercel.app (or localhost) redirecting
 * would loop, so we skip it.
 */
const canonicalHost = (() => {
  try {
    const host = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "").host;
    return host && !host.endsWith(".vercel.app") && !host.startsWith("localhost")
      ? host
      : null;
  } catch {
    return null;
  }
})();

export async function middleware(request: NextRequest) {
  // Send production visitors on the *.vercel.app URL to the custom domain,
  // keeping path + query. Preview deployments (VERCEL_ENV=preview) also live on
  // *.vercel.app and must stay reachable, so this is production-only.
  const host = request.headers.get("host") ?? "";
  if (
    canonicalHost &&
    process.env.VERCEL_ENV === "production" &&
    host.endsWith(".vercel.app")
  ) {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    url.host = canonicalHost;
    url.port = "";
    return NextResponse.redirect(url, 308);
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets and image files. This keeps
     * the session cookie fresh app-wide and guards the protected prefixes.
     * `api/webhooks` is excluded: it's an unauthenticated, signature-verified
     * external callback (Cashfree), so running the Supabase session refresh on it
     * is pointless and adds latency.
     */
    // robots.txt / sitemap.xml / manifest / sw.js are crawler- and browser-facing
    // and never need a session: refreshing one on those hits costs a Supabase auth
    // round-trip and would set cookies on responses crawlers cache.
    "/((?!api/webhooks|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
