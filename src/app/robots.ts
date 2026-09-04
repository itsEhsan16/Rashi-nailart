import type { MetadataRoute } from "next";

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

/**
 * The dashboards and login screens already set `robots: noindex` in their own
 * layouts; this is defence in depth, and it is what a human reviewer actually
 * opens when checking a site — a 404 at /robots.txt is itself a finding.
 *
 * The payment confirmation routes are excluded because they carry a per-order
 * query string and reveal a customer's booking details.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/manager/",
        "/staff/",
        "/login",
        "/api/",
        "/booking/confirm",
        "/membership/confirm",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
