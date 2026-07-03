"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarCheck } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/dashboard/empty-state";
import { formatLocalDate, slotStartMinutes } from "@/lib/utils";
import type { BookingRow } from "@/lib/actions/admin";
import { earnedAmount } from "./staff-metrics";
import { TaskCard } from "./task-card";

const noop = () => {};
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** "Today" / "Yesterday" / "Wed, 24 Jun 2026" for a yyyy-MM-dd date. */
function dayLabel(date: string, now: number): string {
  const today = formatLocalDate(new Date(now));
  if (date === today) return "Today";
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (date === formatLocalDate(y)) return "Yesterday";
  return format(new Date(date), "EEE, dd MMM yyyy");
}

/**
 * The "done" folder: completed tasks only, grouped by the day they were done
 * (newest first) with a per-day count + earnings, and a day picker to jump to a
 * single day. Cards are read-only here — a completed booking is locked.
 */
export function StaffCompletedList({
  rows,
  now,
  onOpenExtras,
}: {
  rows: BookingRow[];
  now: number;
  onOpenExtras: (row: BookingRow) => void;
}) {
  const [day, setDay] = useState<string>("all");

  // Distinct days that actually have completed tasks, newest first.
  const dayOptions = useMemo(
    () => [...new Set(rows.map((r) => r.appointment_date))].sort((a, b) => b.localeCompare(a)),
    [rows],
  );

  // Group the (optionally day-filtered) tasks by day, newest day first.
  const groups = useMemo(() => {
    const filtered = day === "all" ? rows : rows.filter((r) => r.appointment_date === day);
    const byDay = new Map<string, BookingRow[]>();
    for (const r of filtered) {
      const list = byDay.get(r.appointment_date);
      if (list) list.push(r);
      else byDay.set(r.appointment_date, [r]);
    }
    return [...byDay.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, items]) => {
        const earnings = items.reduce((s, r) => s + earnedAmount(r), 0);
        return {
          date,
          items: items.sort((x, y) => slotStartMinutes(x.time_slot) - slotStartMinutes(y.time_slot)),
          earnings,
          commission: Math.round(earnings * 0.1), // 10% of that day's earnings
        };
      });
  }, [rows, day]);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<CalendarCheck className="h-6 w-6" />}
        title="No completed tasks yet"
        description="Tasks you mark as done get filed here, grouped by the day you did them."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {rows.length} completed task{rows.length === 1 ? "" : "s"}
        </p>
        <Select value={day} onValueChange={setDay}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All days</SelectItem>
            {dayOptions.map((d) => (
              <SelectItem key={d} value={d}>
                {dayLabel(d, now)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {groups.map((g) => (
        <div key={g.date} className="space-y-2.5">
          <div className="flex items-center justify-between px-1 pt-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {dayLabel(g.date, now)}
            </h3>
            <span className="text-xs text-muted-foreground">
              {g.items.length} task{g.items.length === 1 ? "" : "s"} · {inr(g.earnings)}
              <span className="ml-1 text-primary">· {inr(g.commission)} commission</span>
            </span>
          </div>
          {g.items.map((row) => (
            <TaskCard
              key={row.id}
              row={row}
              state="completed"
              busy={false}
              onComplete={noop}
              onOpenExtras={onOpenExtras}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
