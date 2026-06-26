import { formatLocalDate, slotStartMinutes } from "@/lib/utils";
import type { BookingRow } from "@/lib/actions/admin";

/** Earnings for a completed task = service price + in-studio extras (the ₹50 booking fee is the salon's). */
export function earnedAmount(r: BookingRow): number {
  return r.price + r.extras_total;
}

export type StaffStats = {
  tasksToday: number;
  tasksTotal: number;
  todayEarnings: number;
  totalEarnings: number;
};

export function computeStaffStats(rows: BookingRow[], now: number): StaffStats {
  const today = formatLocalDate(new Date(now));
  // A finished, paid task: completed by the artist AND payment verified. A row
  // that was completed but later rejected/cancelled must not count toward
  // earnings (the ₹50 booking fee is the salon's, never the artist's).
  const completed = rows.filter((r) => r.completed && r.payment_status === "verified");
  const completedToday = completed.filter((r) => r.appointment_date === today);
  return {
    tasksToday: completedToday.length,
    tasksTotal: completed.length,
    todayEarnings: completedToday.reduce((s, r) => s + earnedAmount(r), 0),
    totalEarnings: completed.reduce((s, r) => s + earnedAmount(r), 0),
  };
}

export type TaskState = "now" | "upcoming" | "completed";

/**
 * Lower bucket = higher in the list. Drives the dynamic ordering:
 *  0   verified, not done, time has ARRIVED (today, now ≥ start) — or overdue past date → TOP
 *  1   verified, not done, upcoming today
 *  1.5 verified, not done, future date
 *  2   not actionable yet (awaiting verification etc.)
 *  3   completed → BOTTOM
 */
function bucketOf(r: BookingRow, now: number): number {
  if (r.completed) return 3;
  const today = formatLocalDate(new Date(now));
  if (r.payment_status !== "verified") return 2;
  const isToday = r.appointment_date === today;
  if (isToday) {
    const nowDate = new Date(now);
    const nowMin = nowDate.getHours() * 60 + nowDate.getMinutes();
    return nowMin >= slotStartMinutes(r.time_slot) ? 0 : 1;
  }
  if (r.appointment_date > today) return 1.5;
  return 0; // verified, past date, not completed → overdue, surface at top
}

/** Visual state for a task card, derived from its bucket. */
export function taskStateOf(r: BookingRow, now: number): TaskState {
  const b = bucketOf(r, now);
  if (b === 3) return "completed";
  if (b === 0) return "now";
  return "upcoming";
}

/** Stable, dynamic ordering: arrived→top, completed→bottom, soonest-first within active groups. */
export function sortTasks(rows: BookingRow[], now: number): BookingRow[] {
  return rows.slice().sort((a, b) => {
    const ba = bucketOf(a, now);
    const bb = bucketOf(b, now);
    if (ba !== bb) return ba - bb;
    if (ba === 3) {
      // completed: most recent first
      return (
        b.appointment_date.localeCompare(a.appointment_date) ||
        slotStartMinutes(b.time_slot) - slotStartMinutes(a.time_slot)
      );
    }
    // active/upcoming: soonest first
    return (
      a.appointment_date.localeCompare(b.appointment_date) ||
      slotStartMinutes(a.time_slot) - slotStartMinutes(b.time_slot)
    );
  });
}
