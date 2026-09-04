import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";

/**
 * Chrome for the public content pages (about, contact, terms, privacy, refund).
 *
 * A route group rather than the root layout, because the root wraps everything —
 * the admin/manager/staff dashboards, the login screens and the post-payment
 * confirmation pages — none of which should carry a marketing header and footer.
 * The home page keeps its own full-bleed sections and renders the same two
 * components directly.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12 md:py-16">{children}</main>
      <SiteFooter />
    </div>
  );
}
