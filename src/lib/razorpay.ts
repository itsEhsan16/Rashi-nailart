// Loads Razorpay Checkout script and opens a payment modal.
declare global {
  interface Window {
    Razorpay?: any;
  }
}

let scriptPromise: Promise<void> | null = null;

export function loadRazorpay(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.Razorpay) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Razorpay"));
    document.body.appendChild(s);
  });
  return scriptPromise;
}

export type RazorpayResult = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

export async function openRazorpayCheckout(opts: {
  keyId: string;
  orderId: string;
  amount: number; // in paise
  currency: string;
  name: string;
  description: string;
  prefill?: { name?: string; contact?: string; email?: string };
}): Promise<RazorpayResult> {
  await loadRazorpay();
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: opts.keyId,
      amount: opts.amount,
      currency: opts.currency,
      order_id: opts.orderId,
      name: opts.name,
      description: opts.description,
      prefill: opts.prefill,
      theme: { color: "#d6336c" },
      handler: (res: RazorpayResult) => resolve(res),
      modal: {
        ondismiss: () => reject(new Error("Payment cancelled")),
      },
    });
    rzp.on("payment.failed", (resp: any) =>
      reject(new Error(resp?.error?.description || "Payment failed"))
    );
    rzp.open();
  });
}
