// Bundled stylist photos live in /public/stylist (lowercase folder). The booking
// dropdown reads the live public.staff.name, and those names don't always match the
// photo filenames (e.g. Bhawna ↔ "Bhavna Bandra", Tejswini ↔ "Teju", Kumku ↔
// "Kumkum") — and the live names have been hand-edited over time. So we resolve a
// photo by a normalized first-name key, with aliases for the known spelling
// variants. A stylist with no entry simply falls back to their initials.
//
// First names are unique across branches, so keying on the first name is
// unambiguous. If two branches ever share a first name with different photos,
// switch the key to `${name}|${branch}`.
const STAFF_PHOTO_BY_KEY: Record<string, string> = {
  // ─── Bandra ───
  bhawna: "/stylist/Bhavna Bandra.jpeg",
  bhavna: "/stylist/Bhavna Bandra.jpeg",
  karishma: "/stylist/Karishma Bandra.jpeg",
  aarzoo: "/stylist/Aarzoo Bandra.jpeg",
  // ─── Vile Parle ───
  bhagya: "/stylist/Bhagya.jpeg",
  ritika: "/stylist/Ritika.jpeg",
  tejswini: "/stylist/Teju.jpeg",
  teju: "/stylist/Teju.jpeg",
  shreya: "/stylist/Shreya.jpeg",
  fiza: "/stylist/Fiza.png",
  mansi: "/stylist/Mansi.jpeg",
  manshi: "/stylist/Mansi.jpeg",
  kumku: "/stylist/Kumkum.jpeg",
  kumkum: "/stylist/Kumkum.jpeg",
  asmita: "/stylist/Asmita.jpeg",
};

/**
 * Public path to a stylist's bundled profile photo, or null to fall back to
 * initials. `encodeURI` handles the space in filenames like "Bhavna Bandra.jpeg".
 */
export function staffPhotoUrl(name: string): string | null {
  const path = STAFF_PHOTO_BY_KEY[name.trim().toLowerCase()];
  return path ? encodeURI(path) : null;
}
