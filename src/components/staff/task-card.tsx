"use client";

import { format } from "date-fns";
import {
  ArrowLeftRight,
  Banknote,
  CheckCircle2,
  Clock,
  MapPin,
  Receipt,
  Smartphone,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/dashboard/status-pill";
import { cn } from "@/lib/utils";
import { paymentModeLabel } from "@/lib/salon-data";
import type { BookingRow } from "@/lib/actions/admin";
import type { TaskState } from "./staff-metrics";

export function TaskCard({
  row,
  state,
  busy,
  onComplete,
  onOpenExtras,
}: {
  row: BookingRow;
  state: TaskState;
  busy: boolean;
  onComplete: (id: string) => void;
  onOpenExtras: (row: BookingRow) => void;
}) {
  const isNow = state === "now";
  const isDone = state === "completed";
  const total = row.price + row.extras_total;
  // reassigned AWAY = this stylist's customer was moved to another artist (read-only here).
  const reassignedAway = row.reassigned_away;
  // reassigned IN = a manager moved someone else's customer to this stylist.
  const reassignedIn = !reassignedAway && !!row.original_staff_name;

  return (
    <Card
      className={cn(
        "relative overflow-hidden p-3.5 pl-4 shadow-soft transition-shadow hover:shadow-elegant",
        isNow && !reassignedAway && "ring-1 ring-primary/40",
        // Done tasks live in their own Completed folder — shown clearly there, and locked from edits.
        isDone && "bg-emerald-500/5",
        reassignedAway && "opacity-70",
      )}
    >
      <span
        className={cn(
          "absolute inset-y-0 left-0 w-1",
          reassignedAway ? "bg-amber-500" : isNow ? "bg-primary" : isDone ? "bg-emerald-500" : "bg-border",
        )}
        aria-hidden
      />

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{row.client_name}</span>
            {isNow && !reassignedAway && (
              <Badge className="gap-1 bg-primary text-primary-foreground">
                <Clock className="h-3 w-3" /> Now
              </Badge>
            )}
          </div>
          <div className="truncate text-sm text-muted-foreground">{row.service}</div>
        </div>
        <StatusPill row={row} />
      </div>

      {(reassignedAway || reassignedIn) && (
        <div className="mt-2">
          <Badge
            variant="outline"
            className={cn(
              "gap-1",
              reassignedAway
                ? "border-amber-500/40 text-amber-600"
                : "border-sky-500/40 text-sky-600",
            )}
          >
            <ArrowLeftRight className="h-3 w-3" />
            {reassignedAway
              ? `Reassigned to ${row.staff_name}`
              : `Reassigned from ${row.original_staff_name}`}
          </Badge>
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
          <Clock className="h-3.5 w-3.5 text-primary" />
          {row.time_slot}
        </span>
        <span>{format(new Date(row.appointment_date), "EEE, dd MMM")}</span>
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" />
          {row.branch}
        </span>
        {row.payment_mode && (
          <Badge
            variant="outline"
            className={cn(
              "gap-1",
              row.payment_mode === "cash"
                ? "border-amber-500/40 text-amber-600"
                : "border-sky-500/40 text-sky-600",
            )}
          >
            {row.payment_mode === "cash" ? (
              <Banknote className="h-3 w-3" />
            ) : (
              <Smartphone className="h-3 w-3" />
            )}
            {paymentModeLabel(row.payment_mode)}
          </Badge>
        )}
        <span className="ml-auto font-semibold text-foreground">
          ₹{total.toLocaleString("en-IN")}
          {row.extras_total > 0 && (
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              (₹{row.price} + ₹{row.extras_total})
            </span>
          )}
        </span>
      </div>

      {/* Active work: add extras and mark done. Hidden once reassigned away — it's
          another artist's task now. */}
      {row.payment_status === "verified" && !row.completed && !reassignedAway && (
        <div className="mt-2.5 flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-2.5">
          <Button size="sm" variant="outline" onClick={() => onOpenExtras(row)}>
            <Receipt className="mr-1 h-4 w-4" /> Extras
          </Button>
          <Button size="sm" disabled={busy} onClick={() => onComplete(row.id)}>
            {busy ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-1 h-4 w-4" />
            )}
            Done
          </Button>
        </div>
      )}

      {/* Done: still let staff review extras and record how the customer paid. */}
      {row.completed && !reassignedAway && (
        <div className="mt-2.5 flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-2.5">
          <Button
            size="sm"
            variant={row.payment_mode ? "outline" : "default"}
            onClick={() => onOpenExtras(row)}
          >
            <Receipt className="mr-1 h-4 w-4" />
            {row.payment_mode ? "Receipt" : "Add payment"}
          </Button>
        </div>
      )}
    </Card>
  );
}
