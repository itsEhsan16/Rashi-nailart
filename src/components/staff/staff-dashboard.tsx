"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { RefreshCw, Sparkles, CheckCircle2, IndianRupee, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { ExtrasDialog } from "@/components/dashboard/extras-dialog";
import { formatLocalDate, recentMonths } from "@/lib/utils";
import { listBookings, completeBooking, type BookingRow } from "@/lib/actions/admin";
import { computeMonthlyStats } from "./staff-metrics";
import { StaffTaskList } from "./staff-task-list";
import { StaffCompletedList } from "./staff-completed-list";
import { StaffSalaryCard } from "./staff-salary-card";
import { TaskCard } from "./task-card";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const monthLabel = (m: string) => format(new Date(`${m}-01T00:00:00`), "MMMM yyyy");

export function StaffDashboard({ greetingName }: { greetingName: string }) {
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [extrasFor, setExtrasFor] = useState<BookingRow | null>(null);

  // Derived from the ticking `now` (not just mount time) so a dashboard left open
  // across a month boundary rolls over to the new month on its own.
  const currentMonth = useMemo(() => formatLocalDate(new Date(now)).slice(0, 7), [now]);
  const months = useMemo(() => recentMonths(currentMonth, 12), [currentMonth]);
  const [month, setMonth] = useState(currentMonth);
  const monthTouched = useRef(false);

  useEffect(() => {
    if (!monthTouched.current) setMonth(currentMonth);
  }, [currentMonth]);

  function onMonthChange(m: string) {
    monthTouched.current = true;
    setMonth(m);
  }

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

  // Drop dead bookings the artist can't act on. Split off bookings that were
  // reassigned AWAY from this stylist — shown read-only, never counted in earnings.
  const taskRows = useMemo(
    () => rows.filter((r) => r.payment_status !== "rejected" && r.payment_status !== "cancelled"),
    [rows],
  );
  const myRows = useMemo(() => taskRows.filter((r) => !r.reassigned_away), [taskRows]);
  const reassignedAwayActive = useMemo(
    () => taskRows.filter((r) => r.reassigned_away && !r.completed),
    [taskRows],
  );
  const activeRows = useMemo(() => myRows.filter((r) => !r.completed), [myRows]);
  const completedRows = useMemo(() => myRows.filter((r) => r.completed), [myRows]);
  // The Completed folder + the summary cards are scoped to the selected month.
  const monthCompleted = useMemo(
    () => completedRows.filter((r) => r.appointment_date.slice(0, 7) === month),
    [completedRows, month],
  );
  const monthStats = useMemo(() => computeMonthlyStats(myRows, month), [myRows, month]);

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
          <div className="flex items-center gap-2">
            <Select value={month} onValueChange={onMonthChange}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map((m) => (
                  <SelectItem key={m} value={m}>
                    {monthLabel(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => load(true)} disabled={refreshing}>
              <RefreshCw className={refreshing ? "mr-1 h-4 w-4 animate-spin" : "mr-1 h-4 w-4"} />
              Refresh
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
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
          {/* Earnings summary — scoped to the selected month so past months don't mix in. */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label="Tasks completed"
              value={monthStats.appointmentCount}
              icon={<CheckCircle2 className="h-5 w-5" />}
              accent="emerald"
              hint={`in ${monthLabel(month)}`}
            />
            <StatCard
              label="Earnings"
              value={inr(monthStats.totalPaid)}
              icon={<IndianRupee className="h-5 w-5" />}
              accent="primary"
              hint="service + extras"
            />
            <StatCard
              label="Commission (10%)"
              value={inr(monthStats.commission)}
              icon={<Wallet className="h-5 w-5" />}
              accent="amber"
              hint={`for ${monthLabel(month)}`}
            />
          </div>

          <Tabs defaultValue="tasks">
            <TabsList>
              <TabsTrigger value="tasks">
                Tasks{activeRows.length > 0 ? ` (${activeRows.length})` : ""}
              </TabsTrigger>
              <TabsTrigger value="completed">
                Completed{monthCompleted.length > 0 ? ` (${monthCompleted.length})` : ""}
              </TabsTrigger>
              <TabsTrigger value="salary">Salary</TabsTrigger>
            </TabsList>
            <TabsContent value="tasks" className="space-y-5">
              <StaffTaskList
                rows={activeRows}
                now={now}
                busyId={busyId}
                onComplete={onComplete}
                onOpenExtras={setExtrasFor}
              />
              {reassignedAwayActive.length > 0 && (
                <div className="space-y-2.5">
                  <h3 className="px-1 pt-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Reassigned to another artist
                  </h3>
                  {reassignedAwayActive.map((row) => (
                    <TaskCard
                      key={row.id}
                      row={row}
                      state="upcoming"
                      busy={false}
                      onComplete={() => {}}
                      onOpenExtras={() => {}}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
            <TabsContent value="completed">
              <StaffCompletedList rows={monthCompleted} now={now} onOpenExtras={setExtrasFor} />
            </TabsContent>
            <TabsContent value="salary">
              <StaffSalaryCard month={month} />
            </TabsContent>
          </Tabs>
        </>
      )}

      <ExtrasDialog booking={extrasFor} onOpenChange={(o) => !o && setExtrasFor(null)} onChanged={load} />
    </div>
  );
}
