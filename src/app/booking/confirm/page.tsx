import Link from "next/link";
import type { Metadata } from "next";
import { format } from "date-fns";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { confirmBookingByOrder, type BookingConfirmResult } from "@/lib/actions/booking";
import { BUSINESS, mailtoHref, telHref } from "@/lib/business";
import { ReceiptDownload } from "@/components/booking/receipt-download";
import { PendingAutoRefresh } from "@/components/booking/pending-auto-refresh";
import { slotStartLabel } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Booking confirmation", robots: { index: false } };

function niceDate(value: string): string {
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? value : format(d, "PPP");
}

export default async function BookingConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ order_id?: string }>;
}) {
  const { order_id } = await searchParams;
  const result: BookingConfirmResult = order_id
    ? await confirmBookingByOrder({ orderId: order_id })
    : { status: "error", code: "invalid_reference" };

  return (
    <main className="min-h-screen bg-background px-4 py-16">
      <div className="mx-auto w-full max-w-lg">
        {result.status === "confirmed" ? (
          <Card className="rounded-xl border-border/60 p-8 text-center shadow-elegant md:p-10">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-emerald-500/15 text-emerald-600">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h1 className="font-display text-2xl font-semibold">You&apos;re booked! ✨</h1>
            <p className="mt-2 text-muted-foreground">
              {result.booking.service} with {result.booking.staffName} at {result.booking.branch}
            </p>
            <p className="text-muted-foreground">
              {niceDate(result.booking.date)} · {slotStartLabel(result.booking.timeSlot)}
            </p>

            <div className="mx-auto mt-5 max-w-sm rounded-lg border border-border/60 bg-muted/40 px-4 py-3 text-left text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Payment confirmed</p>
              <p className="mt-1">
                We&apos;ve received your ₹{result.booking.amount} booking fee. Nothing more to pay
                online — just arrive at your slot and settle the balance at the studio.
              </p>
              <p className="mt-2 text-xs">
                Order {result.booking.orderId}
                {result.booking.cfPaymentId ? ` · Payment ${result.booking.cfPaymentId}` : ""}
              </p>
            </div>

            <div className="mx-auto mt-3 max-w-sm rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-left text-sm text-amber-700 dark:text-amber-400">
              <p className="font-medium">Please reach the studio on time</p>
              <p className="mt-1">
                There&apos;s no cancellation facility — once your slot is booked it&apos;s confirmed
                and locked in, and your ₹{result.booking.amount} booking fee is non-refundable.
                Please make sure you can attend before booking.
              </p>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <ReceiptDownload
                data={{
                  kind: "booking",
                  clientName: result.booking.clientName,
                  phone: result.booking.phone,
                  branch: result.booking.branch,
                  date: result.booking.date,
                  timeSlot: result.booking.timeSlot,
                  service: result.booking.service,
                  staffName: result.booking.staffName,
                  amount: result.booking.amount,
                  orderId: result.booking.orderId,
                  cfPaymentId: result.booking.cfPaymentId,
                  paymentMethod: result.booking.paymentMethod,
                }}
              />
              <Button asChild variant="ghost">
                <Link href="/#book">Book another</Link>
              </Button>
            </div>
          </Card>
        ) : result.status === "pending" ? (
          <PendingAutoRefresh orderId={order_id as string} />
        ) : result.status === "needs_attention" ? (
          /**
           * We took the money but could not attach it to a slot. The one thing
           * that must not happen here is the customer paying again, so this
           * screen says so plainly, hands them the references we need to trace
           * the payment, and offers no "book again" button.
           */
          <Card className="rounded-xl border-amber-500/40 p-8 shadow-elegant md:p-10">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-amber-500/15 text-amber-600">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <h1 className="text-center font-display text-2xl font-semibold">
              We&apos;ve received your payment
            </h1>
            <p className="mt-2 text-center text-muted-foreground">
              {result.code === "slot_taken"
                ? "Your payment went through, but the slot you chose was taken while you were paying. Nothing is lost — please contact us and we'll rebook you or refund you."
                : "Your payment went through, but we couldn't attach it to a booking. Please contact us with the details below and we'll sort it out."}
            </p>
            <p className="mt-4 rounded-lg bg-amber-500/10 px-4 py-3 text-center text-sm font-medium text-amber-700 dark:text-amber-400">
              Please do not pay again.
            </p>
            <dl className="mt-5 space-y-1.5 rounded-lg border border-border/60 bg-muted/40 px-4 py-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Order ID</dt>
                <dd className="break-all text-right font-mono text-xs">{result.orderId}</dd>
              </div>
              {result.cfPaymentId ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Payment ID</dt>
                  <dd className="break-all text-right font-mono text-xs">{result.cfPaymentId}</dd>
                </div>
              ) : null}
            </dl>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button asChild>
                <a href={telHref()}>Call {BUSINESS.phone.display}</a>
              </Button>
              <Button asChild variant="outline">
                <a href={mailtoHref(`Payment issue — order ${result.orderId}`)}>Email us</a>
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="rounded-xl border-border/60 p-8 text-center shadow-elegant md:p-10">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-destructive/15 text-destructive">
              <XCircle className="h-7 w-7" />
            </div>
            <h1 className="font-display text-2xl font-semibold">
              {result.status === "error" && result.code === "gateway_unreachable"
                ? "We couldn't check your payment"
                : "Payment not completed"}
            </h1>
            <p className="mt-2 text-muted-foreground">
              {/*
                Never render a raw gateway or database string here — this page is
                public, and a misconfigured environment would otherwise print the
                names of missing secrets onto it. Codes map to fixed copy instead.
              */}
              {result.status === "error"
                ? result.code === "gateway_unreachable"
                  ? "We couldn't reach the payment gateway to confirm this. If money left your account, don't pay again — contact us and we'll check."
                  : "That payment link isn't valid. If you were charged, contact us before trying again."
                : "Your payment didn't go through, so the booking wasn't confirmed. If any amount was debited, your bank will reverse it — typically within 3–5 working days."}
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button asChild>
                <Link href="/#book">Book again</Link>
              </Button>
              <Button asChild variant="outline">
                <a href={telHref()}>Call {BUSINESS.phone.display}</a>
              </Button>
            </div>
          </Card>
        )}
      </div>
    </main>
  );
}
