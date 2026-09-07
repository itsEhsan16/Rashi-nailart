import type { Metadata } from "next";
import { Mail, MapPin, Phone } from "lucide-react";

import { PageHeading } from "../_page-heading";
import {
  BUSINESS,
  PAYMENT_COLLECTOR_LINE,
  mailtoHref,
  officeLines,
  telHref,
} from "@/lib/business";
import { getCatalog } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Contact Us",
  description: `Phone, email and studio locations for ${BUSINESS.tradingName} in Mumbai.`,
};

/** Branch addresses are admin-editable and may be blank, so fall back to a
 *  sensible label rather than rendering an empty line. Never fall back to the
 *  registered office: it is the legal address of the proprietorship, and using it
 *  here would put a Borivali West address on the Vile Parle and Bandra cards. */
function branchAddress(name: string, address: string | null): string {
  return address?.trim() || `${name}, Mumbai, Maharashtra`;
}

/** Use the admin-supplied map link if there is one, else a search that always resolves. */
function mapLink(address: string, mapUrl: string | null): string {
  return (
    mapUrl?.trim() ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
  );
}

export default async function ContactPage() {
  const { branches } = await getCatalog();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "HealthAndBeautyBusiness",
    name: BUSINESS.tradingName,
    legalName: BUSINESS.legalName,
    telephone: BUSINESS.phone.tel,
    email: BUSINESS.email,
    url: `${(process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "")}/contact`,
    address: {
      "@type": "PostalAddress",
      streetAddress: `${BUSINESS.registeredOffice.line1}, ${BUSINESS.registeredOffice.line2}`,
      addressLocality: BUSINESS.registeredOffice.locality,
      addressRegion: BUSINESS.registeredOffice.state,
      postalCode: BUSINESS.registeredOffice.pincode,
      addressCountry: "IN",
    },
    sameAs: BUSINESS.instagram.map((i) => i.url),
  };

  return (
    <article className="legal-prose">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PageHeading title="Contact Us" showUpdated={false} />

      <p>
        We&apos;re happy to help with a booking, a payment question, or anything else. The fastest
        way to reach us is the phone.
      </p>

      <div className="my-6 grid gap-3 sm:grid-cols-2">
        <a
          href={telHref()}
          className="flex items-start gap-3 rounded-xl border border-border/60 p-4 no-underline transition-colors hover:border-primary/40"
        >
          <Phone className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <span>
            <span className="block text-sm text-muted-foreground">Phone &amp; WhatsApp</span>
            <span className="font-medium text-foreground">{BUSINESS.phone.display}</span>
          </span>
        </a>
        <a
          href={mailtoHref()}
          className="flex items-start gap-3 rounded-xl border border-border/60 p-4 no-underline transition-colors hover:border-primary/40"
        >
          <Mail className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <span>
            <span className="block text-sm text-muted-foreground">Email</span>
            <span className="font-medium break-all text-foreground">{BUSINESS.email}</span>
          </span>
        </a>
      </div>

      <h2 id="studios">Our studios</h2>
      <div className="my-4 grid gap-3 sm:grid-cols-2">
        {branches.map((b) => {
          const address = branchAddress(b.name, b.address);
          return (
            <div key={b.name} className="rounded-xl border border-border/60 p-4">
              <h3 className="mt-0 flex items-center gap-2 font-display text-lg">
                <MapPin className="h-4 w-4 text-primary" /> {b.name}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">{address}</p>
              <p className="mt-2 text-sm">
                <a href={mapLink(address, b.mapUrl)} target="_blank" rel="noopener noreferrer">
                  View on map
                </a>
                {" · "}
                <a href={b.phone?.trim() ? `tel:${b.phone.replace(/[^\d+]/g, "")}` : telHref()}>
                  {b.phone?.trim() || BUSINESS.phone.display}
                </a>
              </p>
            </div>
          );
        })}
      </div>

      <h2 id="hours">Opening hours</h2>
      <p>
        Open daily. Appointment slots run from late morning to evening — the booking form shows
        exactly which times are available for your chosen artist and date.
      </p>

      <h2 id="registered-office">Registered office</h2>
      <p className="note">
        This is our registered business address — the legal address of the proprietorship. Our
        Borivali W studio trades from here; Vile Parle and Bandra are elsewhere, listed above.
        Please book an appointment before visiting any studio.
      </p>
      <p>
        <strong>{BUSINESS.legalName}</strong>
        <br />
        {officeLines().map((line) => (
          <span key={line}>
            {line}
            <br />
          </span>
        ))}
      </p>
      <p>{PAYMENT_COLLECTOR_LINE}</p>

      <h2 id="social">Follow us</h2>
      <p>
        {BUSINESS.instagram.map((ig, i) => (
          <span key={ig.url}>
            {i > 0 ? " · " : ""}
            <a href={ig.url} target="_blank" rel="noopener noreferrer">
              Instagram — {ig.label}
            </a>
          </span>
        ))}
      </p>
    </article>
  );
}
