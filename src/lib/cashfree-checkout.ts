"use client";

import { load } from "@cashfreepayments/cashfree-js";

type Cashfree = Awaited<ReturnType<typeof load>>;

let cashfreePromise: Promise<Cashfree> | null = null;

function mode(): "sandbox" | "production" {
  return process.env.NEXT_PUBLIC_CASHFREE_MODE === "production" ? "production" : "sandbox";
}

/** Load (once) and memoize the Cashfree JS SDK for the configured mode. */
export function getCashfree(): Promise<Cashfree> {
  return (cashfreePromise ??= load({ mode: mode() }));
}

/**
 * Open Cashfree's hosted checkout for a payment session, redirecting the current
 * tab (_self). Cashfree handles the UPI app-switch and, after payment, returns to
 * the order's return_url (our /booking/confirm or /membership/confirm page).
 */
export async function redirectToCheckout(paymentSessionId: string): Promise<void> {
  const cashfree = await getCashfree();
  await cashfree.checkout({ paymentSessionId, redirectTarget: "_self" });
}
