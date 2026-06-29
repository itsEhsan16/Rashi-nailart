"use client";

import { Banknote, HelpCircle, Smartphone } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { RevenueBreakdown } from "@/lib/actions/admin";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/**
 * Drill-down for a total-revenue figure: the four sources (fees / services /
 * extras / memberships) plus how the in-store balance was settled (UPI · Cash ·
 * Unrecorded). Shared by the admin overview and the manager branch overview;
 * pass `showMemberships={false}` for a branch view (memberships are salon-wide).
 */
export function RevenueBreakdownDialog({
  open,
  onOpenChange,
  breakdown,
  title = "Revenue breakdown",
  showMemberships = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  breakdown: RevenueBreakdown | null;
  title?: string;
  showMemberships?: boolean;
}) {
  if (!breakdown) return null;

  const total =
    breakdown.bookingFees +
    breakdown.serviceCharges +
    breakdown.extras +
    (showMemberships ? breakdown.memberships : 0);
  const inStore = breakdown.serviceCharges + breakdown.extras;

  const rows = [
    { label: "Booking fees", value: breakdown.bookingFees, hint: "₹50 × verified bookings" },
    { label: "Service charges", value: breakdown.serviceCharges, hint: "completed services" },
    { label: "Extras", value: breakdown.extras, hint: "in-studio add-ons" },
    ...(showMemberships
      ? [{ label: "Memberships", value: breakdown.memberships, hint: "verified members" }]
      : []),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Where the {inr(total)} total comes from.</DialogDescription>
        </DialogHeader>

        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li
              key={r.label}
              className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm"
            >
              <span>
                {r.label}
                <span className="ml-1 text-xs text-muted-foreground">· {r.hint}</span>
              </span>
              <span className="font-medium tabular-nums">{inr(r.value)}</span>
            </li>
          ))}
          <li className="flex items-center justify-between border-t border-border/60 px-3 pt-2 text-sm font-semibold">
            <span>Total revenue</span>
            <span className="tabular-nums">{inr(total)}</span>
          </li>
        </ul>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            In-store settlement · {inr(inStore)}
          </p>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-md border border-sky-500/30 bg-sky-500/5 p-2">
              <Smartphone className="mx-auto h-4 w-4 text-sky-600" />
              <div className="mt-1 font-medium tabular-nums">{inr(breakdown.upi)}</div>
              <div className="text-xs text-muted-foreground">UPI</div>
            </div>
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
              <Banknote className="mx-auto h-4 w-4 text-amber-600" />
              <div className="mt-1 font-medium tabular-nums">{inr(breakdown.cash)}</div>
              <div className="text-xs text-muted-foreground">Cash</div>
            </div>
            <div className="rounded-md border border-border/60 p-2">
              <HelpCircle className="mx-auto h-4 w-4 text-muted-foreground" />
              <div className="mt-1 font-medium tabular-nums">{inr(breakdown.unrecorded)}</div>
              <div className="text-xs text-muted-foreground">Unrecorded</div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
