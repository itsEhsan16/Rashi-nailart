"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  CalendarIcon,
  X,
  Trash2,
  CheckCircle2,
  Ban,
  Download,
  Crown,
  Receipt,
  CalendarX2,
  UserCog,
  Scissors,
  CalendarOff,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusPill } from "@/components/dashboard/status-pill";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ExtrasDialog } from "@/components/dashboard/extras-dialog";
import { ReassignDialog } from "@/components/dashboard/reassign-dialog";
import { ChangeServiceDialog } from "@/components/dashboard/change-service-dialog";
import { TableSkeleton } from "@/components/dashboard/skeletons";
import { cn, formatLocalDate } from "@/lib/utils";
import { sortBySchedule } from "@/lib/booking-sort";
import { downloadCsv } from "@/lib/export-csv";
import { BRANCHES } from "@/lib/salon-data";
import type { UserRole } from "@/lib/auth";
import {
  listBookings,
  completeBooking,
  cancelBooking,
  deleteBooking,
  type BookingRow,
} from "@/lib/actions/admin";

type StatusFilter =
  | "all"
  | "pending_payment"
  | "verified"
  | "rejected"
  | "cancelled"
  | "completed";

/** Service + price/discount/extras summary, shared by the table cell and mobile card. */
function ServiceSummary({ r }: { r: BookingRow }) {
  return (
    <>
      <div>{r.service}</div>
      <div className="text-xs text-muted-foreground">
        ₹{r.price}
        {r.discount_applied > 0 && <span className="ml-1 text-primary">(−₹{r.discount_applied})</span>}
        {r.extras_total > 0 && (
          <>
            <span className="ml-1">+ ₹{r.extras_total} extras</span>
            <span className="ml-1 font-medium text-foreground">= ₹{r.price + r.extras_total}</span>
          </>
        )}
      </div>
    </>
  );
}

/** Current artist, with a note when a manager reassigned the booking from another, or
 *  when that artist has this date blocked as a day off. */
function StaffCell({ r }: { r: BookingRow }) {
  return (
    <>
      {r.staff_name}
      {r.original_staff_name && (
        <span className="mt-0.5 block text-[11px] text-amber-600">
          reassigned from {r.original_staff_name}
        </span>
      )}
      {r.artist_on_leave && (
        <span className="mt-0.5 block text-[11px] font-medium text-amber-600 dark:text-amber-400">
          <CalendarOff className="mr-1 inline h-3 w-3 align-[-2px]" />
          {r.completed ? "was on leave this day" : "on leave this day"}
        </span>
      )}
    </>
  );
}

