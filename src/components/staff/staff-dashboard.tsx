"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/dashboard/page-header";
import { ExtrasDialog } from "@/components/dashboard/extras-dialog";
import { formatLocalDate } from "@/lib/utils";
import { listBookings, completeBooking, type BookingRow } from "@/lib/actions/admin";
import { computeStaffStats } from "./staff-metrics";
import { StaffStatsRow } from "./staff-stats";
import { StaffTaskList } from "./staff-task-list";
import { StaffCompletedList } from "./staff-completed-list";
import { StaffMonthlyView } from "./staff-monthly-view";
import { StaffSalaryCard } from "./staff-salary-card";

export function StaffDashboard({ greetingName }: { greetingName: string }) {
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [extrasFor, setExtrasFor] = useState<BookingRow | null>(null);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    const res = await listBookings();
    if (manual) setRefreshing(false);
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setRows(res.bookings);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Re-sort/re-stat as wall-clock advances so arrived tasks rise to the top.
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const stats = useMemo(() => computeStaffStats(rows, now), [rows, now]);
  const currentMonth = useMemo(() => formatLocalDate(new Date(now)).slice(0, 7), [now]);
  // The task list is for actionable work — drop dead bookings the artist can't act on.
  const taskRows = useMemo(
    () => rows.filter((r) => r.payment_status !== "rejected" && r.payment_status !== "cancelled"),
    [rows],
  );
  // Active work stays in the main list; finished tasks move to the Completed folder.
  const activeRows = useMemo(() => taskRows.filter((r) => !r.completed), [taskRows]);
  const completedRows = useMemo(() => taskRows.filter((r) => r.completed), [taskRows]);

  async function onComplete(id: string) {
    setBusyId(id);
    const res = await completeBooking({ id });
    setBusyId(null);
    if (!res.ok) return toast.error(res.error);
    toast.success("Marked complete");
    void load();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            Hi {greetingName}
            <Sparkles className="h-6 w-6 text-primary" />
          </span>
        }
        subtitle="Your tasks and earnings at a glance"
        actions={
          <Button variant="outline" size="sm" onClick={() => load(true)} disabled={refreshing}>
            <RefreshCw className={refreshing ? "mr-1 h-4 w-4 animate-spin" : "mr-1 h-4 w-4"} />
            Refresh
          </Button>
        }
      />

      {loading ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
          <div className="space-y-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        </div>
      ) : (
        <>
          <StaffStatsRow stats={stats} />
          <Tabs defaultValue="tasks">
            <TabsList>
              <TabsTrigger value="tasks">
                Tasks{activeRows.length > 0 ? ` (${activeRows.length})` : ""}
              </TabsTrigger>
              <TabsTrigger value="completed">
                Completed{completedRows.length > 0 ? ` (${completedRows.length})` : ""}
              </TabsTrigger>
              <TabsTrigger value="monthly">Monthly</TabsTrigger>
              <TabsTrigger value="salary">Salary</TabsTrigger>
            </TabsList>
            <TabsContent value="tasks">
              <StaffTaskList
                rows={activeRows}
                now={now}
                busyId={busyId}
                onComplete={onComplete}
                onOpenExtras={setExtrasFor}
              />
            </TabsContent>
            <TabsContent value="completed">
              <StaffCompletedList rows={completedRows} now={now} onOpenExtras={setExtrasFor} />
            </TabsContent>
            <TabsContent value="monthly">
              <StaffMonthlyView rows={rows} currentMonth={currentMonth} />
            </TabsContent>
            <TabsContent value="salary">
              <StaffSalaryCard currentMonth={currentMonth} />
            </TabsContent>
          </Tabs>
        </>
      )}

      <ExtrasDialog booking={extrasFor} onOpenChange={(o) => !o && setExtrasFor(null)} onChanged={load} />
    </div>
  );
}
