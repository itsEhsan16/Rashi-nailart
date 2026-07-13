import Link from "next/link";
import type { Metadata } from "next";
import { format } from "date-fns";
import { CheckCircle2, XCircle } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { confirmBookingByOrder } from "@/lib/actions/booking";
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
  const result = order_id
    ? await confirmBookingByOrder({ orderId: order_id })
    : ({ status: "error", error: "Missing payment reference." } as const);

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
        ) : (
          <Card className="rounded-xl border-border/60 p-8 text-center shadow-elegant md:p-10">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-destructive/15 text-destructive">
              <XCircle className="h-7 w-7" />
            </div>
            <h1 className="font-display text-2xl font-semibold">Payment not completed</h1>
            <p className="mt-2 text-muted-foreground">
              {result.status === "error"
                ? result.error
                : "Your payment didn't go through, so the booking wasn't confirmed. No charge was made — please try booking again."}
            </p>
            <div className="mt-6">
              <Button asChild>
                <Link href="/#book">Book again</Link>
              </Button>
            </div>
          </Card>
        )}
      </div>
    </main>
  );
}
