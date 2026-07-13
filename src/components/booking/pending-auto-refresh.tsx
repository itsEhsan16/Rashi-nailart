"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Clock, Loader2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/** Re-check cadence and how long to keep auto-checking before falling back to a
 *  manual refresh. ~80s comfortably covers the usual UPI settle lag. */
const POLL_INTERVAL_MS = 4000;
const MAX_ATTEMPTS = 20;

/**
 * Client half of the booking-confirmation "pending" state.
 *
 * Cashfree (especially UPI) often marks the order PAID a few seconds AFTER the
 * customer is redirected back, so the server's first reconcile can land while the
 * order is still ACTIVE. Rather than stranding the customer on a manual "Refresh"
 * button — where they may give up thinking the payment failed — we re-run the
 * server component (which re-reconciles against Cashfree) every few seconds. The
 * moment it flips to confirmed this whole branch unmounts and the timer is torn
 * down; router.refresh() preserves our attempt counter across refreshes so the
 * poll is self-perpetuating until it confirms or we hit MAX_ATTEMPTS. The webhook
 * remains the ultimate backstop, so a customer who waits past the window can still
 * refresh manually and see the confirmed booking.
 */
export function PendingAutoRefresh({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [attempts, setAttempts] = useState(0);
  const polling = attempts < MAX_ATTEMPTS;

  useEffect(() => {
    if (!polling) return;
    const t = setTimeout(() => {
      router.refresh();
      setAttempts((n) => n + 1);
    }, POLL_INTERVAL_MS);
    return () => clearTimeout(t);
  }, [attempts, polling, router]);

  return (
    <Card className="rounded-xl border-border/60 p-8 text-center shadow-elegant md:p-10">
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-amber-500/15 text-amber-600">
        <Clock className="h-7 w-7" />
      </div>
      <h1 className="font-display text-2xl font-semibold">Payment processing…</h1>
      <p className="mt-2 text-muted-foreground">
        We haven&apos;t received confirmation of your payment yet. If you completed it, this page
        will confirm your booking automatically — no need to do anything.
      </p>

      {polling ? (
        <p className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking with the payment gateway…
        </p>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Still not confirmed. If you completed the payment, tap Refresh — it can take a minute.
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button
          variant="outline"
          onClick={() => {
            setAttempts(0); // restart the auto-check window on a manual retry
            router.refresh();
          }}
        >
          Refresh
        </Button>
        <Button asChild variant="ghost">
          <Link href="/#book">Back to booking</Link>
        </Button>
      </div>
    </Card>
  );
}
