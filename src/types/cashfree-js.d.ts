// Minimal type declarations for @cashfreepayments/cashfree-js (the loader ships
// none). Covers only the surface we use — load() + checkout() hosted redirect.
declare module "@cashfreepayments/cashfree-js" {
  export type CashfreeMode = "sandbox" | "production";

  export interface CheckoutOptions {
    paymentSessionId: string;
    redirectTarget?: "_self" | "_blank" | "_top" | "_modal" | HTMLElement;
    returnUrl?: string;
  }

  export interface CheckoutResult {
    error?: { message?: string };
    redirect?: boolean;
    paymentDetails?: { paymentMessage?: string };
  }

  export interface Cashfree {
    checkout(options: CheckoutOptions): Promise<CheckoutResult>;
  }

  export function load(options: { mode: CashfreeMode }): Promise<Cashfree>;
}
