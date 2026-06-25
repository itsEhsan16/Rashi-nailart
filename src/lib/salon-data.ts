export const BRANCHES = ["Vile Parle", "Bandra"] as const;
export type Branch = (typeof BRANCHES)[number];

export const TIME_SLOTS = [
  "11:45 AM – 1:15 PM",
  "1:15 PM – 2:45 PM",
  "2:45 PM – 4:15 PM",
  "4:15 PM – 5:45 PM",
  "5:45 PM – 7:15 PM",
  "7:00 PM – 8:30 PM",
] as const;

export const SERVICES = [
  { name: "Stick On Extension Nails", price: 499 },
  { name: "Gel Polish Hand & Toe", price: 499 },
  { name: "Soft Gel Extension Nails", price: 499 },
  { name: "Acrylic Extension Nails", price: 799 },
] as const;

export const MEMBERSHIP_PRICE = 100; // ₹100 / year
export const BOOKING_FEE = 50; // ₹50 booking fee paid before confirmation

/**
 * Manual-UPI booking lifecycle:
 *   pending_payment  → slot held, awaiting the customer's screenshot upload
 *   payment_uploaded → proof received, awaiting admin verification (slot held)
 *   verified         → admin confirmed payment, booking finalized
 *   rejected         → admin rejected the proof, slot released
 *   cancelled        → admin cancelled a confirmed booking (slot released)
 */
export const BOOKING_STATUSES = [
  "pending_payment",
  "payment_uploaded",
  "verified",
  "rejected",
  "cancelled",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Statuses that occupy a slot (mirror of the uq_appointment_slot partial index). */
export const SLOT_HOLDING_STATUSES: readonly BookingStatus[] = [
  "pending_payment",
  "payment_uploaded",
  "verified",
];

/** Max upload size for a payment screenshot. */
export const MAX_PROOF_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_PROOF_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

/**
 * True if an uploaded file is an accepted payment-proof image. Matches by MIME
 * type, but also accepts HEIC/HEIF by file extension because some browsers
 * report no MIME type for those (iPhone photos); they're transcoded to JPEG
 * server-side on upload.
 */
export function isAcceptedProofFile(file: { type: string; name: string }): boolean {
  const type = file.type.toLowerCase();
  if ((ALLOWED_PROOF_TYPES as readonly string[]).includes(type)) return true;
  if ((type === "" || type === "application/octet-stream") && /\.(heic|heif)$/i.test(file.name)) {
    return true;
  }
  return false;
}

/** Abandoned pending_payment holds older than this are reclaimable. The customer
 *  has this long to pay over UPI and upload their screenshot before the slot frees. */
export const PENDING_HOLD_MINUTES = 5;
