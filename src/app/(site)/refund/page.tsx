import Link from "next/link";
import type { Metadata } from "next";

import { PageHeading } from "../_page-heading";
import { BUSINESS, mailtoHref, telHref } from "@/lib/business";
import {
  PAYMENT_FAILURE_REMEDY,
  PAYMENT_FAILURE_SUMMARY,
  REFUND_SUMMARY,
  STUDIO_CANCELLATION_SUMMARY,
} from "@/lib/policy-copy";
import { BOOKING_FEE } from "@/lib/salon-data";

export const metadata: Metadata = {
  title: "Cancellation & Refund Policy",
  description: `Cancellation and refund policy for bookings with ${BUSINESS.tradingName}.`,
};

export default function RefundPage() {
  return (
    <article className="legal-prose">
      <PageHeading title="Cancellation & Refund Policy" />

      <h2 id="summary">The short version</h2>
      <p>
        <strong>{REFUND_SUMMARY}</strong>
      </p>

      <h2 id="why">Why the fee is non-refundable</h2>
      <p>
        The ₹{BOOKING_FEE} confirmation fee holds an artist and a time slot that we then cannot
        offer to anyone else. It is deducted from your total, so if you attend it costs you nothing
        extra — the balance for your service is settled at the studio.
      </p>

      <h2 id="failed-payments">If you were charged but have no booking</h2>
      <p>{PAYMENT_FAILURE_SUMMARY}</p>
      <p>This covers:</p>
      <ul>
        <li>money debited but no confirmation screen or booking shown;</li>
        <li>being charged twice for the same booking;</li>
        <li>
          a payment that succeeded at your bank while the slot was taken by someone else in the
          meantime.
        </li>
      </ul>
      <p>
        Please <strong>do not pay again</strong> if this happens — contact us first. Have your order
        ID ready (it is shown on screen after payment, and in your bank or UPI statement).
      </p>
      <p>
        Report it by email to <a href={mailtoHref("Payment issue")}>{BUSINESS.email}</a> or by phone
        on <a href={telHref()}>{BUSINESS.phone.display}</a>, within{" "}
        {PAYMENT_FAILURE_REMEDY.reportWithinDays} days of the charge.
      </p>

      <h2 id="we-cancel">If we cancel your appointment</h2>
      <p>{STUDIO_CANCELLATION_SUMMARY}</p>

      <h2 id="how-refunds-are-paid">How refunds are paid</h2>
      <p>
        Approved refunds go back to the original payment method — the card, UPI ID or account you
        paid from. We cannot redirect a refund to a different account. Once we process it, your bank
        may take a few additional working days to show the credit.
      </p>

      <h2 id="not-covered">What is not refundable</h2>
      <ul>
        <li>Changing your mind, or being unable to attend.</li>
        <li>Arriving too late for the service to be completed within your slot.</li>
        <li>Not turning up.</li>
        <li>The annual membership fee, once purchased.</li>
        <li>Services already provided at the studio.</li>
      </ul>
      <p>
        If you are unhappy with a service you received, please tell us before you leave the studio so
        we can put it right.
      </p>

      <h2 id="contact">Contact us</h2>
      <p>
        <a href={mailtoHref("Refund request")}>{BUSINESS.email}</a> ·{" "}
        <a href={telHref()}>{BUSINESS.phone.display}</a>
      </p>
      <p className="note">
        This policy sits alongside our <Link href="/terms">Terms &amp; Conditions</Link>.
      </p>
    </article>
  );
}
