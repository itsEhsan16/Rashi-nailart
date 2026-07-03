"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, Mail, Store, Upload } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { StaffAvatar } from "@/components/staff-avatar";
import { StaffStatsRow } from "@/components/staff/staff-stats";
import { StaffMonthlyView } from "@/components/staff/staff-monthly-view";
import { StaffSalarySection } from "@/components/admin/staff-salary-section";
import { computeStaffStats } from "@/components/staff/staff-metrics";
import { formatLocalDate, slotStartLabel, slotStartMinutes } from "@/lib/utils";
import { paymentModeLabel } from "@/lib/salon-data";
import type { UserRole } from "@/lib/auth";
import {
  getStaffDetail,
  uploadStaffPhoto,
  type StaffRow,
  type StaffDetailData,
} from "@/lib/actions/admin";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * The admin/manager employee page: a stylist's photo (with upload), lifetime
 * earnings, this-month's 10% commission, weekly schedule, linked login, and their
 * completed-work history. Reuses the staff-portal stats/monthly components so the
 * numbers reconcile with what the stylist sees in their own dashboard.
 */
export function StaffDetail({
  staff,
  role,
  canEdit,
  onBack,
  onPhotoChanged,
}: {
  staff: StaffRow;
  role: UserRole;
  canEdit: boolean;
  onBack: () => void;
  onPhotoChanged: () => void;
}) {
  const [detail, setDetail] = useState<StaffDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [photoUrl, setPhotoUrl] = useState<string | null>(staff.photo_url);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const now = useMemo(() => Date.now(), []);
  const currentMonth = useMemo(() => formatLocalDate(new Date(now)).slice(0, 7), [now]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getStaffDetail({ staffId: staff.id });
    setLoading(false);
    if (!res.ok || !res.detail) {
      toast.error(res.ok ? "Artist not found" : res.error);
      return;
    }
    setDetail(res.detail);
    setPhotoUrl(res.detail.staff.photo_url);
  }, [staff.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const data = new FormData();
    data.append("staffId", staff.id);
    data.append("file", file);
    setUploading(true);
    const res = await uploadStaffPhoto(data);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    if (!res.ok || !res.url) return toast.error(res.ok ? "Upload failed" : res.error);
    setPhotoUrl(res.url);
    toast.success("Photo updated");
    onPhotoChanged();
  }

  const bookings = useMemo(() => detail?.bookings ?? [], [detail]);
  const stats = useMemo(() => computeStaffStats(bookings, now), [bookings, now]);
  const completed = useMemo(
    () => bookings.filter((b) => b.completed && b.payment_status === "verified"),
    [bookings],
  );
  const scheduleByDay = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const e of detail?.schedule ?? []) {
      const list = map.get(e.day_of_week);
      if (list) list.push(e.time_slot);
      else map.set(e.day_of_week, [e.time_slot]);
    }
    for (const list of map.values()) list.sort((a, b) => slotStartMinutes(a) - slotStartMinutes(b));
    return map;
  }, [detail]);

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="-ml-2 w-fit" onClick={onBack}>
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to team
      </Button>

      {/* Profile header */}
      <Card className="rounded-xl p-5 shadow-soft">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex flex-col items-center gap-2">
            <StaffAvatar name={staff.name} photoUrl={photoUrl} className="h-24 w-24" />
            {canEdit && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-1 h-4 w-4" />
                  )}
                  {photoUrl ? "Change photo" : "Add photo"}
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/heic"
                  className="hidden"
                  onChange={onPickPhoto}
                />
              </>
            )}
          </div>
          <div className="min-w-0 space-y-1.5">
            <h2 className="font-display text-2xl font-semibold">{staff.name}</h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
              <Badge variant="secondary">{staff.branch}</Badge>
              {staff.store_number && (
                <span className="inline-flex items-center gap-1">
                  <Store className="h-3.5 w-3.5" /> Studio {staff.store_number}
                </span>
              )}
              {detail?.login && (
                <>
                  <span className="inline-flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" /> {detail.login.email}
                  </span>
                  <Badge variant="outline" className="capitalize">
                    {detail.login.role}
                  </Badge>
                </>
              )}
              {detail?.staff.created_at && (
                <span>Joined {format(new Date(detail.staff.created_at), "dd MMM yyyy")}</span>
              )}
            </div>
            {!loading && !detail?.login && (
              <p className="text-xs text-muted-foreground">
                No login linked yet — create one under “Team logins”.
              </p>
            )}
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Earnings</h3>
            <StaffStatsRow stats={stats} />
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Monthly sales &amp; commission</h3>
            <StaffMonthlyView rows={bookings} currentMonth={currentMonth} />
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Salary</h3>
            <StaffSalarySection
              staffId={staff.id}
              currentMonth={currentMonth}
              canEditPay={role === "admin"}
              canEditAbsence={role === "admin" || role === "manager"}
            />
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Weekly schedule</h3>
            <Card className="rounded-xl p-4 shadow-soft">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {DAY_NAMES.map((d, i) => {
                  const slots = scheduleByDay.get(i) ?? [];
                  return (
                    <div key={d} className="rounded-lg border border-border/60 px-3 py-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {d}
                      </div>
                      {slots.length ? (
                        <div className="mt-1 text-sm">
                          {slots.map((s) => slotStartLabel(s)).join(", ")}
                        </div>
                      ) : (
                        <div className="mt-1 text-sm text-muted-foreground">Day off</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Completed work ({completed.length})</h3>
            <Card className="rounded-xl shadow-soft">
              {completed.length === 0 ? (
                <EmptyState
                  icon={<CheckCircle2 className="h-6 w-6" />}
                  title="No completed work yet"
                  description="Verified, completed bookings show up here."
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Service</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="text-right">Extras</TableHead>
                        <TableHead className="text-right">Paid</TableHead>
                        <TableHead>Mode</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {completed.map((b) => (
                        <TableRow key={b.id}>
                          <TableCell className="whitespace-nowrap">
                            {format(new Date(b.appointment_date), "dd MMM yy")}
                          </TableCell>
                          <TableCell className="font-medium">{b.client_name}</TableCell>
                          <TableCell className="text-muted-foreground">{b.service}</TableCell>
                          <TableCell className="text-right tabular-nums">{inr(b.price)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {b.extras_total ? inr(b.extras_total) : "—"}
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">
                            {inr(b.price + b.extras_total + b.amount)}
                          </TableCell>
                          <TableCell>{b.payment_mode ? paymentModeLabel(b.payment_mode) : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
