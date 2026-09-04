import type { MetadataRoute } from "next";

import { POLICY_LAST_UPDATED } from "@/lib/business";

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

/**
 * Deliberately static — it lists a fixed set of public pages and reads no data,
 * so it still renders if Supabase is unreachable. `lastModified` comes from the
 * same constant the policy pages print, so the date crawlers see can never drift
 * from the date a reader sees.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date(`${POLICY_LAST_UPDATED}T00:00:00Z`);

  return [
    { url: `${siteUrl}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/about`, lastModified, changeFrequency: "yearly", priority: 0.6 },
    { url: `${siteUrl}/contact`, lastModified, changeFrequency: "yearly", priority: 0.8 },
    { url: `${siteUrl}/terms`, lastModified, changeFrequency: "yearly", priority: 0.5 },
    { url: `${siteUrl}/privacy`, lastModified, changeFrequency: "yearly", priority: 0.5 },
    { url: `${siteUrl}/refund`, lastModified, changeFrequency: "yearly", priority: 0.5 },
  ];
}
