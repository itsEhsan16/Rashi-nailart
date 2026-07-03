"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarOff, Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { recentMonths } from "@/lib/utils";
import { getMySalary, type SalaryView } from "@/lib/actions/admin";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const monthLabel = (m: string) => format(new Date(`${m}-01T00:00:00`), "MMMM yyyy");

/**
 * The stylist's own read-only payroll for a month: days absent and the net pay
 * they'll receive (salary − absences × per-day deduction). A month picker lists
 * recent months. Figures come from the same rows the admin edits, so they reconcile.
 */
export function StaffSalaryCard({ currentMonth }: { currentMonth: string }) {
  const months = useMemo(() => recentMonths(currentMonth, 12), [currentMonth]);
  const [month, setMonth] = useState(currentMonth);
  const [loading, setLoading] = useState(true);
  const [salary, setSalary] = useState<SalaryView | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getMySalary({ month });
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error);
      setSalary(null);
      return;
    }
    setSalary(res.salary);
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  // "Published" = an admin has actually set a salary for this (or an earlier) month.
  const published = !!salary && (salary.exists || salary.base_salary > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Your salary for the selected month</p>
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
      </div>

      {loading ? (
        <Card className="rounded-xl p-6 shadow-soft">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        </Card>
      ) : !published ? (
        <EmptyState
          icon={<Wallet className="h-6 w-6" />}
          title="Salary not published yet"
          description="Your salary for this month hasn't been set by the studio yet. Check back later."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label="Days absent"
              value={salary!.absent_days}
              icon={<CalendarOff className="h-5 w-5" />}
              accent="amber"
              hint={
                salary!.deduction > 0
                  ? `−${inr(salary!.deduction)} deducted`
                  : "no deduction this month"
              }
            />
            <StatCard
              label="Monthly salary"
              value={inr(salary!.base_salary)}
              icon={<Wallet className="h-5 w-5" />}
              accent="primary"
              hint={`less ${inr(salary!.per_day_deduction)}/absent day`}
            />
            <StatCard
              label="Net pay"
              value={inr(salary!.net)}
              icon={<Wallet className="h-5 w-5" />}
              accent="emerald"
              hint="what you'll receive"
            />
          </div>
        </>
      )}
    </div>
  );
}
