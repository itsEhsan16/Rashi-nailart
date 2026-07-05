"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { IndianRupee, PieChart, Users, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatCard } from "@/components/dashboard/stat-card";
import { SectionHeader } from "@/components/dashboard/page-header";
import { formatLocalDate, recentMonths } from "@/lib/utils";
import { getManagerOverview, type ManagerOverview } from "@/lib/actions/admin";
import { RevenueBreakdownDialog } from "./revenue-breakdown-dialog";
import { StaffEarningsTable } from "./staff-earnings-table";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const monthLabel = (m: string) => format(new Date(`${m}-01T00:00:00`), "MMMM yyyy");

/** Manager dashboard landing: branch revenue + per-artist earnings for a month,
 *  scoped to the manager's own branch. Memberships are salon-wide and excluded. */
export function ManagerOverviewPanel() {
  const [now, setNow] = useState(() => Date.now());
  // Local calendar date (not UTC) and re-derived as the wall clock ticks, so a
  // dashboard left open across a month boundary rolls over on its own.
  const currentMonth = useMemo(() => formatLocalDate(new Date(now)).slice(0, 7), [now]);
  const months = useMemo(() => recentMonths(currentMonth, 12), [currentMonth]);
  const [month, setMonth] = useState(currentMonth);
  const monthTouched = useRef(false);
  const [data, setData] = useState<ManagerOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!monthTouched.current) setMonth(currentMonth);
  }, [currentMonth]);

  function onMonthChange(m: string) {
    monthTouched.current = true;
    setMonth(m);
  }

  const load = useCallback(() => {
    setLoading(true);
    getManagerOverview({ month })
      .then((res) => {
        if (res.ok && res.overview) setData(res.overview);
        else if (!res.ok) toast.error(res.error);
      })
      .finally(() => setLoading(false));
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const monthPicker = (
    <Select value={month} onValueChange={onMonthChange}>
      <SelectTrigger className="w-44">
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
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <SectionHeader title="Overview" description={monthLabel(month)} />
          {monthPicker}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <SectionHeader title="Overview" description={monthLabel(month)} />
          {monthPicker}
        </div>
        <p className="text-muted-foreground">No data available.</p>
      </div>
    );
  }

  const inStore = data.breakdown.serviceCharges + data.breakdown.extras;
  const sessions = data.staffStats.reduce((s, r) => s + r.completed, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader title="Overview" description={`${data.branch} · ${monthLabel(data.month)}`} />
        {monthPicker}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label={`Branch revenue · ${data.branch}`}
          value={inr(data.totalRevenue)}
          icon={<IndianRupee className="h-5 w-5" />}
          accent="primary"
          hint="fees + services + extras"
        />
        <StatCard
          label="Completed sessions"
          value={String(sessions)}
          icon={<Users className="h-5 w-5" />}
          accent="emerald"
          hint={`${data.staffStats.length} artist${data.staffStats.length === 1 ? "" : "s"}`}
        />
        <StatCard
          label="Collected in-store"
          value={inr(inStore)}
          icon={<Wallet className="h-5 w-5" />}
          accent="primary"
          hint={`${inr(data.breakdown.upi)} UPI · ${inr(data.breakdown.cash)} cash`}
        />
      </div>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setBreakdownOpen(true)}>
          <PieChart className="mr-1 h-4 w-4" /> Revenue breakdown
        </Button>
      </div>

      <Card className="p-5">
        <SectionHeader title="Earnings by artist" className="mb-4" />
        <StaffEarningsTable rows={data.staffStats} />
      </Card>

      <RevenueBreakdownDialog
        open={breakdownOpen}
        onOpenChange={setBreakdownOpen}
        breakdown={data.breakdown}
        title={`Revenue breakdown · ${data.branch}`}
        showMemberships={false}
      />
    </div>
  );
}
