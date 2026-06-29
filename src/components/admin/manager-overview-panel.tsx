"use client";

import { useEffect, useState } from "react";
import { IndianRupee, PieChart, Users, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/dashboard/stat-card";
import { SectionHeader } from "@/components/dashboard/page-header";
import { getManagerOverview, type ManagerOverview } from "@/lib/actions/admin";
import { RevenueBreakdownDialog } from "./revenue-breakdown-dialog";
import { StaffEarningsTable } from "./staff-earnings-table";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** Manager dashboard landing: branch revenue + per-artist earnings, all scoped
 *  to the manager's own branch. Memberships are salon-wide and excluded. */
export function ManagerOverviewPanel() {
  const [data, setData] = useState<ManagerOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  useEffect(() => {
    getManagerOverview()
      .then((res) => {
        if (res.ok && res.overview) setData(res.overview);
        else if (!res.ok) toast.error(res.error);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!data) return <p className="text-muted-foreground">No data available.</p>;

  const inStore = data.breakdown.serviceCharges + data.breakdown.extras;
  const sessions = data.staffStats.reduce((s, r) => s + r.completed, 0);

  return (
    <div className="space-y-6">
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
