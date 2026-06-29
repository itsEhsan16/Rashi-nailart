import { formatLocalDate } from "@/lib/utils";
import { scheduleBucket } from "@/lib/booking-sort";
import type { BookingRow } from "@/lib/actions/admin";

/** Earnings for a completed task = service price + in-studio extras (the ₹50 booking fee is the salon's). */
export function earnedAmount(r: BookingRow): number {
  return r.price + r.extras_total;
}

export type StaffStats = {
  tasksToday: number;
  tasksWeek: number;
  tasksTotal: number;
  todayEarnings: number;
  weekEarnings: number;
  totalEarnings: number;
};

export function computeStaffStats(rows: BookingRow[], now: number): StaffStats {
  const today = formatLocalDate(new Date(now));
  // "This week" = the last 7 days including today (yyyy-MM-dd compares lexically).
  const weekStartDate = new Date(now);
  weekStartDate.setDate(weekStartDate.getDate() - 6);
  const weekStart = formatLocalDate(weekStartDate);
  // A finished, paid task: completed by the artist AND payment verified. A row
  // that was completed but later rejected/cancelled must not count toward
  // earnings (the ₹50 booking fee is the salon's, never the artist's).
  const completed = rows.filter((r) => r.completed && r.payment_status === "verified");
  const completedToday = completed.filter((r) => r.appointment_date === today);
  const completedWeek = completed.filter((r) => r.appointment_date >= weekStart);
  return {
    tasksToday: completedToday.length,
    tasksWeek: completedWeek.length,
    tasksTotal: completed.length,
    todayEarnings: completedToday.reduce((s, r) => s + earnedAmount(r), 0),
    weekEarnings: completedWeek.reduce((s, r) => s + earnedAmount(r), 0),
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
