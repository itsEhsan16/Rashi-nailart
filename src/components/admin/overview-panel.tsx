"use client";

import { useEffect, useState } from "react";
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
import { IndianRupee, CalendarCheck, Crown, TrendingUp, CheckCircle2, Hourglass, PieChart } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/dashboard/stat-card";
import { SectionHeader } from "@/components/dashboard/page-header";
import { getAdminOverview, type Overview } from "@/lib/actions/admin";
import { RevenueBreakdownDialog } from "./revenue-breakdown-dialog";
import { StaffEarningsTable } from "./staff-earnings-table";

export function OverviewPanel() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  useEffect(() => {
    getAdminOverview()
      .then((res) => {
        if (res.ok && res.overview) setData(res.overview);
        else if (!res.ok) toast.error(res.error);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
        <Skeleton className="h-72 rounded-xl sm:col-span-2 lg:col-span-4" />
      </div>
    );
  }

  if (!data) return <p className="text-muted-foreground">No data available.</p>;

  const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total revenue"
          value={inr(data.totalRevenue)}
          icon={<IndianRupee className="h-5 w-5" />}
          accent="primary"
          hint={`${inr(data.breakdown.serviceCharges + data.breakdown.extras)} services+extras · ${inr(data.feeRevenue)} fees · ${inr(data.membershipRevenue)} members`}
        />
        <StatCard label="Bookings today" value={String(data.bookingsToday)} icon={<CalendarCheck className="h-5 w-5" />} accent="primary" hint="confirmed appointments" />
        <StatCard label="This week" value={String(data.bookingsWeek)} icon={<TrendingUp className="h-5 w-5" />} accent="primary" hint={`${data.bookingsMonth} this month`} />
        <StatCard label="Active members" value={String(data.activeMembers)} icon={<Crown className="h-5 w-5" />} accent="primary" />
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
        <SectionHeader title="Revenue · last 14 days" className="mb-4" />
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.revenueByDay} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="fees" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="mem" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0} />
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
              />
              <Area type="monotone" dataKey="fees" name="Booking fees" stroke="var(--primary)" fill="url(#fees)" />
              <Area type="monotone" dataKey="memberships" name="Memberships" stroke="var(--chart-2)" fill="url(#mem)" />
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
