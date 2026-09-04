import Link from "next/link";
import type { Metadata } from "next";

import { PageHeading } from "../_page-heading";
import { BUSINESS, PAYMENT_COLLECTOR_LINE, mailtoHref, officeLines, telHref } from "@/lib/business";
import {
  BOOKING_FEE_EXPLAINER,
  MEMBERSHIP_SUMMARY,
  NO_GST_NOTE,
  REFUND_SUMMARY,
  SERVICE_DELIVERY_SUMMARY,
  SLOT_HOLD_SUMMARY,
} from "@/lib/policy-copy";
import { BOOKING_FEE } from "@/lib/salon-data";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: `Terms and conditions for booking services with ${BUSINESS.tradingName}.`,
};

export default function TermsPage() {
  return (
    <article className="legal-prose">
      <PageHeading title="Terms & Conditions" />

      <p>
        These terms govern your use of this website and any appointment you book through it. By
        booking or paying, you agree to them.
      </p>

      <h2 id="who-we-are">1. Who we are</h2>
      <p>{PAYMENT_COLLECTOR_LINE}</p>
      <p>
        <strong>Registered office</strong>
        <br />
        {officeLines().map((line) => (
          <span key={line}>
            {line}
            <br />
          </span>
        ))}
      </p>
      <p>
        Phone <a href={telHref()}>{BUSINESS.phone.display}</a> · Email{" "}
        <a href={mailtoHref()}>{BUSINESS.email}</a>
      </p>

      <h2 id="what-we-provide">2. What we provide</h2>
      <p>
        We provide in-person salon services — nail art, gel polish, extensions and related
        treatments — at our studios. This website lets you reserve a date, time slot and artist in
        advance.
      </p>
      <p>{BOOKING_FEE_EXPLAINER}</p>

      <h2 id="pricing">3. Pricing and taxes</h2>
      <p>{NO_GST_NOTE}</p>
      <p>
        Service prices shown on this site are indicative of the standard treatment. Any add-ons or
        extra work you agree to at the studio are charged in addition and settled there.
      </p>

      <h2 id="booking">4. Booking and slot holds</h2>
      <p>{SLOT_HOLD_SUMMARY}</p>
      <ul>
        <li>One service per booking. To book another service, please make a separate appointment.</li>
        <li>
          Your booking is confirmed only when payment succeeds and you see a confirmation screen. If
          you did not see one, please contact us before booking again.
        </li>
        <li>
          Please arrive on time. If you are significantly late we may not be able to complete the
          service within your slot.
        </li>
      </ul>

      <h2 id="cancellation">5. Cancellation and refunds</h2>
      <p>{REFUND_SUMMARY}</p>
      <p>
        Limited exceptions apply where a payment fails or we cancel on you — see our{" "}
        <Link href="/refund">Cancellation &amp; Refund Policy</Link>.
      </p>

      <h2 id="service-delivery">6. Service delivery</h2>
      <p>{SERVICE_DELIVERY_SUMMARY}</p>

      <h2 id="payments">7. Payments</h2>
      <p>
        The ₹{BOOKING_FEE} confirmation fee is collected online through Cashfree Payments, which
        supports UPI, cards, wallets and net banking. Payment details are entered on Cashfree&apos;s
        secure hosted checkout — we never see or store your card number, UPI PIN or bank
        credentials.
      </p>

      <h2 id="membership">8. Membership</h2>
      <p>{MEMBERSHIP_SUMMARY}</p>

      <h2 id="conduct">9. Right to refuse service</h2>
      <p>
        We may decline or stop a service where it would be unsafe or unsuitable — for example an
        allergy, a skin or nail condition that makes treatment inadvisable, or abusive behaviour
        towards our team. Please tell your artist about any allergy or condition before we begin.
      </p>

      <h2 id="liability">10. Liability</h2>
      <p>
        We take care to provide our services safely and to a professional standard. To the extent
        permitted by law, our liability in connection with a booking is limited to the amount you
        paid us for it. Nothing here limits liability that cannot be limited by law.
      </p>

      <h2 id="changes">11. Changes to these terms</h2>
      <p>
        We may update these terms. The version published on this page at the time you book is the
        one that applies to that booking.
      </p>

      <h2 id="law">12. Governing law</h2>
      <p>
        These terms are governed by the laws of India, and the courts at {BUSINESS.jurisdiction}{" "}
        have exclusive jurisdiction over any dispute.
      </p>

      <h2 id="contact">13. Contact</h2>
      <p>
        Questions about these terms: <a href={mailtoHref("Question about Terms")}>{BUSINESS.email}</a>{" "}
        or <a href={telHref()}>{BUSINESS.phone.display}</a>. Full details on our{" "}
        <Link href="/contact">contact page</Link>.
      </p>
    </article>
  );
}
