import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { HOLD_EXPIRED_REASON } from "@/lib/salon-data";

type Admin = SupabaseClient<Database>;

/**
 * What happened when we tried to attach a successful payment to a booking.
 *
 *   verified → the booking is confirmed (we flipped it, or it already was)
 *   conflict → we found the row but cannot confirm it: the hold expired and
 *              someone else took the slot, or an admin cancelled/rejected it.
 *              Money was taken; a human has to sort it out.
 *   missing  → no row at all. Only reachable for historical rows created before
 *              expired-in-place landed, but kept so it is never silent.
 */
export type BookingSettleOutcome = "verified" | "conflict" | "missing";

/**
 * Attach a successful Cashfree payment to its booking, idempotently.
 *
 * Shared by BOTH reconcilers — the webhook and the return page — so they cannot
 * disagree about what a zero-row update means. Previously each did a single
 * guarded UPDATE and treated "matched nothing" as success, which is how a paid
 * booking could vanish while the customer was told it had failed.
 *
 * Order of attempts: the guarded fast path, then a diagnosis of why it missed.
 */
export async function settleBookingPayment(
  admin: Admin,
  appointmentId: string,
  paid: { cfPaymentId: string | null; method: string | null },
): Promise<BookingSettleOutcome> {
  const at = new Date().toISOString();
  const verifiedFields = {
    payment_status: "verified",
    paid_at: at,
    verified_at: at,
    cf_payment_id: paid.cfPaymentId,
    payment_method: paid.method,
    rejection_reason: null,
  };

  // Fast path: the row is still pending, exactly as expected.
  const { data: updated, error: updErr } = await admin
    .from("appointments")
    .update(verifiedFields)
    .eq("id", appointmentId)
    .eq("payment_status", "pending_payment")
    .select("id")
    .maybeSingle();
  if (updErr) console.error("[settleBookingPayment] guarded update failed:", updErr.message);
  if (updated) return "verified";

  // Matched nothing — find out why instead of assuming success.
  const { data, error: selErr } = await admin
    .from("appointments")
    .select("id, payment_status, rejection_reason")
    .eq("id", appointmentId)
    .maybeSingle();
  if (selErr) console.error("[settleBookingPayment] re-select failed:", selErr.message);
  const row = data as
    | { id: string; payment_status: string; rejection_reason: string | null }
    | null;

  if (!row) return "missing";
  if (row.payment_status === "verified") return "verified"; // the other channel won

  // Expired in place while the customer was at the gateway — revive it. The
  // partial unique index is the arbiter: if someone took the slot meanwhile the
  // update raises 23505 and this becomes a conflict a human must resolve.
  if (row.payment_status === "rejected" && row.rejection_reason === HOLD_EXPIRED_REASON) {
    const { data: revived, error: revErr } = await admin
      .from("appointments")
      .update(verifiedFields)
      .eq("id", appointmentId)
      .eq("payment_status", "rejected")
      .select("id")
      .maybeSingle();
    if (revErr) {
      console.error("[settleBookingPayment] revive failed:", revErr.code, revErr.message);
      return "conflict";
    }
    return revived ? "verified" : "conflict";
  }

  // Cancelled, or rejected for some other reason. Not ours to overwrite.
  return "conflict";
}

export type MembershipPayment = {
  id: string;
  purpose: string;
  client_name: string | null;
  phone: string | null;
  amount: number;
  membership_id: string | null;
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Create the membership a verified membership payment pays for: benefits start
 * the day the member joins (activation = start date), expires in 1 year. Idempotent
 * — if the payment already links a membership, this is a no-op. Returns the
 * membership id (existing or new).
 */
export async function fulfillMembershipPayment(
  admin: Admin,
  pay: MembershipPayment,
): Promise<string | null> {
  if (pay.purpose !== "membership") return null;
  if (pay.membership_id) return pay.membership_id; // already fulfilled

  const today = new Date();
  const expires = new Date(today);
  expires.setFullYear(expires.getFullYear() + 1);

  const { data: mem } = await admin
    .from("memberships")
    .insert({
      client_name: pay.client_name ?? "Member",
      phone: pay.phone ?? "",
      start_date: isoDate(today),
      activation_date: isoDate(today), // benefits start on join
      expires_at: isoDate(expires),
      active: true,
      amount_paid: pay.amount,
    })
    .select("id")
    .single();

  const memRow = mem as { id: string } | null;
  if (!memRow) return null;

  await admin.from("payments").update({ membership_id: memRow.id }).eq("id", pay.id);
  return memRow.id;
}
