"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, X, Trash2, CheckCircle2, Ban, Download, Crown } from "lucide-react";
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
import { cn } from "@/lib/utils";
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

type StatusFilter = "all" | "pending" | "paid" | "cancelled" | "completed";

export function BookingsPanel({ role }: { role: UserRole }) {
  const canFilter = role !== "staff";
  const canManage = role !== "staff";
  const showBranchFilter = role === "admin";

  const [rows, setRows] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState<Date | undefined>();
  const [branch, setBranch] = useState<string>("");
  const [staff, setStaff] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

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

  function exportCsv() {
    downloadCsv(
      `bookings-${new Date().toISOString().slice(0, 10)}.csv`,
      rows.map((r) => ({
        client: r.client_name,
        phone: r.phone,
        branch: r.branch,
        date: r.appointment_date,
        time: r.time_slot,
        service: r.service,
        price: r.price,
        discount: r.discount_applied,
        staff: r.staff_name,
        member: r.is_member ? "yes" : "no",
        status: r.completed ? "completed" : r.payment_status,
        notes: r.special_requests ?? "",
      })),
    );
  }

  const colSpan = 10;

  return (
    <div className="space-y-4">
      {canFilter && (
        <Card className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
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
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Staff</Label>
              <Input className="w-36" value={staff} onChange={(e) => setStaff(e.target.value)} placeholder="Stylist" />
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

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Staff</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={colSpan} className="text-center py-10 text-muted-foreground">
                    No bookings found.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow
                  key={r.id}
                  className={cn(
                    r.is_member && "bg-primary/5",
                    r.payment_status === "pending" && "opacity-60",
                    r.completed && "bg-emerald-500/5",
                  )}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {r.client_name}
                      {r.is_member && (
                        <Badge className="bg-primary text-primary-foreground gap-1">
                          <Crown className="h-3 w-3" /> Member
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{r.phone}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{r.branch}</Badge>
                  </TableCell>
                  <TableCell>{format(new Date(r.appointment_date), "dd MMM yyyy")}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.time_slot}</TableCell>
                  <TableCell>
                    <div>{r.service}</div>
                    <div className="text-xs text-muted-foreground">
                      ₹{r.price}
                      {r.discount_applied > 0 && (
                        <span className="ml-1 text-primary">(−₹{r.discount_applied})</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{r.staff_name}</TableCell>
                  <TableCell>
                    {r.completed ? (
                      <Badge className="bg-emerald-600 text-white gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Completed
                      </Badge>
                    ) : r.payment_status === "paid" ? (
                      <Badge className="bg-emerald-600 text-white">Paid</Badge>
                    ) : r.payment_status === "cancelled" ? (
                      <Badge variant="destructive">Cancelled</Badge>
                    ) : (
                      <Badge variant="outline">Pending</Badge>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[200px] text-sm text-muted-foreground truncate">
                    {r.special_requests || "—"}
                  </TableCell>
                  <TableCell className="text-right space-x-1 whitespace-nowrap">
                    {!r.completed && r.payment_status !== "cancelled" && (
                      <Button size="sm" variant="outline" onClick={() => onComplete(r.id)}>
                        <CheckCircle2 className="h-4 w-4 mr-1" /> Done
                      </Button>
                    )}
                    {canManage && r.payment_status !== "cancelled" && !r.completed && (
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
                    {r.completed && <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
