"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  addAppointmentExtra,
  deleteAppointmentExtra,
  listAppointmentExtras,
  type BookingRow,
  type ExtraRow,
} from "@/lib/actions/admin";

/**
 * Add/remove in-studio extra line items for a booking. Self-contained: owns its
 * own extras state and server calls. Open when `booking` is non-null. Shared by
 * the admin/manager bookings table and the staff task list.
 */
export function ExtrasDialog({
  booking,
  onOpenChange,
  onChanged,
}: {
  booking: BookingRow | null;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}) {
  const [extras, setExtras] = useState<ExtraRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const extrasSum = extras.reduce((s, e) => s + e.amount, 0);

  const load = useCallback(async (appointmentId: string) => {
    setLoading(true);
    const res = await listAppointmentExtras({ appointmentId });
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error ?? "Could not load extras");
      return;
    }
    setExtras(res.extras);
  }, []);

  useEffect(() => {
    if (!booking) return;
    setExtras([]);
    setLabel("");
    setAmount("");
    void load(booking.id);
  }, [booking, load]);

  async function onAdd() {
    if (!booking) return;
    const amt = Number(amount);
    if (!label.trim()) return toast.error("Describe the extra service");
    if (!Number.isFinite(amt) || amt < 0) return toast.error("Enter a valid amount");
    setSaving(true);
    const res = await addAppointmentExtra({
      appointmentId: booking.id,
      label: label.trim(),
      amount: Math.round(amt),
    });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    setLabel("");
    setAmount("");
    await load(booking.id);
    onChanged?.();
  }

  async function onDelete(id: string) {
    if (!booking) return;
    const res = await deleteAppointmentExtra({ id, appointmentId: booking.id });
    if (!res.ok) return toast.error(res.error);
    await load(booking.id);
    onChanged?.();
  }

  return (
    <Dialog open={!!booking} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Extra services — {booking?.client_name}</DialogTitle>
          <DialogDescription>
            Base: {booking?.service} · ₹{booking?.price}. Add anything extra done in-studio.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : extras.length === 0 ? (
            <p className="text-sm text-muted-foreground">No extras added yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {extras.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between rounded-md border border-border/60 px-3 py-1.5 text-sm"
                >
                  <span>{e.label}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-medium">₹{e.amount}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      title="Remove"
                      onClick={() => onDelete(e.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {extras.length > 0 && (
            <div className="flex items-center justify-between border-t border-border/60 pt-2 text-sm">
              <span className="text-muted-foreground">Total (base + extras)</span>
              <span className="font-semibold">₹{(booking?.price ?? 0) + extrasSum}</span>
            </div>
          )}

          <div className="flex items-end gap-2 border-t border-border/60 pt-3">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Extra service</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Nail art"
              />
            </div>
            <div className="w-24 space-y-1">
              <Label className="text-xs">₹ Amount</Label>
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="numeric"
                placeholder="0"
              />
            </div>
            <Button onClick={onAdd} disabled={saving} title="Add extra">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
