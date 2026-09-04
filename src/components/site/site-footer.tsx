import Link from "next/link";
import { CheckCircle2, Instagram, LogIn, Mail, Phone } from "lucide-react";

import { Logo } from "@/components/logo";
import { BUSINESS, RECONCILIATION_LINE, mailtoHref, telHref } from "@/lib/business";

const LEGAL_LINKS = [
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/refund", label: "Refunds" },
];

/**
 * Shared public-site footer.
 *
 * This is the site's discovery surface for the policy pages: a crawler enters at
 * `/` and these links are the only path to /terms, /privacy and /refund. It also
 * carries the registered legal name and a reachable phone and email, which is
 * what a payment aggregator checks the site against during merchant onboarding.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-border/50 bg-background/60">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <Logo className="h-9 w-auto" />
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-muted-foreground">
            <a
              href={telHref()}
              className="inline-flex items-center gap-1.5 text-sm transition-colors hover:text-primary"
            >
              <Phone className="h-4 w-4" /> {BUSINESS.phone.display}
            </a>
            <a
              href={mailtoHref()}
              className="inline-flex items-center gap-1.5 text-sm transition-colors hover:text-primary"
            >
              <Mail className="h-4 w-4" /> {BUSINESS.email}
            </a>
            {BUSINESS.instagram.map((ig) => (
              <a
                key={ig.url}
                href={ig.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Instagram — ${ig.label}`}
                className="inline-flex items-center gap-1.5 text-sm transition-colors hover:text-primary"
              >
                <Instagram className="h-5 w-5" /> {ig.label}
              </a>
            ))}
          </div>
        </div>

        <nav
          aria-label="Legal"
          className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-border/40 pt-6 text-sm text-muted-foreground sm:justify-start"
        >
          {LEGAL_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="transition-colors hover:text-foreground">
              {l.label}
            </Link>
          ))}
        </nav>

        {/* The registered legal name must be findable on the site — a reviewer
            comparing it against the KYC documents looks here or on /contact. */}
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{RECONCILIATION_LINE}</p>

        <div className="mt-4 flex flex-col items-center justify-between gap-2 text-xs text-muted-foreground sm:flex-row">
          <p className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Secure payments by Cashfree —
            UPI, cards, wallets &amp; net banking
          </p>
          <div className="flex items-center gap-4">
            <Link href="/login" className="flex items-center gap-1.5 transition-colors hover:text-foreground">
              <LogIn className="h-3.5 w-3.5" /> Staff &amp; admin login
            </Link>
            <p>
              © {new Date().getFullYear()} {BUSINESS.tradingName}. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
