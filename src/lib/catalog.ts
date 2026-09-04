import "server-only";
import { createClient } from "@/lib/supabase/server";
import { SERVICES, TIME_SLOTS, BRANCHES } from "@/lib/salon-data";
import { sortSlotsByStart } from "@/lib/utils";
import { staffPhotoUrl, isMissingStaffPhotoColumn } from "@/lib/staff-photos";

/** Staff for the catalog, tolerating photo_url not existing yet (additive migration). */
async function fetchStaffRows(supabase: Awaited<ReturnType<typeof createClient>>) {
  const withPhoto: string =
    "name, branch, store_number, photo_url, staff_schedules(day_of_week, time_slot)";
  const withoutPhoto: string =
    "name, branch, store_number, staff_schedules(day_of_week, time_slot)";
  const res = await supabase.from("staff").select(withPhoto).order("name");
  if (isMissingStaffPhotoColumn(res.error)) {
    return await supabase.from("staff").select(withoutPhoto).order("name");
  }
  return res;
}

export type ServiceOption = { name: string; price: number; isNailArt: boolean };
/**
 * A bookable studio. `address`, `phone` and `mapUrl` are admin-editable (Admin →
 * Manage → Branches) and may be unset, so every consumer must degrade gracefully
 * — the seeded values are locality-only placeholders.
 */
export type BranchOption = {
  name: string;
  address: string | null;
  phone: string | null;
  mapUrl: string | null;
};
/** schedule[weekday] = slot labels this stylist works that weekday (0=Sun..6=Sat). */
export type StaffOption = {
  name: string;
  branch: string;
  storeNumber: string | null;
  /** Public path to the stylist's bundled photo, or null (→ initials fallback). */
  photoUrl: string | null;
  schedule: Record<number, string[]>;
};

export type Catalog = {
  services: ServiceOption[];
  timeSlots: string[];
  branches: BranchOption[];
  staff: StaffOption[];
};

/** Constant fallback so the site renders even before migrations/seed are applied. */
function fallback(staff: StaffOption[] = []): Catalog {
  return {
    services: SERVICES.map((s) => ({
      name: s.name,
      price: s.price,
      isNailArt: /nail/i.test(s.name),
    })),
    timeSlots: [...TIME_SLOTS],
    branches: BRANCHES.map((b) => ({ name: b, address: null, phone: null, mapUrl: null })),
    staff,
  };
}

/** Public catalog (services, time slots, branches, staff) for the booking form. */
export async function getCatalog(): Promise<Catalog> {
  try {
    const supabase = await createClient();
    const [svcRes, slotRes, brRes, staffRes] = await Promise.all([
      supabase
        .from("services")
        .select("name, price, is_nail_art")
        .eq("active", true)
        .order("sort_order"),
      supabase.from("time_slots").select("label").eq("active", true).order("sort_order"),
      supabase
        .from("branches")
        .select("name, address, phone, map_url")
        .eq("active", true)
        .order("sort_order"),
      fetchStaffRows(supabase),
    ]);

    const svcRows =
      (svcRes.data as { name: string; price: number; is_nail_art: boolean }[] | null) ?? [];
    const slotRows = (slotRes.data as { label: string }[] | null) ?? [];
    const brRows =
      (brRes.data as
        | { name: string; address: string | null; phone: string | null; map_url: string | null }[]
        | null) ?? [];
    const staffRows =
      (staffRes.data as
        | {
            name: string;
            branch: string;
            store_number: string | null;
            photo_url: string | null;
            staff_schedules: { day_of_week: number; time_slot: string }[] | null;
          }[]
        | null) ?? [];

    const fb = fallback();

    return {
      services: svcRows.length
        ? svcRows.map((s) => ({ name: s.name, price: s.price, isNailArt: s.is_nail_art }))
        : fb.services,
      // Always clock-ordered — sort_order is manual and a later-added morning slot
      // would otherwise land at the bottom of the customer's time dropdown.
      timeSlots: sortSlotsByStart(
        slotRows.length ? slotRows.map((s) => s.label) : fb.timeSlots,
        (label) => label,
      ),
      branches: brRows.length
        ? brRows.map((b) => ({
            name: b.name,
            address: b.address,
            phone: b.phone,
            mapUrl: b.map_url,
          }))
        : fb.branches,
      staff: staffRows.map((s) => {
        const schedule: Record<number, string[]> = {};
        for (const r of s.staff_schedules ?? []) (schedule[r.day_of_week] ??= []).push(r.time_slot);
        return {
          name: s.name,
          branch: s.branch,
          storeNumber: s.store_number,
          photoUrl: s.photo_url ?? staffPhotoUrl(s.name),
          schedule,
        };
      }),
    };
  } catch {
    return fallback();
  }
}
