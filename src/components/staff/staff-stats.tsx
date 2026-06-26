import { CheckCircle2, IndianRupee, TrendingUp } from "lucide-react";

import { StatCard } from "@/components/dashboard/stat-card";
import type { StaffStats } from "./staff-metrics";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export function StaffStatsRow({ stats }: { stats: StaffStats }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <StatCard
        label="Tasks completed"
        value={stats.tasksTotal}
        icon={<CheckCircle2 className="h-5 w-5" />}
        accent="emerald"
        hint={`${stats.tasksToday} today`}
      />
      <StatCard
        label="Today's earnings"
        value={inr(stats.todayEarnings)}
        icon={<IndianRupee className="h-5 w-5" />}
        accent="primary"
        hint="from completed tasks"
      />
      <StatCard
        label="Total earnings"
        value={inr(stats.totalEarnings)}
        icon={<TrendingUp className="h-5 w-5" />}
        accent="primary"
        hint={`${stats.tasksTotal} sessions`}
      />
    </div>
  );
}
