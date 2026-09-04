import Link from "next/link";
import type { Metadata } from "next";

import { PageHeading } from "../_page-heading";
import { BUSINESS, RECONCILIATION_LINE, mailtoHref, officeLines, telHref } from "@/lib/business";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${BUSINESS.tradingName} collects, uses and protects your personal information.`,
};

export default function PrivacyPage() {
  return (
    <article className="legal-prose">
      <PageHeading title="Privacy Policy" />

      <p>
        This policy explains what personal information we collect when you book with us, why we
        collect it, and what we do with it. {RECONCILIATION_LINE}
      </p>

      <h2 id="what-we-collect">1. What we collect</h2>
      <p>When you book an appointment we collect:</p>
      <ul>
        <li>your name;</li>
        <li>your mobile number;</li>
        <li>your booking details — branch, date, time slot, service, chosen artist;</li>
        <li>any special requests you choose to type in;</li>
        <li>
          the status of your payment, together with the order and payment reference numbers returned
          by our payment gateway.
        </li>
      </ul>
      <p>
        <strong>We never collect or store your card number, UPI PIN, CVV, or bank credentials.</strong>{" "}
        Those are entered on Cashfree&apos;s secure hosted checkout and never reach our systems.
      </p>
      <p>
        Our payment gateway requires an email address for every order. Because we ask you only for a
        phone number, we generate a placeholder address from your phone digits for that field. It is
        not a real mailbox, it is not used to contact you, and we do not sell or share it.
      </p>

      <h2 id="why">2. Why we use it</h2>
      <ul>
        <li>to hold your slot and confirm your appointment;</li>
        <li>to recognise you at the studio and apply any membership benefit;</li>
        <li>to contact you about your booking if something changes;</li>
        <li>to keep records of payments received, as any business must.</li>
      </ul>
      <p>We do not use your details for marketing, and we do not sell them to anyone.</p>

      <h2 id="cookies">3. Cookies and tracking</h2>
      <p>
        This site sets no advertising or analytics cookies. We do not use Google Analytics, tracking
        pixels or any third-party advertising tag. The only cookie we set is a session cookie for our
        own staff and administrators when they sign in to manage bookings.
      </p>

      <h2 id="who-we-share-with">4. Who processes your information</h2>
      <p>We use a small number of service providers to run this site:</p>
      <ul>
        <li>
          <strong>Cashfree Payments</strong> — processes the confirmation fee and membership payment.
        </li>
        <li>
          <strong>Supabase</strong> — hosts the database that stores your booking.
        </li>
        <li>
          <strong>Vercel</strong> — hosts and serves this website.
        </li>
      </ul>
      <p>
        Each handles data on our instructions. We also disclose information where the law requires
        it.
      </p>

      <h2 id="retention">5. How long we keep it</h2>
      <p>
        We keep booking and payment records for as long as we need them to run the business and to
        meet our record-keeping obligations. Abandoned bookings that were never paid for are removed
        automatically.
      </p>

      <h2 id="security">6. Security</h2>
      <p>
        The site is served over HTTPS, access to booking data is restricted to our own staff
        accounts, and payment credentials never pass through our systems. No system is perfectly
        secure, but we take reasonable measures to protect what we hold.
      </p>

      <h2 id="your-rights">7. Your choices</h2>
      <p>
        You can ask us what we hold about you, ask us to correct it, or ask us to delete it where we
        are not required to keep it. Email{" "}
        <a href={mailtoHref("Privacy request")}>{BUSINESS.email}</a> and we will respond as soon as
        we reasonably can.
      </p>

      <h2 id="children">8. Children</h2>
      <p>
        Our booking service is intended for adults. Where a service is provided to a minor, we expect
        a parent or guardian to make the booking and be present.
      </p>

      <h2 id="grievance">9. Contact for privacy questions and complaints</h2>
      <p>
        If you have a concern about how we handle your information, contact us and we will look into
        it:
      </p>
      <p>
        <strong>{BUSINESS.proprietor}</strong> — Proprietor, {BUSINESS.legalName}
        <br />
        {officeLines().map((line) => (
          <span key={line}>
            {line}
            <br />
          </span>
        ))}
        Email <a href={mailtoHref("Privacy complaint")}>{BUSINESS.email}</a> · Phone{" "}
        <a href={telHref()}>{BUSINESS.phone.display}</a>
      </p>

      <h2 id="changes">10. Changes</h2>
      <p>
        We may update this policy. The date at the top of this page shows when it last changed.
      </p>
      <p className="note">
        See also our <Link href="/terms">Terms &amp; Conditions</Link> and{" "}
        <Link href="/refund">Cancellation &amp; Refund Policy</Link>.
      </p>
    </article>
  );
}
