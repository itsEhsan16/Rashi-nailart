"use client";

import { CalendarDays } from "lucide-react";

import { EmptyState } from "@/components/dashboard/empty-state";
import type { BookingRow } from "@/lib/actions/admin";
import { sortTasks, taskStateOf, type TaskState } from "./staff-metrics";
import { TaskCard } from "./task-card";

const GROUP_LABEL: Record<TaskState, string> = {
  now: "Happening now",
  upcoming: "Upcoming",
  completed: "Completed",
};

export function StaffTaskList({
  rows,
  now,
  busyId,
  onComplete,
  onOpenExtras,
}: {
  rows: BookingRow[];
  now: number;
  busyId: string | null;
  onComplete: (id: string) => void;
  onOpenExtras: (row: BookingRow) => void;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<CalendarDays className="h-6 w-6" />}
        title="No appointments yet"
        description="Confirmed bookings assigned to you will appear here, sorted so what's next is always on top."
      />
    );
  }

  const sorted = sortTasks(rows, now);
  let lastGroup: TaskState | null = null;

  return (
    <div className="space-y-2.5">
      {sorted.map((row) => {
        const state = taskStateOf(row, now);
        const showHeader = state !== lastGroup;
        lastGroup = state;
        return (
          <div key={row.id} className="space-y-2.5">
            {showHeader && (
              <h3 className="px-1 pt-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {GROUP_LABEL[state]}
              </h3>
            )}
            <TaskCard
              row={row}
              state={state}
              busy={busyId === row.id}
              onComplete={onComplete}
              onOpenExtras={onOpenExtras}
            />
          </div>
        );
      })}
    </div>
  );
}
