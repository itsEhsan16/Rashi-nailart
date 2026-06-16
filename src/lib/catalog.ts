import "server-only";
import { createClient } from "@/lib/supabase/server";
import { SERVICES, TIME_SLOTS, BRANCHES } from "@/lib/salon-data";

export type ServiceOption = { name: string; price: number; isNailArt: boolean };
export type BranchOption = { name: string; address: string | null };
export type StaffOption = { name: string; branch: string };

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
    branches: BRANCHES.map((b) => ({ name: b, address: null })),
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
        .select("name, address")
        .eq("active", true)
        .order("sort_order"),
      supabase.from("staff").select("name, branch").order("name"),
    ]);

    const svcRows =
      (svcRes.data as { name: string; price: number; is_nail_art: boolean }[] | null) ?? [];
    const slotRows = (slotRes.data as { label: string }[] | null) ?? [];
    const brRows = (brRes.data as { name: string; address: string | null }[] | null) ?? [];
    const staffRows = (staffRes.data as { name: string; branch: string }[] | null) ?? [];

    const fb = fallback(staffRows);

    return {
      services: svcRows.length
        ? svcRows.map((s) => ({ name: s.name, price: s.price, isNailArt: s.is_nail_art }))
        : fb.services,
      timeSlots: slotRows.length ? slotRows.map((s) => s.label) : fb.timeSlots,
      branches: brRows.length
        ? brRows.map((b) => ({ name: b.name, address: b.address }))
        : fb.branches,
      staff: staffRows.map((s) => ({ name: s.name, branch: s.branch })),
    };
  } catch {
    return fallback();
  }
}
