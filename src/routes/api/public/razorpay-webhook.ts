import { createFileRoute } from "@tanstack/react-router";
import crypto from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/razorpay-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const signature = request.headers.get("x-razorpay-signature");
        const body = await request.text();
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
        if (!secret || !signature) {
          return new Response("missing signature", { status: 401 });
        }
        const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
        const sigBuf = Buffer.from(signature);
        const expBuf = Buffer.from(expected);
        if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
          return new Response("invalid signature", { status: 401 });
        }

        let payload: any;
        try {
          payload = JSON.parse(body);
        } catch {
          return new Response("bad json", { status: 400 });
        }

        const event = payload?.event as string | undefined;
        const paymentEntity = payload?.payload?.payment?.entity;
        const orderId: string | undefined = paymentEntity?.order_id;
        const paymentId: string | undefined = paymentEntity?.id;

        if (!orderId) return new Response("ok"); // ignore non-order events

        if (event === "payment.captured" || event === "order.paid") {
          const { data: payment } = await supabaseAdmin
            .from("payments")
            .update({
              status: "paid",
              razorpay_payment_id: paymentId ?? null,
              updated_at: new Date().toISOString(),
            })
            .eq("razorpay_order_id", orderId)
            .select("id, purpose, appointment_id, client_name, phone, amount")
            .maybeSingle();

          if (payment?.purpose === "booking" && payment.appointment_id) {
            await supabaseAdmin
              .from("appointments")
              .update({ payment_status: "paid" })
              .eq("id", payment.appointment_id);
          }

          if (payment?.purpose === "membership") {
            const today = new Date();
            const expires = new Date(today);
            expires.setFullYear(expires.getFullYear() + 1);
            const { data: existing } = await supabaseAdmin
              .from("payments")
              .select("membership_id")
              .eq("id", payment.id)
              .maybeSingle();
            if (!existing?.membership_id) {
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
          }
        } else if (event === "payment.failed") {
          await supabaseAdmin
            .from("payments")
            .update({ status: "failed", updated_at: new Date().toISOString() })
            .eq("razorpay_order_id", orderId);
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
