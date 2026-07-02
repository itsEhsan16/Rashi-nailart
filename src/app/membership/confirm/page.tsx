import Link from "next/link";
import type { Metadata } from "next";
import { format } from "date-fns";
import { CheckCircle2, Clock, XCircle, Crown } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { confirmMembershipByOrder } from "@/lib/actions/membership";
import { ReceiptDownload } from "@/components/booking/receipt-download";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Membership confirmation", robots: { index: false } };

function niceDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? value : format(d, "PPP");
}

export default async function MembershipConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ order_id?: string }>;
}) {
  const { order_id } = await searchParams;
  const result = order_id
    ? await confirmMembershipByOrder({ orderId: order_id })
    : ({ status: "error", error: "Missing payment reference." } as const);

  return (
    <main className="min-h-screen bg-background px-4 py-16">
      <div className="mx-auto w-full max-w-lg">
        {result.status === "confirmed" ? (
          <Card className="rounded-xl border-border/60 p-8 text-center shadow-elegant md:p-10">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-emerald-500/15 text-emerald-600">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h1 className="font-display text-2xl font-semibold">Thanks for joining! ✨</h1>
            <p className="mt-2 flex items-center justify-center gap-1.5 text-muted-foreground">
              <Crown className="h-4 w-4 text-primary" /> 1-Year Membership · 50% off nail art
            </p>

            <div className="mx-auto mt-5 max-w-sm rounded-lg border border-border/60 bg-muted/40 px-4 py-3 text-left text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Membership active</p>
              <p className="mt-1">
                Your benefits are active now
                {result.membership.expiresAt
                  ? ` until ${niceDate(result.membership.expiresAt)}`
                  : ""}
                . We recognise you by your phone number at booking.
              </p>
              <p className="mt-2 text-xs">
                Order {result.membership.orderId}
                {result.membership.cfPaymentId ? ` · Payment ${result.membership.cfPaymentId}` : ""}
              </p>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <ReceiptDownload
                data={{
                  kind: "membership",
                  clientName: result.membership.clientName,
                  phone: result.membership.phone,
                  amount: result.membership.amount,
                  orderId: result.membership.orderId,
                  cfPaymentId: result.membership.cfPaymentId,
                  paymentMethod: result.membership.paymentMethod,
                  startDate: result.membership.startDate,
                  expiresAt: result.membership.expiresAt,
                }}
              />
              <Button asChild variant="ghost">
                <Link href="/#book">Book an appointment</Link>
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
              this page in a moment — your membership will activate automatically.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Button asChild variant="outline">
                <Link href={order_id ? `/membership/confirm?order_id=${order_id}` : "/"}>
                  Refresh
                </Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="/">Back to home</Link>
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
                : "Your payment didn't go through, so the membership wasn't activated. No charge was made — please try again."}
            </p>
            <div className="mt-6">
              <Button asChild>
                <Link href="/#membership">Try again</Link>
              </Button>
            </div>
          </Card>
        )}
      </div>
    </main>
  );
}
