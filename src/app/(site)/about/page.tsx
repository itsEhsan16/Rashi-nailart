import Link from "next/link";
import type { Metadata } from "next";

import { PageHeading } from "../_page-heading";
import { BUSINESS, RECONCILIATION_LINE, mailtoHref, telHref } from "@/lib/business";
import { BOOKING_FEE_EXPLAINER, NO_GST_NOTE } from "@/lib/policy-copy";
import { getCatalog } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "About Us",
  description: `${BUSINESS.tradingName} — premium nail art, gel polish and extensions in Mumbai.`,
};

export default async function AboutPage() {
  const { branches, services } = await getCatalog();

  return (
    <article className="legal-prose">
      <PageHeading title="About Us" showUpdated={false} />

      <p>
        {BUSINESS.tradingName} is a nail and beauty studio in Mumbai. We do premium nail art, gel
        polish, and hand-painted and extension work, in a clean, unhurried space with artists who
        take their time over the detail.
      </p>
      <p>
        We run {branches.length} {branches.length === 1 ? "studio" : "studios"} —{" "}
        {branches.map((b) => b.name).join(" and ")} — and take appointments online so you can see
        real availability and pick your artist rather than calling around.
      </p>

      <h2 id="services">What we do</h2>
      <ul>
        {services.map((s) => (
          <li key={s.name}>
            {s.name} — ₹{s.price}
          </li>
        ))}
      </ul>
      <p className="note">{NO_GST_NOTE}</p>

      <h2 id="how-booking-works">How booking works</h2>
      <p>{BOOKING_FEE_EXPLAINER}</p>
      <p>
        Full details are in our <Link href="/terms">Terms &amp; Conditions</Link> and{" "}
        <Link href="/refund">Cancellation &amp; Refund Policy</Link>.
      </p>

      <h2 id="business-details">Business details</h2>
      <p>{RECONCILIATION_LINE}</p>
      <p>
        Phone <a href={telHref()}>{BUSINESS.phone.display}</a> · Email{" "}
        <a href={mailtoHref()}>{BUSINESS.email}</a> ·{" "}
        <Link href="/contact">Full contact details and studio addresses</Link>
      </p>
    </article>
  );
}