export function BookingsPanel({ role }: { role: UserRole }) {
  const canFilter = role !== "staff";
  const canManage = role !== "staff";
  const showBranchFilter = role === "admin";
  const showPhone = role !== "staff";

  const [rows, setRows] = useState<BookingRow[]>([]);
  const [view, setView] = useState<"active" | "completed">("active");
  // Narrow the list to the on-leave clashes (toggled from the banner).
  const [onlyLeave, setOnlyLeave] = useState(false);
  const todayIso = formatLocalDate(new Date());
  // Upcoming bookings still with an artist who has blocked that date. Blocking a day
  // never cancels what was already booked on it, so each of these needs a person to
  // reassign or cancel it before the customer turns up.
  const leaveClashes = useMemo(
    () => rows.filter((r) => r.artist_on_leave && !r.completed && r.appointment_date >= todayIso),
    [rows, todayIso],
  );
  const clashIds = useMemo(() => new Set(leaveClashes.map((r) => r.id)), [leaveClashes]);
  // Completed bookings live only in the Completed tab — excluded from every other view.
  const displayRows = useMemo(() => {
    const sorted = sortBySchedule(rows, Date.now());
    if (onlyLeave) return sorted.filter((r) => clashIds.has(r.id));
    return view === "completed" ? sorted : sorted.filter((r) => !r.completed);
  }, [rows, view, onlyLeave, clashIds]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState<Date | undefined>();
  const [branch, setBranch] = useState<string>("");
  const [staff, setStaff] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const [extrasFor, setExtrasFor] = useState<BookingRow | null>(null);
  const [reassignFor, setReassignFor] = useState<BookingRow | null>(null);
  const [changeServiceFor, setChangeServiceFor] = useState<BookingRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listBookings({
      date: date ? format(date, "yyyy-MM-dd") : undefined,
      branch: showBranchFilter && branch ? (branch as (typeof BRANCHES)[number]) : undefined,
      staff: staff || undefined,
      status: view === "completed" ? "completed" : status === "all" ? undefined : status,
    });
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setRows(res.bookings);
  }, [date, branch, staff, status, showBranchFilter, view]);

  useEffect(() => {
    void load();
  }, [load]);

  // Once the last clash is reassigned the filter would show an empty list — drop it.
  useEffect(() => {
    if (onlyLeave && leaveClashes.length === 0) setOnlyLeave(false);
  }, [onlyLeave, leaveClashes.length]);

  async function onComplete(id: string) {
    const res = await completeBooking({ id });
    if (!res.ok) return toast.error(res.error);
    toast.success("Marked complete");
    void load();
  }
  async function onCancel(id: string) {
    if (!confirm("Cancel this booking? The slot will be freed.")) return;
    const res = await cancelBooking({ id });
    if (!res.ok) return toast.error(res.error);
    toast.success("Booking cancelled");
    void load();
  }
  async function onDelete(id: string, name: string) {
    if (!confirm(`Delete the booking for ${name}? This cannot be undone.`)) return;
    const res = await deleteBooking({ id });
    if (!res.ok) return toast.error(res.error);
    toast.success("Booking deleted");
    void load();
  }

  function exportCsv() {
    downloadCsv(
      `${view === "completed" ? "completed" : "bookings"}-${new Date().toISOString().slice(0, 10)}.csv`,
      displayRows.map((r) => ({
        client: r.client_name,
        phone: r.phone,
        branch: r.branch,
        date: r.appointment_date,
        time: r.time_slot,
        service: r.service,
        price: r.price,
        discount: r.discount_applied,
        extras: r.extras_total,
        extras_detail: r.extras_detail,
        total: r.price + r.extras_total,
        staff: r.staff_name,
        reassigned_from: r.original_staff_name ?? "",
        // Commission follows staff_name, so a completed booking on a leave day is
        // worth checking: whoever actually did it may not be who it's credited to.
        artist_on_leave: r.artist_on_leave ? "yes" : "",
        member: r.is_member ? "yes" : "no",
        status: r.completed ? "completed" : r.payment_status,
        notes: r.special_requests ?? "",
      })),
    );
  }

  /** Action buttons, shared between the desktop table and mobile cards. */
  function RowActions({ r }: { r: BookingRow }) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-1">
        {/* Extras/payment stay editable even after completion so a manager can log
            work a busy artist forgot. */}
        {r.payment_status === "verified" && (
          <Button size="sm" variant="outline" onClick={() => setExtrasFor(r)}>
            <Receipt className="mr-1 h-4 w-4" /> Extras
          </Button>
        )}
        {!r.completed && r.payment_status === "verified" && (
          <Button size="sm" variant="outline" onClick={() => onComplete(r.id)}>
            <CheckCircle2 className="mr-1 h-4 w-4" /> Done
          </Button>
        )}
        {!r.completed && r.payment_status === "verified" && (
          <Button size="sm" variant="outline" onClick={() => setChangeServiceFor(r)}>
            <Scissors className="mr-1 h-4 w-4" /> Change service
          </Button>
        )}
        {canManage && !r.completed && r.payment_status === "verified" && (
          <Button size="sm" variant="outline" onClick={() => setReassignFor(r)}>
            <UserCog className="mr-1 h-4 w-4" /> Reassign
          </Button>
        )}
        {canManage && !r.completed && r.payment_status === "verified" && (
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            title="Cancel"
            onClick={() => onCancel(r.id)}
          >
            <Ban className="h-4 w-4" />
          </Button>
        )}
        {canManage && (
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-destructive hover:text-destructive"
            title="Delete"
            onClick={() => onDelete(r.id, r.client_name)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  }

  // Client+phone, date+time and branch+staff are paired into single cells; the
  // old Phone and Proof columns are gone (Cashfree auto-confirms — no manual proof).
  const colSpan = 7;

  return (
    <div className="space-y-6">
      <Tabs
        value={view}
        onValueChange={(v) => {
          setView(v as "active" | "completed");
          setOnlyLeave(false);
        }}
      >
        <TabsList>
          <TabsTrigger value="active">Bookings</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>
      </Tabs>

      {canFilter && (
        <Card className="p-4 shadow-soft">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-40 justify-start text-left font-normal", !date && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "PP") : "Any date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={date} onSelect={setDate} autoFocus />
                </PopoverContent>
              </Popover>
            </div>
            {showBranchFilter && (
              <div className="space-y-1.5">
                <Label className="text-xs">Branch</Label>
                <Select value={branch || "all"} onValueChange={(v) => setBranch(v === "all" ? "" : v)}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="All branches" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All branches</SelectItem>
                    {BRANCHES.map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {view === "active" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="verified">Confirmed</SelectItem>
                    <SelectItem value="pending_payment">Awaiting payment</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Staff</Label>
              <Input className="w-36" value={staff} onChange={(e) => setStaff(e.target.value)} placeholder="Artist" />
            </div>
            {(date || branch || staff || status !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDate(undefined);
                  setBranch("");
                  setStaff("");
                  setStatus("all");
                }}
              >
                <X className="mr-1 h-4 w-4" /> Clear
              </Button>
            )}
            <div className="ml-auto flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {loading
                  ? "Loading…"
                  : `${displayRows.length} booking${displayRows.length === 1 ? "" : "s"}`}
              </span>
              {canManage && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportCsv}
                  disabled={displayRows.length === 0}
                >
                  <Download className="mr-1 h-4 w-4" /> CSV
                </Button>
              )}
            </div>
          </div>
        </Card>
      )}

      {canManage && view === "active" && leaveClashes.length > 0 && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <p className="min-w-0 flex-1">
            <span className="font-semibold">
              {leaveClashes.length} upcoming booking{leaveClashes.length === 1 ? "" : "s"}
            </span>{" "}
            {leaveClashes.length === 1 ? "is" : "are"} with an artist on leave that day —
            reassign or cancel {leaveClashes.length === 1 ? "it" : "them"}.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="border-amber-500/50 bg-transparent"
            onClick={() => setOnlyLeave((v) => !v)}
          >
            {onlyLeave ? "Show all bookings" : "Show only these"}
          </Button>
        </div>
      )}

      {/* Desktop table */}
      {loading ? (
        <TableSkeleton columns={colSpan} />
      ) : (
      <>
      <Card className="hidden shadow-soft md:block">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="sticky top-0 z-10 border-b border-border bg-muted/40 backdrop-blur hover:bg-muted/40 [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide">
                <TableHead>Client details</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Branch &amp; staff</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayRows.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={colSpan} className="p-0">
                    <EmptyState
                      icon={<CalendarX2 className="h-6 w-6" />}
                      title={view === "completed" ? "No completed bookings yet" : "No bookings found"}
                      description={
                        view === "completed"
                          ? "Bookings marked done will appear here."
                          : "Try adjusting your filters."
                      }
                    />
                  </TableCell>
                </TableRow>
              )}
              {displayRows.map((r) => (
                <TableRow
                  key={r.id}
                  className={cn(
                    r.is_member && "bg-primary/5",
                    r.payment_status === "pending_payment" && "opacity-60",
                    (r.payment_status === "rejected" || r.payment_status === "cancelled") && "opacity-50",
                    r.completed && "bg-emerald-500/5",
                    // Last, so it wins over the member tint: this row needs action.
                    clashIds.has(r.id) && "bg-amber-500/10",
                  )}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {r.client_name}
                      {r.is_member && (
                        <Badge className="gap-1 bg-primary text-primary-foreground">
                          <Crown className="h-3 w-3" /> Member
                        </Badge>
                      )}
                    </div>
                    {showPhone && r.phone && (
                      <div className="text-xs text-muted-foreground">{r.phone}</div>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div>{format(new Date(r.appointment_date), "dd MMM yyyy")}</div>
                    <div className="text-xs text-muted-foreground">{r.time_slot}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{r.branch}</Badge>
                    <div className="mt-1 text-xs text-muted-foreground">
                      <StaffCell r={r} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <ServiceSummary r={r} />
                  </TableCell>
                  <TableCell>
                    <StatusPill row={r} />
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                    {r.rejection_reason ? (
                      <span className="text-destructive">{r.rejection_reason}</span>
                    ) : (
                      r.special_requests || "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <RowActions r={r} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {displayRows.length === 0 && !loading && (
          <Card className="shadow-soft">
            <EmptyState
              icon={<CalendarX2 className="h-6 w-6" />}
              title={view === "completed" ? "No completed bookings yet" : "No bookings found"}
              description={
                view === "completed"
                  ? "Bookings marked done will appear here."
                  : "Try adjusting your filters."
              }
            />
          </Card>
        )}
        {displayRows.map((r) => (
          <Card
            key={r.id}
            className={cn(
              "p-4 shadow-soft",
              r.is_member && "border-primary/30 bg-primary/5",
              r.completed && "bg-emerald-500/5",
              (r.payment_status === "rejected" || r.payment_status === "cancelled") && "opacity-60",
              clashIds.has(r.id) && "border-amber-500/40 bg-amber-500/5",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-medium">
                  <span className="truncate">{r.client_name}</span>
                  {r.is_member && (
                    <Badge className="gap-1 bg-primary text-primary-foreground">
                      <Crown className="h-3 w-3" /> Member
                    </Badge>
                  )}
                </div>
                {showPhone && r.phone && (
                  <div className="text-xs text-muted-foreground">{r.phone}</div>
                )}
              </div>
              <StatusPill row={r} />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
              <div className="text-muted-foreground">Branch</div>
              <div className="text-right">
                <Badge variant="secondary">{r.branch}</Badge>
              </div>
              <div className="text-muted-foreground">When</div>
              <div className="text-right">
                {format(new Date(r.appointment_date), "dd MMM")} · {r.time_slot}
              </div>
              <div className="text-muted-foreground">Artist</div>
              <div className="text-right">
                <StaffCell r={r} />
              </div>
            </div>

            <div className="mt-3 border-t border-border/60 pt-3">
              <ServiceSummary r={r} />
            </div>

            {(r.rejection_reason || r.special_requests) && (
              <p className={cn("mt-2 text-xs", r.rejection_reason ? "text-destructive" : "text-muted-foreground")}>
                {r.rejection_reason || r.special_requests}
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-3">
              <RowActions r={r} />
            </div>
          </Card>
        ))}
      </div>
      </>
      )}

      <ExtrasDialog
        booking={extrasFor}
        onOpenChange={(o) => !o && setExtrasFor(null)}
        onChanged={load}
      />

      <ReassignDialog
        booking={reassignFor}
        onOpenChange={(o) => !o && setReassignFor(null)}
        onChanged={load}
      />

      <ChangeServiceDialog
        booking={changeServiceFor}
        onOpenChange={(o) => !o && setChangeServiceFor(null)}
        onChanged={load}
      />
    </div>
  );
}
