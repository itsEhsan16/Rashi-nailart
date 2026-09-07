/**
 * Who this business legally is — the single source of truth for identity and
 * contact details across the public site.
 *
 * Why a module and not the database or an env var:
 *   - A payment aggregator crawls the live site during merchant onboarding and
 *     checks that the registered legal name is visible. It must be in the served
 *     HTML, so it cannot come from an env var the browser never sees.
 *   - `getCatalog()` swallows Supabase failures into a fallback, so sourcing this
 *     from the DB would let a transient outage silently blank the legal identity
 *     on exactly the pages that exist to display it.
 *
 * The trading brand and the registered entity are different names, deliberately:
 * the salon trades as "Rashi Nail Art Studio" while the payments are collected by
 * the registered proprietorship "M/S. DISHAA HAIR AND SKIN STUDIO".
 * PAYMENT_COLLECTOR_LINE states that relationship and must appear wherever legal
 * identity is asserted. Keep it scoped to the payment leg — see the note on the
 * constant itself.
 */

export const BUSINESS = {
  /** Customer-facing brand. */
  tradingName: "Rashi Nail Art Studio",
  /** Registered entity name, as it appears on the Udyam certificate. */
  legalName: "M/S. DISHAA HAIR AND SKIN STUDIO",
  proprietor: "Disha Brijal Soni",
  entityType: "Sole Proprietorship",

  /**
   * Registered office of the proprietorship — the address on the Udyam
   * certificate. It is ALSO where the Borivali W studio trades from, but the two
   * are kept as separate records on purpose:
   *
   *   • this constant asserts LEGAL identity, must appear in the served HTML for
   *     the payment aggregator, and must never change with a branch edit;
   *   • the customer-facing studio address lives in the `branches` table and is
   *     admin-editable (Admin → Manage → Branches).
   *
   * So: never render this block as a branch location, and never fall back to it
   * when a branch address is blank — Vile Parle and Bandra are elsewhere.
   */
  registeredOffice: {
    line1: "Shop No 7, Mansarovar Building",
    line2: "Satya Nagar, Opp Jain Temple",
    locality: "Borivali West",
    city: "Mumbai",
    state: "Maharashtra",
    pincode: "400092",
    country: "India",
  },

  phone: {
    /** As shown to a human. */
    display: "+91 91370 02970",
    /** For a `tel:` href — digits and a leading +, nothing else. */
    tel: "+919137002970",
  },
  email: "rashinailartstudio@gmail.com",

  instagram: [
    { label: "Vile Parle", url: "https://www.instagram.com/rashinailartstudio_vileparle" },
    { label: "Bandra", url: "https://www.instagram.com/rashinailartstudio_bandra" },
  ],

  /** Where disputes are heard, stated on /terms. */
  jurisdiction: "Mumbai, Maharashtra",
} as const;

/**
 * Names the entity that actually collects online payments, and where it is
 * registered. Required wherever legal identity is asserted — footer, /contact,
 * /terms, /privacy, /refund — so a reviewer comparing the site against the KYC
 * documents finds the registered legal name, and so a customer knows who is
 * taking their money before they pay.
 *
 * Deliberately phrased as "payments are collected by" rather than "is a brand
 * operated by". The merchant account, PAN and settlement bank belong to the
 * registered firm; that is a statement about the payment leg specifically, and
 * it is the claim we can stand behind. Do not widen it into a claim about who
 * owns or runs the studios unless that is separately true and documented.
 */
export const PAYMENT_COLLECTOR_LINE =
  `Online payments for ${BUSINESS.tradingName} are collected by ${BUSINESS.legalName} ` +
  `(${BUSINESS.entityType}), proprietor ${BUSINESS.proprietor}.`;

/**
 * The same disclosure with the registered address appended. Use this only where
 * the address is not already rendered nearby — the footer — so /contact,
 * /terms and /privacy don't print it twice.
 */
export const PAYMENT_COLLECTOR_LINE_WITH_ADDRESS = `${PAYMENT_COLLECTOR_LINE.replace(
  /\.$/,
  "",
)}, ${formattedOffice()}.`;

/**
 * One date for every policy page AND the sitemap's `lastModified`, so the date a
 * reader sees can never drift from the date crawlers are told. Bump it whenever
 * policy wording changes.
 */
export const POLICY_LAST_UPDATED = "2026-09-04";

/** Registered office as a single line, for compact contexts like the footer. */
export function formattedOffice(): string {
  const o = BUSINESS.registeredOffice;
  return `${o.line1}, ${o.line2}, ${o.locality}, ${o.city}, ${o.state} ${o.pincode}, ${o.country}`;
}

/** Registered office as address lines, for a stacked <address> block. */
export function officeLines(): string[] {
  const o = BUSINESS.registeredOffice;
  return [o.line1, o.line2, `${o.locality}, ${o.city}`, `${o.state} ${o.pincode}, ${o.country}`];
}

export function telHref(): string {
  return `tel:${BUSINESS.phone.tel}`;
}

export function mailtoHref(subject?: string): string {
  return subject
    ? `mailto:${BUSINESS.email}?subject=${encodeURIComponent(subject)}`
    : `mailto:${BUSINESS.email}`;
}

/** Human-readable policy date, e.g. "4 September 2026". */
export function policyUpdatedLabel(): string {
  return new Date(`${POLICY_LAST_UPDATED}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
