import "server-only";
import { createClient } from "@/lib/supabase/server";
import { SERVICES, TIME_SLOTS, BRANCHES } from "@/lib/salon-data";
import { formatLocalDate, sortSlotsByStart } from "@/lib/utils";
import { staffPhotoUrl, isMissingStaffPhotoColumn } from "@/lib/staff-photos";
import { isMissingTimeOffTable } from "@/lib/staff-time-off";

/** Staff for the catalog, tolerating photo_url not existing yet (additive migration). */
async function fetchStaffRows(supabase: Awaited<ReturnType<typeof createClient>>) {
  const withPhoto: string =
    "id, name, branch, store_number, photo_url, staff_schedules(day_of_week, time_slot)";
  const withoutPhoto: string =
    "id, name, branch, store_number, staff_schedules(day_of_week, time_slot)";
  const res = await supabase.from("staff").select(withPhoto).order("name");
  if (isMissingStaffPhotoColumn(res.error)) {
    return await supabase.from("staff").select(withoutPhoto).order("name");
  }
  return res;
}

/**
 * Dated days off from today onward, grouped `staff.id` → ascending "YYYY-MM-DD".
 *
 * Deliberately isolated from the rest of the catalog: `staff_time_off` may not
 * exist yet in production (migration not applied) and even a live read failure
 * must not take the services/branches/staff lists down with it. Every fault
 * degrades to "nobody is off" — the customer just sees the weekly schedule, and
 * createBooking still refuses a blocked date server-side.
 */
async function fetchDaysOff(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Map<string, string[]>> {
  const byStaff = new Map<string, string[]>();
  try {
    // Calendar-local today, never toISOString().slice(0,10) — off_date is a plain
    // calendar date, same as appointment_date. Erring a day early is harmless
    // (a past date isn't bookable); dropping today's block would not be.
    const { data, error } = await supabase
      .from("staff_time_off")
      .select("staff_id, off_date")
      .gte("off_date", formatLocalDate(new Date()))
      .order("off_date");
    if (error) {
      // A missing table just means the feature isn't live yet; anything else is
      // a real fault worth logging, but never worth failing the catalog over.
      if (!isMissingTimeOffTable(error)) {
        console.error("[catalog] staff_time_off read failed:", error.message);
      }
      return byStaff;
    }
    for (const r of (data as { staff_id: string; off_date: string }[] | null) ?? []) {
      const dates = byStaff.get(r.staff_id);
      if (dates) dates.push(r.off_date);
      else byStaff.set(r.staff_id, [r.off_date]);
    }
  } catch (e) {
    console.error("[catalog] staff_time_off read threw:", e);
  }
  return byStaff;
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
  /**
   * ISO "YYYY-MM-DD" dates (today onward, ascending) this artist is off —
   * OVERRIDES `schedule`: on one of these dates they work no slot at all.
   */
  daysOff: string[];
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
    const [svcRes, slotRes, brRes, staffRes, daysOffByStaff] = await Promise.all([
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
      // Never rejects — see fetchDaysOff. Safe to sit inside this Promise.all
      // without dragging the whole catalog into fallback().
      fetchDaysOff(supabase),
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
            id: string;
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
          daysOff: daysOffByStaff.get(s.id) ?? [],
        };
      }),
    };
  } catch {
    return fallback();
  }
}
