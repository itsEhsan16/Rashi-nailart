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
 * the salon trades as "Rashi Nail Art Studio" while the registered proprietorship
 * is "M/S. DISHAA HAIR AND SKIN STUDIO". RECONCILIATION_LINE ties the two
 * together and must appear wherever legal identity is asserted.
 */

export const BUSINESS = {
  /** Customer-facing brand. */
  tradingName: "Rashi Nail Art Studio",
  /** Registered entity name, as it appears on the Udyam certificate. */
  legalName: "M/S. DISHAA HAIR AND SKIN STUDIO",
  proprietor: "Disha Brijal Soni",
  entityType: "Sole Proprietorship",

  /**
   * Registered office. Note this is NOT a studio address — it is the registered
   * address of the proprietorship, in Borivali West, while the studios operate in
   * Vile Parle and Bandra. Never render it as a branch location.
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
 * The sentence that ties the brand to the registered entity. Required wherever
 * legal identity is asserted — footer, /contact, /terms, /privacy, /refund — so
 * a reviewer comparing the site against the KYC documents finds both names.
 */
export const RECONCILIATION_LINE =
  `${BUSINESS.tradingName} is a brand operated by ${BUSINESS.legalName} ` +
  `(${BUSINESS.entityType}), proprietor ${BUSINESS.proprietor}.`;

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
