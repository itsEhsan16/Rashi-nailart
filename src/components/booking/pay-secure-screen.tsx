"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, AlertTriangle, Clock, Lock } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Props = {
  amount: number;
  /** What the customer is paying for, e.g. "booking fee" / "membership fee". */
  forLabel: string;
  /** Epoch ms when the held slot expires — shows a live countdown (bookings only). */
  holdExpiresAt?: number;
  /** One-line summary of what's being paid for, shown for reassurance. */
  summaryLine?: string;
  /**
   * Start payment: create the Cashfree order, persist the pending reference, then
   * redirect to checkout. Runs on the user's click (a gesture) so the redirect
   * isn't blocked. May throw / reject — the screen surfaces the error.
   */
  onPay: () => Promise<void>;
};

/** mm:ss from a millisecond duration (never negative). */
function fmt(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function PaySecureScreen({ amount, forLabel, holdExpiresAt, summaryLine, onPay }: Props) {
  const [submitting, setSubmitting] = useState(false);

  // Live countdown so the customer can see exactly how long their slot is held.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!holdExpiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [holdExpiresAt]);
  const remaining = holdExpiresAt ? holdExpiresAt - now : null;
  const expired = remaining !== null && remaining <= 0;
  const urgent = remaining !== null && remaining > 0 && remaining < 60_000;

  async function pay() {
    setSubmitting(true);
    try {
      await onPay();
      // On success the browser is redirecting to Cashfree — keep the spinner.
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start payment. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <Card className="rounded-xl p-6 md:p-8 shadow-elegant border-border/60 space-y-6">
      <div className="text-center">
        <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-primary/10 text-primary grid place-items-center">
          <Lock className="h-6 w-6" />
        </div>
        <h3 className="font-display text-2xl font-semibold">Pay ₹{amount} to confirm</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Securely pay the {forLabel} via Cashfree — UPI, cards, wallets &amp; net banking.
          Your booking is confirmed automatically the moment payment succeeds.
        </p>
        {summaryLine && (
          <p className="mt-2 inline-block rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">
            {summaryLine}
          </p>
        )}
      </div>

      {holdExpiresAt !== undefined && (
        <div
          className={cn(
            "flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm",
            expired
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-amber-500/30 bg-amber-500/15 text-amber-600",
          )}
        >
          {expired ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <Clock className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>
            {remaining !== null && !expired && (
              <span className="block">
                Slot held —{" "}
                <span className={cn("font-semibold tabular-nums", urgent && "text-destructive")}>
                  {fmt(remaining)} left
                </span>{" "}
                to pay.
              </span>
            )}
            {expired ? (
              <>
                Your <span className="font-semibold">hold has ended</span>. You can still try to pay
                — if the slot was taken meanwhile we&apos;ll let you know. Otherwise, please book
                again.
              </>
            ) : (
              <>
                Your booking is <span className="font-semibold">not confirmed yet</span> — complete
                payment to secure this slot.
              </>
            )}
          </span>
        </div>
      )}

      <Button
        type="button"
        onClick={pay}
        disabled={submitting}
        className="w-full bg-gradient-hero hover:opacity-95 text-primary-foreground shadow-soft h-12"
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Redirecting to secure payment…
          </>
        ) : (
          <>Pay ₹{amount} securely</>
        )}
      </Button>
      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" /> Payments are processed securely by Cashfree. We never
        see your card or UPI credentials.
      </p>
    </Card>
  );
}
