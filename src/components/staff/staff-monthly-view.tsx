"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarRange, IndianRupee, Scissors, Wallet } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatCard } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import type { BookingRow } from "@/lib/actions/admin";
import { computeMonthlyStats, monthsWithData } from "./staff-metrics";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
/** "2026-06" → "June 2026". Anchored at local midnight so the month never slips. */
const monthLabel = (m: string) => format(new Date(`${m}-01T00:00:00`), "MMMM yyyy");

/**
 * The artist's monthly sales: how many services they did, the total clients paid
 * (service + extras), and their 10% commission on that. A month picker lists every
 * month with completed work, newest first.
 */
export function StaffMonthlyView({
  rows,
  currentMonth,
}: {
  rows: BookingRow[];
  currentMonth: string;
}) {
  // Months with data, always offering the current month so a fresh month still renders.
  const months = useMemo(() => {
    const list = monthsWithData(rows);
    return list.includes(currentMonth) ? list : [currentMonth, ...list];
  }, [rows, currentMonth]);

  const [month, setMonth] = useState(currentMonth);
  const stats = useMemo(() => computeMonthlyStats(rows, month), [rows, month]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Your sales for the selected month</p>
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Appointments"
          value={stats.appointmentCount}
          icon={<Scissors className="h-5 w-5" />}
          accent="emerald"
          hint={`services done in ${monthLabel(month)}`}
        />
        <StatCard
          label="Total clients paid"
          value={inr(stats.totalPaid)}
          icon={<IndianRupee className="h-5 w-5" />}
          accent="primary"
          hint="service + extras"
        />
        <StatCard
          label="Your commission (10%)"
          value={inr(stats.commission)}
          icon={<Wallet className="h-5 w-5" />}
          accent="amber"
          hint="10% of total clients paid"
        />
      </div>

      {stats.appointmentCount === 0 && (
        <EmptyState
          icon={<CalendarRange className="h-6 w-6" />}
          title="No sales this month yet"
          description="Completed and payment-verified appointments in this month count toward your sales and commission."
        />
      )}
    </div>
  );
}
