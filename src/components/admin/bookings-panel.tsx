"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { format } from "date-fns";
import {
  CalendarIcon,
  X,
  Trash2,
  CheckCircle2,
  Ban,
  Download,
  Crown,
  ImageIcon,
  Loader2,
  Receipt,
  CalendarX2,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusPill } from "@/components/dashboard/status-pill";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ExtrasDialog } from "@/components/dashboard/extras-dialog";
import { cn } from "@/lib/utils";
import { sortBySchedule } from "@/lib/booking-sort";
import { downloadCsv } from "@/lib/export-csv";
import { BRANCHES } from "@/lib/salon-data";
import type { UserRole } from "@/lib/auth";
import {
  listBookings,
  completeBooking,
  cancelBooking,
  deleteBooking,
  getProofUrl,
  type BookingRow,
} from "@/lib/actions/admin";

type StatusFilter =
  | "all"
  | "pending_payment"
  | "payment_uploaded"
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

export function BookingsPanel({ role }: { role: UserRole }) {
  const canFilter = role !== "staff";
  const canManage = role !== "staff";
  const showBranchFilter = role === "admin";
  const showPhone = role !== "staff";

  const [rows, setRows] = useState<BookingRow[]>([]);
  const sortedRows = useMemo(() => sortBySchedule(rows, Date.now()), [rows]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState<Date | undefined>();
  const [branch, setBranch] = useState<string>("");
  const [staff, setStaff] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofFor, setProofFor] = useState<BookingRow | null>(null);
  const [proofLoading, setProofLoading] = useState(false);

  const [extrasFor, setExtrasFor] = useState<BookingRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listBookings({
      date: date ? format(date, "yyyy-MM-dd") : undefined,
      branch: showBranchFilter && branch ? (branch as (typeof BRANCHES)[number]) : undefined,
      staff: staff || undefined,
      status: status === "all" ? undefined : status,
    });
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setRows(res.bookings);
  }, [date, branch, staff, status, showBranchFilter]);

  useEffect(() => {
    void load();
  }, [load]);

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
  async function viewProof(row: BookingRow) {
    setProofFor(row);
    setProofUrl(null);
    setProofLoading(true);
    const res = await getProofUrl({ kind: "booking", id: row.id });
    setProofLoading(false);
    if (!res.ok) {
      toast.error(res.error ?? "Could not open screenshot");
      setProofFor(null);
      return;
    }
    setProofUrl(res.url);
  }

  function exportCsv() {
    downloadCsv(
      `bookings-${new Date().toISOString().slice(0, 10)}.csv`,
      sortedRows.map((r) => ({
        client: r.client_name,
        phone: r.phone,
        branch: r.branch,
        date: r.appointment_date,
        time: r.time_slot,
        service: r.service,
        price: r.price,
        discount: r.discount_applied,
        extras: r.extras_total,
        total: r.price + r.extras_total,
        staff: r.staff_name,
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
        {r.payment_status === "verified" && !r.completed && (
          <Button size="sm" variant="outline" onClick={() => setExtrasFor(r)}>
            <Receipt className="mr-1 h-4 w-4" /> Extras
          </Button>
        )}
        {!r.completed && r.payment_status === "verified" && (
          <Button size="sm" variant="outline" onClick={() => onComplete(r.id)}>
            <CheckCircle2 className="mr-1 h-4 w-4" /> Done
          </Button>
        )}
        {canManage &&
          !r.completed &&
          (r.payment_status === "verified" || r.payment_status === "payment_uploaded") && (
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

  function ProofButton({ r }: { r: BookingRow }) {
    return r.upi_screenshot_url ? (
      <Button size="sm" variant="outline" onClick={() => viewProof(r)}>
        <ImageIcon className="mr-1 h-4 w-4" /> View
      </Button>
    ) : (
      <span className="text-xs text-muted-foreground">—</span>
    );
  }

  const colSpan = showPhone ? 11 : 10;

  return (
    <div className="space-y-6">
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
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="payment_uploaded">Awaiting verification</SelectItem>
                  <SelectItem value="verified">Confirmed</SelectItem>
                  <SelectItem value="pending_payment">Awaiting payment</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
                {loading ? "Loading…" : `${rows.length} booking${rows.length === 1 ? "" : "s"}`}
              </span>
              {canManage && (
                <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
                  <Download className="mr-1 h-4 w-4" /> CSV
                </Button>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Desktop table */}
      <Card className="hidden shadow-soft md:block">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="sticky top-0 z-10 border-b border-border bg-muted/40 backdrop-blur hover:bg-muted/40 [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide">
                <TableHead>Client</TableHead>
                {showPhone && <TableHead>Phone</TableHead>}
                <TableHead>Branch</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Staff</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Proof</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={colSpan} className="p-0">
                    <EmptyState icon={<CalendarX2 className="h-6 w-6" />} title="No bookings found" description="Try adjusting your filters." />
                  </TableCell>
                </TableRow>
              )}
              {sortedRows.map((r) => (
                <TableRow
                  key={r.id}
                  className={cn(
                    r.is_member && "bg-primary/5",
                    r.payment_status === "pending_payment" && "opacity-60",
                    (r.payment_status === "rejected" || r.payment_status === "cancelled") && "opacity-50",
                    // Done bookings are blurred + dimmed; the actions cell (last) stays crisp.
                    r.completed &&
                      "bg-emerald-500/5 [&>td:not(:last-child)]:opacity-60 [&>td:not(:last-child)]:blur-[1.5px]",
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
                  </TableCell>
                  {showPhone && <TableCell>{r.phone}</TableCell>}
                  <TableCell>
                    <Badge variant="secondary">{r.branch}</Badge>
                  </TableCell>
                  <TableCell>{format(new Date(r.appointment_date), "dd MMM yyyy")}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.time_slot}</TableCell>
                  <TableCell>
                    <ServiceSummary r={r} />
                  </TableCell>
                  <TableCell>{r.staff_name}</TableCell>
                  <TableCell>
                    <StatusPill row={r} />
                  </TableCell>
                  <TableCell>
                    <ProofButton r={r} />
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
        {rows.length === 0 && !loading && (
          <Card className="shadow-soft">
            <EmptyState icon={<CalendarX2 className="h-6 w-6" />} title="No bookings found" description="Try adjusting your filters." />
          </Card>
        )}
        {sortedRows.map((r) => (
          <Card
            key={r.id}
            className={cn(
              "p-4 shadow-soft",
              r.is_member && "border-primary/30 bg-primary/5",
              // Done bookings are blurred + dimmed; the footer actions (last child) stay crisp.
              r.completed &&
                "bg-emerald-500/5 [&>*:not(:last-child)]:opacity-60 [&>*:not(:last-child)]:blur-[1.5px]",
              (r.payment_status === "rejected" || r.payment_status === "cancelled") && "opacity-60",
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
              <div className="text-right">{r.staff_name}</div>
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
              <ProofButton r={r} />
              <RowActions r={r} />
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={!!proofFor} onOpenChange={(o) => !o && setProofFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Payment proof — {proofFor?.client_name}</DialogTitle>
            <DialogDescription>
              ₹{proofFor?.amount}
              {showPhone && proofFor?.phone ? ` · ${proofFor.phone}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-h-[200px] place-items-center">
            {proofLoading ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : proofUrl ? (
              <a href={proofUrl} target="_blank" rel="noopener noreferrer">
                <Image
                  src={proofUrl}
                  alt="Payment screenshot"
                  width={400}
                  height={600}
                  className="max-h-[60vh] w-auto rounded-md border border-border/60"
                  unoptimized
                />
              </a>
            ) : (
              <p className="text-sm text-muted-foreground">No screenshot.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ExtrasDialog
        booking={extrasFor}
        onOpenChange={(o) => !o && setExtrasFor(null)}
        onChanged={load}
      />
    </div>
  );
}
