"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { IndianRupee, CalendarCheck, Crown, CheckCircle2, Hourglass, PieChart } from "lucide-react";
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
import { recentMonths } from "@/lib/utils";
import { getAdminOverview, type Overview } from "@/lib/actions/admin";
import { RevenueBreakdownDialog } from "./revenue-breakdown-dialog";
import { StaffEarningsTable } from "./staff-earnings-table";

const monthLabel = (m: string) => format(new Date(`${m}-01T00:00:00`), "MMMM yyyy");

export function OverviewPanel() {
  const currentMonth = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const months = useMemo(() => recentMonths(currentMonth, 12), [currentMonth]);
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getAdminOverview({ month })
      .then((res) => {
        if (res.ok && res.overview) setData(res.overview);
        else if (!res.ok) toast.error(res.error);
      })
      .finally(() => setLoading(false));
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  const monthPicker = (
    <Select value={month} onValueChange={setMonth}>
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
          <Skeleton className="h-72 rounded-xl sm:col-span-2 lg:col-span-4" />
        </div>
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader title="Overview" description={`Figures for ${monthLabel(data.month)}`} />
        {monthPicker}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total revenue"
          value={inr(data.totalRevenue)}
          icon={<IndianRupee className="h-5 w-5" />}
          accent="primary"
          hint={`${inr(data.breakdown.serviceCharges + data.breakdown.extras)} services+extras · ${inr(data.feeRevenue)} fees · ${inr(data.membershipRevenue)} members`}
        />
        <StatCard
          label="Bookings"
          value={String(data.bookingsMonth)}
          icon={<CalendarCheck className="h-5 w-5" />}
          accent="primary"
          hint={`confirmed in ${monthLabel(data.month)}`}
        />
        <StatCard
          label="Completed sessions"
          value={String(data.completedSessions)}
          icon={<CheckCircle2 className="h-5 w-5" />}
          accent="emerald"
          hint="marked done by staff"
        />
        <StatCard
          label="Pending sessions"
          value={String(data.pendingSessions)}
          icon={<Hourglass className="h-5 w-5" />}
          accent="amber"
          hint="confirmed, not yet completed"
        />
        <StatCard
          label="New members"
          value={String(data.newMembers)}
          icon={<Crown className="h-5 w-5" />}
          accent="primary"
          hint={`${data.activeMembers} active total`}
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

      <Card className="p-5">
        <SectionHeader title={`Revenue by day · ${monthLabel(data.month)}`} className="mb-4" />
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.revenueByDay} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="fees" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="svc" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-3)" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="var(--chart-3)" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="mem" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value) => inr(Number(value))}
              />
              {/* Stacked so the top edge = whole revenue for the day. */}
              <Area type="monotone" dataKey="services" name="Services + extras" stackId="rev" stroke="var(--chart-3)" fill="url(#svc)" />
              <Area type="monotone" dataKey="fees" name="Booking fees" stackId="rev" stroke="var(--primary)" fill="url(#fees)" />
              <Area type="monotone" dataKey="memberships" name="Memberships" stackId="rev" stroke="var(--chart-2)" fill="url(#mem)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-5">
        <SectionHeader title="Bookings by branch" className="mb-4" />
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.bookingsByBranch} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="branch" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="count" name="Bookings" fill="var(--primary)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <RevenueBreakdownDialog
        open={breakdownOpen}
        onOpenChange={setBreakdownOpen}
        breakdown={data.breakdown}
      />
    </div>
  );
}
