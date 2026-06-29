import { formatLocalDate, slotStartMinutes } from "@/lib/utils";
import type { BookingRow } from "@/lib/actions/admin";

/**
 * Schedule bucket — a lower number sorts higher in the list. Shared by the
 * staff dashboard and the admin bookings panel so both show the exact same
 * "what do I attend next" chronology.
 *
 *  0   actionable now: verified, not done, and the slot has arrived today — or an
 *      overdue past date that was never completed → TOP
 *  1   verified, not done, later today
 *  1.5 verified, not done, on a future date
 *  2   awaiting action: payment not yet verified (uploaded / pending)
 *  3   finished or closed: completed, cancelled, or rejected → BOTTOM
 */
export function scheduleBucket(r: BookingRow, now: number): number {
  if (r.completed || r.payment_status === "cancelled" || r.payment_status === "rejected") return 3;
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

/**
 * Stable schedule ordering: the soonest appointment to attend leads, finished or
 * cancelled rows sink to the bottom (most-recent first). Sorting by calendar date
 * then by the slot's start time means an earlier appointment is always above a
 * later one. Used by both the staff dashboard and the admin bookings list.
 */
export function sortBySchedule(rows: BookingRow[], now: number): BookingRow[] {
  return rows.slice().sort((a, b) => {
    const ba = scheduleBucket(a, now);
    const bb = scheduleBucket(b, now);
    if (ba !== bb) return ba - bb;
    if (ba === 3) {
      // finished/closed: most recent first
      return (
        b.appointment_date.localeCompare(a.appointment_date) ||
        slotStartMinutes(b.time_slot) - slotStartMinutes(a.time_slot)
      );
    }
    // active: soonest first (earliest date, then earliest start time)
    return (
      a.appointment_date.localeCompare(b.appointment_date) ||
      slotStartMinutes(a.time_slot) - slotStartMinutes(b.time_slot)
    );
  });
}
