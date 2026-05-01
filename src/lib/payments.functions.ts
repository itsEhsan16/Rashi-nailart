// Razorpay payment server functions.
// Uses Razorpay REST API directly (Worker-safe, no Node-only SDK).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BRANCH = z.enum(["Vile Parle", "Bandra", "Kandivali"]);

function basicAuthHeader() {
  const id = process.env.RAZORPAY_KEY_ID!;
  const secret = process.env.RAZORPAY_KEY_SECRET!;
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

async function createRazorpayOrder(amountInRupees: number, notes: Record<string, string>) {
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: basicAuthHeader(),
    },
    body: JSON.stringify({
      amount: amountInRupees * 100, // paise
      currency: "INR",
      notes,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Razorpay order failed: ${res.status} ${txt}`);
  }
  return (await res.json()) as { id: string; amount: number; currency: string };
}

// ---------- Check membership by phone ----------
export const checkMembershipFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ phone: z.string().trim().min(7).max(20) }))
  .handler(async ({ data }) => {
    const today = new Date().toISOString().slice(0, 10);
    const { data: rows } = await supabaseAdmin
      .from("memberships")
      .select("id, client_name, phone, expires_at, active")
      .eq("phone", data.phone.trim())
      .eq("active", true)
      .gte("expires_at", today)
      .order("expires_at", { ascending: false })
      .limit(1);
    const membership = rows?.[0] ?? null;
    return { ok: true as const, isMember: !!membership, membership };
  });

// ---------- Create payment order for MEMBERSHIP (₹100) ----------
export const createMembershipOrderFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      client_name: z.string().trim().min(1).max(100),
      phone: z.string().trim().min(7).max(20),
    })
  )
  .handler(async ({ data }) => {
    const order = await createRazorpayOrder(100, {
      purpose: "membership",
      phone: data.phone,
      client_name: data.client_name,
    });
    const { data: inserted, error } = await supabaseAdmin
      .from("payments")
      .insert({
        purpose: "membership",
        amount: 100,
        currency: "INR",
        status: "created",
        razorpay_order_id: order.id,
        client_name: data.client_name,
        phone: data.phone,
      })
      .select("id")
      .single();
    if (error) return { ok: false as const, error: error.message };
    return {
      ok: true as const,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID!,
      paymentId: inserted.id,
    };
  });

// ---------- Create payment order for BOOKING (₹50) ----------
export const createBookingOrderFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      client_name: z.string().trim().min(1).max(100),
      phone: z.string().trim().min(7).max(20),
      branch: BRANCH,
      appointment_date: z.string().min(1),
      time_slot: z.string().min(1).max(50),
      service: z.string().min(1).max(100),
      price: z.number().int().positive(),
      staff_name: z.string().min(1).max(50),
      special_requests: z.string().max(500).optional().nullable(),
    })
  )
  .handler(async ({ data }) => {
    // Double-booking guard before charging
    const { data: clash } = await supabaseAdmin
      .from("appointments")
      .select("id")
      .eq("branch", data.branch)
      .eq("staff_name", data.staff_name)
      .eq("appointment_date", data.appointment_date)
      .eq("time_slot", data.time_slot)
      .eq("payment_status", "paid")
      .maybeSingle();
    if (clash) {
      return {
        ok: false as const,
        error: `This slot is already booked. Please pick another time.`,
      };
    }

    // Auto-detect membership and apply 50% off nail-art services
    const today = new Date().toISOString().slice(0, 10);
    const { data: memRows } = await supabaseAdmin
      .from("memberships")
      .select("id")
      .eq("phone", data.phone)
      .eq("active", true)
      .gte("expires_at", today)
      .limit(1);
    const isMember = !!memRows?.length;
    const isNailService = /nail/i.test(data.service);
    const discount = isMember && isNailService ? Math.round(data.price * 0.5) : 0;
    const finalServicePrice = data.price - discount;

    const order = await createRazorpayOrder(50, {
      purpose: "booking",
      phone: data.phone,
      client_name: data.client_name,
    });

    // Create the appointment row in pending state
    const { data: appt, error: aErr } = await supabaseAdmin
      .from("appointments")
      .insert({
        client_name: data.client_name,
        phone: data.phone,
        branch: data.branch,
        appointment_date: data.appointment_date,
        time_slot: data.time_slot,
        service: data.service,
        price: finalServicePrice,
        staff_name: data.staff_name,
        special_requests: data.special_requests ?? null,
        payment_status: "pending",
        razorpay_order_id: order.id,
        is_member: isMember,
        discount_applied: discount,
      })
      .select("id")
      .single();
    if (aErr) return { ok: false as const, error: aErr.message };

    const { data: pay, error: pErr } = await supabaseAdmin
      .from("payments")
      .insert({
        purpose: "booking",
        amount: 50,
        currency: "INR",
        status: "created",
        razorpay_order_id: order.id,
        client_name: data.client_name,
        phone: data.phone,
        appointment_id: appt.id,
      })
      .select("id")
      .single();
    if (pErr) return { ok: false as const, error: pErr.message };

    return {
      ok: true as const,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID!,
      paymentId: pay.id,
      appointmentId: appt.id,
      isMember,
      discount,
      finalServicePrice,
    };
  });

// ---------- Verify Razorpay payment client-side handoff (signature check) ----------
import crypto from "crypto";

export const verifyPaymentFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      razorpay_order_id: z.string().min(1),
      razorpay_payment_id: z.string().min(1),
      razorpay_signature: z.string().min(1),
    })
  )
  .handler(async ({ data }) => {
    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update(`${data.razorpay_order_id}|${data.razorpay_payment_id}`)
      .digest("hex");
    if (expected !== data.razorpay_signature) {
      return { ok: false as const, error: "Invalid signature" };
    }

    // Mark payment paid
    const { data: payment } = await supabaseAdmin
      .from("payments")
      .update({
        status: "paid",
        razorpay_payment_id: data.razorpay_payment_id,
        updated_at: new Date().toISOString(),
      })
      .eq("razorpay_order_id", data.razorpay_order_id)
      .select("id, purpose, appointment_id, client_name, phone, amount")
      .maybeSingle();

    if (!payment) return { ok: false as const, error: "Payment not found" };

    if (payment.purpose === "booking" && payment.appointment_id) {
      await supabaseAdmin
        .from("appointments")
        .update({ payment_status: "paid" })
        .eq("id", payment.appointment_id);
    }

    if (payment.purpose === "membership") {
      const today = new Date();
      const expires = new Date(today);
      expires.setFullYear(expires.getFullYear() + 1);
      const { data: mem } = await supabaseAdmin
        .from("memberships")
        .insert({
          client_name: payment.client_name ?? "Member",
          phone: payment.phone ?? "",
          start_date: today.toISOString().slice(0, 10),
          expires_at: expires.toISOString().slice(0, 10),
          active: true,
          amount_paid: payment.amount,
        })
        .select("id")
        .single();
      if (mem) {
        await supabaseAdmin
          .from("payments")
          .update({ membership_id: mem.id })
          .eq("id", payment.id);
      }
    }

    return { ok: true as const, purpose: payment.purpose };
  });
