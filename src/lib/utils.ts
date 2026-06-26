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

/** "20:30" (24-hour, from <input type="time">) -> "8:30 PM". "" if malformed. */
export function formatTime12h(time24: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time24.trim());
  if (!m) return "";
  const h = Number(m[1]);
  const min = m[2];
  if (h > 23 || Number(min) > 59) return "";
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${min} ${period}`;
}

/**
 * Build a slot label from 24-hour start/end times, e.g. "8:30 PM – 10:00 PM".
 * Uses the same en-dash (–) convention as the seeded slots so the value
 * stays consistent with staff_schedules and slotStartLabel() parses it. "" if
 * either time is malformed.
 */
export function composeSlotLabel(start24: string, end24: string): string {
  const start = formatTime12h(start24);
  const end = formatTime12h(end24);
  return start && end ? `${start} – ${end}` : "";
}

/** Minutes since midnight for a 24-hour "HH:MM" — used to order slots chronologically. */
export function minutesOfDay(time24: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time24.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

/**
 * Minutes-of-day of a slot's START time, e.g. "11:45 AM – 1:15 PM" -> 705.
 * Composes slotStartLabel + buildTime24 + minutesOfDay; returns 0 if unparseable
 * (so a malformed slot sorts to the start rather than throwing).
 */
export function slotStartMinutes(slot: string): number {
  const start = slotStartLabel(slot).trim();
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(start);
  if (!m) return 0;
  const time24 = buildTime24(Number(m[1]), m[2], m[3].toUpperCase() as Period);
  return time24 ? minutesOfDay(time24) : 0;
}

/** Local "YYYY-MM-DD" (NOT UTC) — matches appointment_date which is a calendar date. */
export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type Period = "AM" | "PM";

/**
 * Split a 24-hour "HH:MM" into 12-hour clock parts for an AM/PM picker.
 *   "23:45" -> { h12: 11, min: "45", period: "PM" }
 *   "00:15" -> { h12: 12, min: "15", period: "AM" }  (midnight hour shows as 12 AM)
 *   "12:00" -> { h12: 12, min: "00", period: "PM" }  (noon shows as 12 PM)
 *   "" / malformed -> null
 * Mirrors the regex and bounds used by formatTime12h/minutesOfDay.
 */
export function parseTime24(value: string): { h12: number; min: string; period: Period } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2];
  if (h > 23 || Number(min) > 59) return null;
  const period: Period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { h12, min, period };
}

/**
 * Inverse of parseTime24: build a 24-hour "HH:MM" (zero-padded hour) from
 * 12-hour parts.
 *   (11, "45", "PM") -> "23:45"
 *   (12, "00", "AM") -> "00:00"   (12 AM = midnight)
 *   (12, "00", "PM") -> "12:00"   (12 PM = noon)
 *   (1,  "05", "AM") -> "01:05"
 * Returns "" for an out-of-range hour so callers can treat it as incomplete.
 */
export function buildTime24(h12: number, min: string, period: Period): string {
  if (h12 < 1 || h12 > 12) return "";
  let h = h12 % 12; // 12 -> 0
  if (period === "PM") h += 12; // 12 PM -> 12, 1 PM -> 13
  return `${String(h).padStart(2, "0")}:${min}`;
}
