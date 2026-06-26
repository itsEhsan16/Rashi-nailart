import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Customer-facing text for a time slot: just the start time.
 *
 * Slots are stored as ranges ("11:45 AM – 1:15 PM") so the value stays in sync
 * with each stylist's saved schedule (staff_schedules.time_slot), but customers
 * only need the start ("11:45 AM"). Display-only — never submit this value.
 */
export function slotStartLabel(slot: string): string {
  // Everything before the first range separator (en dash, em dash, or hyphen).
  return slot.split(/\s*[–—-]\s*/)[0].trim();
}
