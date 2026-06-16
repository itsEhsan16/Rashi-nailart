"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { MEMBERSHIP_PRICE } from "@/lib/salon-data";
import { uploadProof, validateProofFile } from "@/lib/payment-proofs";
import { getPaymentSettings } from "@/lib/actions/booking";
import { membershipSchema, type MembershipValues } from "@/lib/validations/membership";
import { uploadProofSchema } from "@/lib/validations/booking";

/**
 * Start a ₹100 membership purchase. Creates a `payments` row in `pending_payment`
 * and returns its id (the customer's upload capability) plus the UPI settings.
 * The membership row itself is only created once an admin verifies the proof
 * (see fulfillMembershipPayment), with activation_date = +10 days.
 */
export async function createMembership(input: MembershipValues) {
  const parsed = membershipSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid details" };
  }
  const { client_name, phone } = parsed.data;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("payments")
    .insert({
      purpose: "membership",
      amount: MEMBERSHIP_PRICE,
      currency: "INR",
      status: "pending_payment",
      client_name,
      phone,
    })
    .select("id")
    .single();
  if (error) return { ok: false as const, error: error.message };
  const pay = data as { id: string };

  const settings = await getPaymentSettings();
  return { ok: true as const, paymentId: pay.id, amount: MEMBERSHIP_PRICE, settings };
}

/**
 * Customer uploads their UPI payment screenshot for a pending membership. The
 * unguessable payment id is the capability. Validates the image, stores it in
 * the private bucket, and flips the payment to `payment_uploaded`.
 */
export async function uploadMembershipProof(formData: FormData) {
  const parsed = uploadProofSchema.safeParse({ id: formData.get("paymentId") });
  if (!parsed.success) return { ok: false as const, error: "Invalid payment reference." };

  const valid = validateProofFile(formData.get("screenshot"));
  if (!valid.ok) return { ok: false as const, error: valid.error };

  const admin = createAdminClient();
  const { data } = await admin
    .from("payments")
    .select("id, status, purpose")
    .eq("id", parsed.data.id)
    .maybeSingle();
  const pay = data as { id: string; status: string; purpose: string } | null;
  if (!pay || pay.purpose !== "membership") {
    return { ok: false as const, error: "Membership request not found. Please start again." };
  }
  if (pay.status !== "pending_payment" && pay.status !== "payment_uploaded") {
    return { ok: false as const, error: "This request can no longer accept a payment proof." };
  }

  const uploaded = await uploadProof(admin, "memberships", pay.id, valid.file);
  if (!uploaded.ok) return { ok: false as const, error: uploaded.error };

  const { error } = await admin
    .from("payments")
    .update({
      upi_screenshot_url: uploaded.path,
      uploaded_at: new Date().toISOString(),
      status: "payment_uploaded",
      updated_at: new Date().toISOString(),
    })
    .eq("id", pay.id);
  if (error) return { ok: false as const, error: error.message };

  return { ok: true as const };
}
