import Link from "next/link";
import type { Metadata } from "next";
import { format } from "date-fns";
import { CheckCircle2, Clock, XCircle } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { confirmBookingByOrder } from "@/lib/actions/booking";
import { ReceiptDownload } from "@/components/booking/receipt-download";
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
          <Card className="rounded-xl border-border/60 p-8 text-center shadow-elegant md:p-10">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-amber-500/15 text-amber-600">
              <Clock className="h-7 w-7" />
            </div>
            <h1 className="font-display text-2xl font-semibold">Payment processing…</h1>
            <p className="mt-2 text-muted-foreground">
              We haven&apos;t received confirmation of your payment yet. If you completed it, refresh
              this page in a moment — your booking will confirm automatically.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Button asChild variant="outline">
                <Link href={order_id ? `/booking/confirm?order_id=${order_id}` : "/#book"}>
                  Refresh
                </Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="/#book">Back to booking</Link>
              </Button>
            </div>
          </Card>
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
