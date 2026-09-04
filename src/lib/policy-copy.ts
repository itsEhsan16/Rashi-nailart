import { BOOKING_FEE, MEMBERSHIP_PRICE, PAYING_HOLD_MINUTES } from "@/lib/salon-data";

/**
 * Policy wording that appears in more than one place.
 *
 * The refund stance in particular used to live as a hardcoded sentence in the
 * FAQ, a second phrasing on the confirmation screen and a third in the README.
 * A payment aggregator reviewing the site reads all of them, and a contradiction
 * between the FAQ and the refund policy is the kind of thing that stalls an
 * application. Everything below has exactly one definition.
 */

/** The headline stance. Rendered verbatim on /refund and in the FAQ. */
export const REFUND_SUMMARY =
  `There is no cancellation or rescheduling facility. Once your slot is booked it is ` +
  `confirmed and locked in, and the ₹${BOOKING_FEE} confirmation fee is non-refundable — ` +
  `so please make sure you can attend before you book.`;

/** What the fee is for. */
export const BOOKING_FEE_EXPLAINER =
  `The ₹${BOOKING_FEE} confirmation fee reserves your slot and reduces no-shows. It is ` +
  `deducted from your total — the balance for your service is settled at the studio ` +
  `after your appointment.`;

/**
 * The carve-out. "No refunds" governs a change of mind; it cannot govern money
 * taken for a booking that never existed. Without this a refund policy is neither
 * approvable nor enforceable.
 */
export const PAYMENT_FAILURE_REMEDY = {
  reportWithinDays: 7,
  resolveWorkingDays: "5–7",
} as const;

export const PAYMENT_FAILURE_SUMMARY =
  `If money was debited but you did not receive a booking confirmation — a duplicate ` +
  `charge, a failed transaction, or a technical fault — tell us within ` +
  `${PAYMENT_FAILURE_REMEDY.reportWithinDays} days with your order ID. Once verified, we ` +
  `refund to the original payment method within ${PAYMENT_FAILURE_REMEDY.resolveWorkingDays} ` +
  `working days.`;

/** If the studio cancels, the customer is made whole. */
export const STUDIO_CANCELLATION_SUMMARY =
  `If we cancel your appointment — an artist is unavailable, or the studio is closed ` +
  `unexpectedly — you may rebook at no extra cost or have the confirmation fee refunded ` +
  `in full.`;

/**
 * The business is a sole proprietorship and is not registered for GST, so nothing
 * on the site may show a GST line or describe the receipt as a tax invoice.
 */
export const NO_GST_NOTE =
  `All prices are in Indian Rupees and are inclusive of all applicable taxes. We are not ` +
  `registered for GST, so no GST is charged and no tax invoice is issued. The document you ` +
  `can download after payment is a payment receipt.`;

export const MEMBERSHIP_SUMMARY =
  `The ₹${MEMBERSHIP_PRICE} membership runs for one year from the day you join and unlocks a ` +
  `member discount redeemed in-store by our team. We recognise you by the phone number you ` +
  `book with. It is personal to you, cannot be transferred, and is non-refundable once purchased.`;

export const SERVICE_DELIVERY_SUMMARY =
  `We provide in-person salon services at the studio, on the date and time slot you book. ` +
  `Nothing is shipped or delivered, and there is no digital product — so no shipping charges ` +
  `or delivery timelines apply.`;

export const SLOT_HOLD_SUMMARY =
  `When you start payment we hold your slot for ${PAYING_HOLD_MINUTES} minutes. If payment ` +
  `is not completed in that time the slot is released so someone else can book it.`;
