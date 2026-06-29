/**
 * Shape of a valid UPI VPA ("virtual payment address"), e.g. `name@okhdfcbank`
 * or `9876543210@ybl`: one `@`, and only URL-safe characters on each side. Used
 * to validate admin input AND to fail closed in {@link buildUpiLink}, so a `&`,
 * space, `?` or `#` can never reach the deep link's query string.
 */
export const UPI_VPA_RE = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z0-9.\-_]{2,64}$/;

export type UpiLinkArgs = {
  upiId: string;
  payeeName?: string;
  amount: number;
  note?: string;
};

/**
 * Build the shared UPI query payload (`pa`/`pn`/`am`/`cu`/`tn`). Returns `null`
 * when there's no VPA or it's malformed, so every caller fails closed.
 *
 * Encoding notes:
 *  - `pa` (the VPA) is inserted literally — valid VPAs only contain URL-safe
 *    characters and some apps fail to match a percent-encoded `@`. It is gated
 *    by {@link UPI_VPA_RE} so query-significant characters can't slip in.
 *  - `pn`/`tn` are percent-encoded (`encodeURIComponent` → spaces as `%20`, not
 *    the `+` that `URLSearchParams` would emit, which some apps render literally).
 *  - `am` is sent as a 2-decimal string per the UPI spec.
 */
function buildUpiQuery(args: UpiLinkArgs): string | null {
  const pa = args.upiId.trim();
  if (!UPI_VPA_RE.test(pa)) return null;

  const parts = [`pa=${pa}`];
  const pn = args.payeeName?.trim();
  if (pn) parts.push(`pn=${encodeURIComponent(pn)}`);

  if (Number.isFinite(args.amount) && args.amount > 0) {
    parts.push(`am=${args.amount.toFixed(2)}`);
  }
  parts.push("cu=INR");

  const tn = args.note?.trim();
  if (tn) parts.push(`tn=${encodeURIComponent(tn)}`);

  return parts.join("&");
}

/**
 * Generic UPI deep link (the NPCI `upi://pay` intent). On Android this triggers
 * the system UPI-app chooser; on iOS the generic `upi://` scheme has no chooser
 * and is silently owned by whichever app registered it (often WhatsApp), and on
 * desktop nothing handles it — so iOS callers should prefer {@link UPI_APPS}
 * per-app links and everyone keeps the QR + copy-UPI fallback.
 *
 * Returns `null` when the VPA is missing/malformed so callers can hide the button.
 */
export function buildUpiLink(args: UpiLinkArgs): string | null {
  const q = buildUpiQuery(args);
  return q ? `upi://pay?${q}` : null;
}

/**
 * Per-app UPI deep links for iOS, where the generic `upi://` scheme can't show a
 * chooser. Each app registers its own scheme but takes the identical query
 * payload. Note: PhonePe/Paytm honour these reliably; Google Pay's iOS support
 * for incoming UPI links is inconsistent and may not open — the QR/copy path is
 * the guaranteed fallback.
 */
export const UPI_APPS = [
  { key: "gpay", label: "Google Pay", scheme: "tez://upi/pay" },
  { key: "phonepe", label: "PhonePe", scheme: "phonepe://pay" },
  { key: "paytm", label: "Paytm", scheme: "paytmmp://pay" },
] as const;

export type UpiApp = (typeof UPI_APPS)[number];

/** Build a deep link for a specific UPI app's scheme (see {@link UPI_APPS}). */
export function buildUpiAppLink(scheme: string, args: UpiLinkArgs): string | null {
  const q = buildUpiQuery(args);
  return q ? `${scheme}?${q}` : null;
}
