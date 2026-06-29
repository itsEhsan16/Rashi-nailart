/**
 * Inline SVG brand marks for the iOS per-app UPI buttons. Inlined (not hotlinked
 * from the web) so they're crisp at any size, themeable, and never break on a
 * dead URL or offline. Keyed to the `key`s in UPI_APPS (@/lib/upi).
 */

type LogoProps = { className?: string };

/** The four-colour Google "G". */
export function GooglePayLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label="Google Pay">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18c-.44-1.32-.69-2.73-.69-4.18s.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}

/** PhonePe — white "Pe" on the signature purple tile. */
export function PhonePeLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="PhonePe">
      <rect width="32" height="32" rx="7" fill="#5F259F" />
      <text
        x="16"
        y="21.5"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="13"
        fontWeight="700"
        fill="#FFFFFF"
      >
        Pe
      </text>
    </svg>
  );
}

/** Paytm — white "P" on the brand navy→cyan tile. */
export function PaytmLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="Paytm">
      <defs>
        <linearGradient id="paytmGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#00BAF2" />
          <stop offset="1" stopColor="#002970" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="7" fill="url(#paytmGrad)" />
      <text
        x="16"
        y="22"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="15"
        fontWeight="800"
        fill="#FFFFFF"
      >
        P
      </text>
    </svg>
  );
}

/** Render the right brand mark for a UPI_APPS key. */
export function UpiAppLogo({ appKey, className }: { appKey: string; className?: string }) {
  switch (appKey) {
    case "gpay":
      return <GooglePayLogo className={className} />;
    case "phonepe":
      return <PhonePeLogo className={className} />;
    case "paytm":
      return <PaytmLogo className={className} />;
    default:
      return null;
  }
}
