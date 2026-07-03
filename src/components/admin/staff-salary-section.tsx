"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { recentMonths } from "@/lib/utils";
import { getStaffSalary, setStaffSalaryPay, setStaffAbsentDays } from "@/lib/actions/admin";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const monthLabel = (m: string) => format(new Date(`${m}-01T00:00:00`), "MMMM yyyy");

/**
 * Admin/manager payroll editor for one stylist, on the employee page. Admin sets
 * the monthly salary + per-absent-day deduction; admin AND manager set the number
 * of absent days. Net pay = max(0, salary − absent×rate) updates live. Salary/rate
 * carry forward from the latest earlier month so only absences change month to month.
 */
export function StaffSalarySection({
  staffId,
  currentMonth,
  canEditPay,
  canEditAbsence,
}: {
  staffId: string;
  currentMonth: string;
  canEditPay: boolean;
  canEditAbsence: boolean;
}) {
  const months = useMemo(() => recentMonths(currentMonth, 12), [currentMonth]);
  const [month, setMonth] = useState(currentMonth);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [base, setBase] = useState("0");
  const [perDay, setPerDay] = useState("0");
  const [absent, setAbsent] = useState("0");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getStaffSalary({ staffId, month });
    setLoading(false);
    if (!res.ok || !res.salary) {
      if (!res.ok) toast.error(res.error);
      setBase("0");
      setPerDay("0");
      setAbsent("0");
      return;
    }
    setBase(String(res.salary.base_salary));
    setPerDay(String(res.salary.per_day_deduction));
    setAbsent(String(res.salary.absent_days));
  }, [staffId, month]);

  useEffect(() => {
    void load();
  }, [load]);

  const baseN = Math.max(0, Math.round(Number(base) || 0));
  const perDayN = Math.max(0, Math.round(Number(perDay) || 0));
  const absentN = Math.max(0, Math.round(Number(absent) || 0));
  const deduction = absentN * perDayN;
  const net = Math.max(0, baseN - deduction);

  async function onSave() {
    setSaving(true);
    // Admin saves pay first (manager can't); everyone with absence rights saves absences.
    if (canEditPay) {
      const pay = await setStaffSalaryPay({
        staffId,
        month,
        base_salary: baseN,
        per_day_deduction: perDayN,
      });
      if (!pay.ok) {
        setSaving(false);
        return toast.error(pay.error);
      }
    }
    if (canEditAbsence) {
      const abs = await setStaffAbsentDays({ staffId, month, absent_days: absentN });
      if (!abs.ok) {
        setSaving(false);
        return toast.error(abs.error);
      }
    }
    setSaving(false);
    toast.success("Salary saved");
    void load();
  }

  return (
    <Card className="rounded-xl p-4 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Wallet className="h-4 w-4 text-primary" /> Payroll
        </div>
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
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Monthly salary (₹)</Label>
              <Input
                value={base}
                onChange={(e) => setBase(e.target.value)}
                inputMode="numeric"
                disabled={!canEditPay}
                placeholder="0"
              />
              {!canEditPay && (
                <p className="text-[11px] text-muted-foreground">Only an admin can edit salary.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Deduction / absent day (₹)</Label>
              <Input
                value={perDay}
                onChange={(e) => setPerDay(e.target.value)}
                inputMode="numeric"
                disabled={!canEditPay}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Days absent</Label>
              <Input
                value={absent}
                onChange={(e) => setAbsent(e.target.value)}
                inputMode="numeric"
                disabled={!canEditAbsence}
                placeholder="0"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
            <div className="text-sm text-muted-foreground">
              {inr(baseN)}
              {deduction > 0 && (
                <span className="text-destructive"> − {inr(deduction)} ({absentN}×{inr(perDayN)})</span>
              )}{" "}
              = <span className="font-semibold text-foreground">Net {inr(net)}</span>
            </div>
            {(canEditPay || canEditAbsence) && (
              <Button onClick={onSave} disabled={saving} size="sm">
                {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                Save
              </Button>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
