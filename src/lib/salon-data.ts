import type { Database } from "@/integrations/supabase/types";

/**
 * Bookable studios, in display order. THE single source of truth for the app's
 * branch vocabulary: BRANCHES_TUPLE in @/lib/validations/booking re-exports this,
 * so every z.enum() gate and every admin dropdown widen together. They used to be
 * two independent literals and drifted.
 *
 * Adding a branch is three steps, in this order:
 *   1. SQL   — alter type public.branch add value '<label>', in its own migration
 *              (see supabase/migrations/20260908120000_branch_enum_borivali_w.sql)
 *   2. here  — add the label
 *   3. types — add the same label to Database["public"]["Enums"]["branch"] in
 *              src/integrations/supabase/types.ts (hand-maintained, see README)
 * BranchIsDbEnumLabel below turns a missed step 3 into a compile error rather
 * than a PostgREST 400 on every .eq("branch", …) at runtime.
 */
export const BRANCHES = ["Vile Parle", "Bandra", "Borivali W"] as const;
export type Branch = (typeof BRANCHES)[number];

/** Compile-time proof that every branch we offer exists as a DB enum label. */
type MustExtend<A extends B, B> = A;
export type BranchIsDbEnumLabel = MustExtend<Branch, Database["public"]["Enums"]["branch"]>;

export const TIME_SLOTS = [
  "11:45 AM – 1:15 PM",
  "1:15 PM – 2:45 PM",
  "2:45 PM – 4:15 PM",
  "4:15 PM – 5:45 PM",
  "5:45 PM – 7:15 PM",
  "7:00 PM – 8:30 PM",
] as const;

export const SERVICES = [
  { name: "Stick On Extension Nails", price: 499 },
  { name: "Gel Polish Hand & Toe", price: 499 },
  { name: "Soft Gel Extension Nails", price: 499 },
  { name: "Acrylic Extension Nails", price: 799 },
] as const;

export const MEMBERSHIP_PRICE = 100; // ₹100 / year
export const BOOKING_FEE = 50; // ₹50 booking fee paid before confirmation

/**
 * Cashfree booking lifecycle:
 *   pending_payment  → slot held, awaiting the customer's online payment
 *   verified         → payment confirmed (webhook / return-page reconcile),
 *                      booking finalized automatically — no admin action
 *   cancelled        → admin cancelled a confirmed booking (slot released)
 *   rejected         → payment rejected, slot released (rare)
 *   payment_uploaded → LEGACY (old manual screenshot-verification flow). No longer
 *                      written; kept in the vocabulary so historical rows remain
 *                      valid and render correctly.
 */
export const BOOKING_STATUSES = [
  "pending_payment",
  "payment_uploaded",
  "verified",
  "rejected",
  "cancelled",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Statuses that occupy a slot (mirror of the uq_appointment_slot partial index). */
export const SLOT_HOLDING_STATUSES: readonly BookingStatus[] = [
  "pending_payment",
  "payment_uploaded",
  "verified",
];

/** Max upload size for an admin image upload (UPI QR / staff photo). */
export const MAX_PROOF_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_PROOF_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

/**
 * True if an uploaded file is an accepted image (admin QR / staff photo). Matches
 * by MIME type, but also accepts HEIC/HEIF by file extension because some browsers
 * report no MIME type for those (iPhone photos); they're transcoded to JPEG
 * server-side on upload.
 */
export function isAcceptedProofFile(file: { type: string; name: string }): boolean {
  const type = file.type.toLowerCase();
  if ((ALLOWED_PROOF_TYPES as readonly string[]).includes(type)) return true;
  if ((type === "" || type === "application/octet-stream") && /\.(heic|heif)$/i.test(file.name)) {
    return true;
  }
  return false;
}

/**
 * Two hold windows, because a hold with a live Cashfree order behind it is a
 * completely different thing from one without.
 *
 * PENDING_HOLD_MINUTES — no order exists yet. The customer is still on the form
 * or looking at the pay screen; nothing of value is attached to the row, so an
 * abandoned hold is deleted outright.
 *
 * PAYING_HOLD_MINUTES — a Cashfree order exists and the customer has been sent
 * to the gateway. A UPI app-switch routinely takes minutes (collect mandates
 * time out around 5, PSP settle lag adds a couple, and netbanking with an OTP
 * step-up can reach 10), so this window is far longer. Rows in this state are
 * NEVER deleted — see reclaimStaleHolds in actions/booking.ts. Deleting one
 * destroys the only mapping from cashfree_order_id back to the customer, slot
 * and amount, which is how a paid booking becomes unrecoverable.
 */
export const PENDING_HOLD_MINUTES = 2.5;
export const PAYING_HOLD_MINUTES = 15;

/**
 * Written to `rejection_reason` when a hold carrying a live Cashfree order ages
 * out. The reconcilers match on it to tell an expired-but-payable booking apart
 * from one an admin genuinely rejected, so a late webhook can revive it.
 */
export const HOLD_EXPIRED_REASON = "Hold expired — booking fee not received";

/**
 * How staff/manager/admin record that the in-store balance (service + extras)
 * was settled. The ₹50 booking fee is always paid online; this is the rest.
 * 'upi' is a legacy/generic value kept only for rows recorded before the split.
 */
export const PAYMENT_MODE_VALUES = ["gpay", "phonepe", "paytm", "cash"] as const;
export type PaymentMode = (typeof PAYMENT_MODE_VALUES)[number];

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  gpay: "GPay",
  phonepe: "PhonePe",
  paytm: "Paytm",
  cash: "Cash",
};

/** Display label for a stored payment mode, incl. the legacy generic 'upi'. */
export function paymentModeLabel(mode: string): string {
  if (mode === "upi") return "UPI";
  return (PAYMENT_MODE_LABELS as Record<string, string>)[mode] ?? mode;
}
