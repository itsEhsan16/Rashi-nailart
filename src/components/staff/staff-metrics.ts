import { formatLocalDate } from "@/lib/utils";
import { scheduleBucket } from "@/lib/booking-sort";
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

/** Visual state for a task card, derived from its shared schedule bucket. */
export function taskStateOf(r: BookingRow, now: number): TaskState {
  const b = scheduleBucket(r, now);
  if (b === 3) return "completed";
  if (b === 0) return "now";
  return "upcoming";
}
