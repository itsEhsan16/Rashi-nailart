import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
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
