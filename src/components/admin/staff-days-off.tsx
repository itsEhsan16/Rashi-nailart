"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { CalendarOff, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card } from "@/components/ui/card";
import { cn, daysInMonth, formatLocalDate } from "@/lib/utils";
import { addStaffDayOff, getStaffMonthOff, removeStaffDayOff } from "@/lib/actions/admin";

/**
 * Local midnight for an ISO "YYYY-MM-DD". The explicit "T00:00:00" (no zone) is
 * what makes it LOCAL — `new Date("2026-09-07")` is parsed as UTC and lands on
 * the previous evening in IST.
 */
function isoToDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

/** "7 Sep 2026" — the phrasing used in toasts and the blocked-date list. */
function dayLabel(iso: string): string {
  return format(isoToDate(iso), "d MMM yyyy");
}

/**
 * Month calendar for blocking individual dates for one artist — festivals, leave,
 * anything that overrides the weekly schedule for a single day. Clicking a date
 * saves immediately (optimistic, reverted on failure); customers can't book a
 * blocked date and the server refuses one even if the page is stale.
 *
 * Deliberately separate from payroll absences: this is booking availability.
 */
export function StaffDaysOff({
  staffId,
  canEdit,
  workingWeekdays,
}: {
  staffId: string;
  canEdit: boolean;
  /** Weekdays (0=Sun..6=Sat) the artist works per their weekly schedule — days not in
   *  this list are already off every week and are shown muted. */
  workingWeekdays: number[];
}) {
  // "Today" is pinned for the life of the dialog: the past/future boundary must not
  // shift under the admin mid-edit, and every comparison is a plain ISO string.
  const todayIso = useMemo(() => formatLocalDate(new Date()), []);
  const [month, setMonth] = useState(() => todayIso.slice(0, 7));
  const [daysOff, setDaysOff] = useState<Set<string>>(new Set());
  const [bookedCounts, setBookedCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  // Dates with a write in flight — blocks a double toggle and drives the busy state.
  const [pending, setPending] = useState<Set<string>>(new Set());
  // The same in-flight writes, as date -> "should end up blocked", in a ref so `load`
  // can consult them without depending on them. A read that left before a write
  // cannot know about that write, so its answer must not be allowed to undo one.
  const inFlight = useRef<Map<string, boolean>>(new Map());

  const load = useCallback(
    async (isActive: () => boolean) => {
      setLoading(true);
      const res = await getStaffMonthOff({ staffId, month });
      // The admin can click through months faster than the reads come back, so a
      // response for a month we've already navigated away from must be dropped.
      if (!isActive()) return;
      setLoading(false);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      // Take the server's answer, then re-apply anything still being written —
      // otherwise clicking a date while the month is still loading looks like it
      // silently failed, even though the row was saved.
      setDaysOff(() => {
        const next = new Set(res.data.daysOff);
        for (const [iso, shouldBeOff] of inFlight.current) {
          if (shouldBeOff) next.add(iso);
          else next.delete(iso);
        }
        return next;
      });
      setBookedCounts(res.data.bookedCounts);
    },
    [staffId, month],
  );

  useEffect(() => {
    let active = true;
    void load(() => active);
    return () => {
      active = false;
    };
  }, [load]);

  const workingSet = useMemo(() => new Set(workingWeekdays), [workingWeekdays]);
  // Only the displayed month is rendered (showOutsideDays is off), so every
  // derived modifier list is built from exactly the days on screen.
  const monthDays = useMemo(() => daysInMonth(month), [month]);
  const monthDate = useMemo(() => isoToDate(`${month}-01`), [month]);
  const todayStart = useMemo(() => isoToDate(todayIso), [todayIso]);

  const selectedDates = useMemo(() => [...daysOff].map(isoToDate), [daysOff]);
  const bookedDates = useMemo(
    () => monthDays.filter((d) => (bookedCounts[d] ?? 0) > 0).map(isoToDate),
    [monthDays, bookedCounts],
  );
  const weeklyOffDates = useMemo(
    () => monthDays.filter((d) => !workingSet.has(isoToDate(d).getDay())).map(isoToDate),
    [monthDays, workingSet],
  );
  const pendingDates = useMemo(() => [...pending].map(isoToDate), [pending]);

  // The calendar alone is hard to scan, so the blocked dates are also listed.
  const blockedThisMonth = useMemo(
    () => monthDays.filter((d) => daysOff.has(d)),
    [monthDays, daysOff],
  );
  const clashes = blockedThisMonth.reduce((n, iso) => n + (bookedCounts[iso] ?? 0), 0);

  /**
   * Block or unblock one date, saving straight away. Optimistic: the grid updates
   * before the round trip and the exact same edit is undone if the write fails.
   */
  const toggle = useCallback(
    async (day: Date) => {
      if (!canEdit) return;
      const iso = formatLocalDate(day);
      // ISO dates sort as strings, so "in the past" needs no date maths.
      if (iso < todayIso || pending.has(iso)) return;

      const wasOff = daysOff.has(iso);
      setDaysOff((prev) => {
        const next = new Set(prev);
        if (wasOff) next.delete(iso);
        else next.add(iso);
        return next;
      });
      setPending((prev) => new Set(prev).add(iso));
      inFlight.current.set(iso, !wasOff);

      const settle = () => {
        inFlight.current.delete(iso);
        setPending((prev) => {
          const next = new Set(prev);
          next.delete(iso);
          return next;
        });
      };
      const revert = () =>
        setDaysOff((prev) => {
          const next = new Set(prev);
          if (wasOff) next.add(iso);
          else next.delete(iso);
          return next;
        });

      if (wasOff) {
        const res = await removeStaffDayOff({ staffId, date: iso });
        settle();
        if (!res.ok) {
          revert();
          toast.error(res.error);
          return;
        }
        toast.success(`${dayLabel(iso)} is back on the schedule`);
        return;
      }

      const res = await addStaffDayOff({ staffId, date: iso, reason: null });
      settle();
      if (!res.ok) {
        revert();
        toast.error(res.error);
        return;
      }
      // Blocking a date never touches bookings already taken on it — say so loudly,
      // because the artist is now unbookable but those clients are still expected.
      if (res.bookings > 0) {
        const one = res.bookings === 1;
        toast.warning(
          `${dayLabel(iso)} is blocked, but ${res.bookings} booking${one ? "" : "s"} on that date ${
            one ? "was" : "were"
          } NOT cancelled. Reassign or cancel ${one ? "it" : "them"} from the Bookings page.`,
        );
        return;
      }
      toast.success(`${dayLabel(iso)} blocked`);
    },
    [canEdit, daysOff, pending, staffId, todayIso],
  );

  return (
    <Card className="rounded-xl p-4 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CalendarOff className="h-4 w-4 text-primary" /> Days off
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
        {!canEdit && <span className="text-xs text-muted-foreground">Read-only</span>}
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        Pick the dates this artist is not working — festivals, leave, anything. Customers
        can&apos;t book these dates.
      </p>

      <div className="mt-3 flex justify-center">
        <Calendar
          mode="multiple"
          selected={selectedDates}
          /* react-day-picker only treats `selected` as controlled while an onSelect
             handler is present — without one it quietly keeps its own copy and our
             optimistic updates would never reach the grid. The real toggle lives in
             onDayClick, so this handler is deliberately empty. */
          onSelect={() => {}}
          month={monthDate}
          onMonthChange={(d) => setMonth(formatLocalDate(d).slice(0, 7))}
          onDayClick={(day) => void toggle(day)}
          /* Neighbouring-month days are hidden so a stray click can't silently
             write a day off into a month the admin isn't looking at. */
          showOutsideDays={false}
          disabled={(d) => !canEdit || d < todayStart}
          modifiers={{ booked: bookedDates, weeklyOff: weeklyOffDates, pending: pendingDates }}
          modifiersClassNames={{
            // Dot under the date — survives the blocked fill behind it.
            booked:
              "after:pointer-events-none after:absolute after:bottom-1 after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-amber-500 after:content-['']",
            weeklyOff: "text-muted-foreground/60",
            pending: "animate-pulse",
          }}
          /* Blocking is a negative selection, so the selected day must not wear the
             usual "chosen" primary. Overriding the same data-attribute variant lets
             tailwind-merge drop the default bg/text inside the day button. */
          classNames={{
            day_button:
              "data-[selected-single=true]:bg-destructive data-[selected-single=true]:text-destructive-foreground data-[selected-single=true]:font-semibold data-[selected-single=true]:hover:bg-destructive/90",
          }}
          className="bg-transparent p-0 [--cell-size:2.25rem]"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-destructive" aria-hidden="true" /> Blocked
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" /> Has bookings
        </span>
        <span className="flex items-center gap-1.5">
          <span className="font-medium text-muted-foreground/50" aria-hidden="true">
            15
          </span>{" "}
          Weekly off
        </span>
      </div>

      <div className="mt-3 border-t border-border/60 pt-3">
        {blockedThisMonth.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No days off in {format(monthDate, "MMMM yyyy")}.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {blockedThisMonth.map((iso) => {
              const count = bookedCounts[iso] ?? 0;
              const busy = pending.has(iso);
              return (
                <li key={iso}>
                  <span
                    className={cn(
                      "flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 py-1 pl-2.5 text-xs",
                      canEdit ? "pr-1" : "pr-2.5",
                      busy && "opacity-60",
                    )}
                  >
                    {dayLabel(iso)}
                    {count > 0 && (
                      <span className="text-[10px] text-amber-600 dark:text-amber-400">
                        · {count} booked
                      </span>
                    )}
                    {canEdit && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5 rounded-full text-muted-foreground hover:text-destructive [&_svg]:size-3"
                        aria-label={`Unblock ${dayLabel(iso)}`}
                        // Past dates stay listed for the record but can no longer be edited.
                        disabled={busy || iso < todayIso}
                        onClick={() => void toggle(isoToDate(iso))}
                      >
                        <X />
                      </Button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {clashes > 0 && (
          <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
            {clashes} booking{clashes === 1 ? "" : "s"} already sit{clashes === 1 ? "s" : ""} on a
            blocked date this month. Blocking doesn&apos;t cancel anything — reassign or cancel
            {clashes === 1 ? " it" : " them"} from the Bookings page.
          </p>
        )}
      </div>
    </Card>
  );
}
