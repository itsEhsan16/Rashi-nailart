import { formatLocalDate } from "@/lib/utils";
import { scheduleBucket } from "@/lib/booking-sort";
import type { BookingRow } from "@/lib/actions/admin";

/** Earnings for a completed task = service price + in-studio extras (the ₹50 booking fee is the salon's). */
export function earnedAmount(r: BookingRow): number {
  return r.price + r.extras_total;
}

/**
 * Total a client paid for one booking: net service price + in-store extras + the
 * ₹50 online booking fee. This is the base the artist's monthly commission is on
 * (the salon counts the whole amount the client paid, fee included).
 */
export function clientPaidAmount(r: BookingRow): number {
  return r.price + r.extras_total + r.amount;
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

export type MonthlyStats = {
  month: string; // "2026-06"
  appointmentCount: number; // completed & verified that month
  totalPaid: number; // Σ clientPaidAmount = money clients paid (incl. ₹50 fee)
  commission: number; // 10% of totalPaid, rounded
};

/** Months (yyyy-MM) that have completed+verified work, newest first. */
export function monthsWithData(rows: BookingRow[]): string[] {
  const months = new Set<string>();
  for (const r of rows) {
    if (r.completed && r.payment_status === "verified") months.add(r.appointment_date.slice(0, 7));
  }
  return [...months].sort((a, b) => b.localeCompare(a));
}

/**
 * One artist's performance for a single month: services done (completed + payment
 * verified), the total clients paid, and their 10% commission on that.
 */
export function computeMonthlyStats(rows: BookingRow[], targetMonth: string): MonthlyStats {
  const inMonth = rows.filter(
    (r) =>
      r.completed &&
      r.payment_status === "verified" &&
      r.appointment_date.slice(0, 7) === targetMonth,
  );
  const totalPaid = inMonth.reduce((s, r) => s + clientPaidAmount(r), 0);
  return {
    month: targetMonth,
    appointmentCount: inMonth.length,
    totalPaid,
    commission: Math.round(totalPaid * 0.1),
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
