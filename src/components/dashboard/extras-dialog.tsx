"use client";

import { useCallback, useEffect, useState } from "react";
import { Banknote, Loader2, Minus, Plus, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  listActiveAddons,
  listAppointmentExtras,
  setBookingPaymentMode,
  type AddonRow,
  type BookingRow,
  type ExtraRow,
} from "@/lib/actions/admin";
import { PAYMENT_MODE_VALUES, PAYMENT_MODE_LABELS, type PaymentMode } from "@/lib/salon-data";

/** Sentinel for the free-text option in the add-on picker (Select can't hold ""). */
const CUSTOM = "__custom__";

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
  const [addons, setAddons] = useState<AddonRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<string>(CUSTOM); // addon id, or CUSTOM
  const [label, setLabel] = useState("");
  const [rate, setRate] = useState("");
  const [qty, setQty] = useState(1);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<PaymentMode | "upi" | null>(null);
  const [savingMode, setSavingMode] = useState(false);
  const extrasSum = extras.reduce((s, e) => s + e.amount, 0);

  const addon = addons.find((a) => a.id === picked) ?? null;
  // Every extra can carry a count; only a catalog add-on marked as a flat charge
  // opts out. Custom lines default to 1, so the old free-text flow is unchanged.
  const perUnit = addon ? addon.per_unit : true;
  const unitLabel = addon?.unit_label ?? "unit";
  const rateNum = Number(rate);
  const lineTotal = Number.isFinite(rateNum) && rateNum >= 0 ? Math.round(rateNum) * qty : 0;

  function resetForm() {
    setPicked(CUSTOM);
    setLabel("");
    setRate("");
    setQty(1);
  }

  /** Picking a catalog add-on prefills its rate; "Custom…" clears back to free text. */
  function onPick(next: string) {
    setPicked(next);
    setQty(1);
    const a = addons.find((x) => x.id === next);
    setRate(a ? String(a.rate) : "");
    setLabel("");
  }

  const load = useCallback(async (appointmentId: string) => {
    setLoading(true);
    const [res, addonRes] = await Promise.all([
      listAppointmentExtras({ appointmentId }),
      listActiveAddons(),
    ]);
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error ?? "Could not load extras");
      return;
    }
    setExtras(res.extras);
    if (addonRes.ok) setAddons(addonRes.addons);
  }, []);

  useEffect(() => {
    if (!booking) return;
    setExtras([]);
    resetForm();
    setMode(booking.payment_mode);
    void load(booking.id);
  }, [booking, load]);

  async function onSetMode(next: PaymentMode | null) {
    if (!booking) return;
    const prev = mode;
    setMode(next); // optimistic
    setSavingMode(true);
    const res = await setBookingPaymentMode({ id: booking.id, mode: next });
    setSavingMode(false);
    if (!res.ok) {
      setMode(prev);
      return toast.error(res.error);
    }
    onChanged?.();
  }

  async function onAdd() {
    if (!booking) return;
    if (!addon && !label.trim()) return toast.error("Describe the extra service");
    if (!Number.isFinite(rateNum) || rateNum < 0) return toast.error("Enter a valid rate");
    setSaving(true);
    const res = await addAppointmentExtra({
      appointmentId: booking.id,
      // The server re-resolves label/unit from the add-on; this is only used for custom lines.
      label: addon ? addon.name : label.trim(),
      unitAmount: Math.round(rateNum),
      quantity: perUnit ? qty : 1,
      addonId: addon ? addon.id : undefined,
      // Custom lines have no catalog unit; only send one when a count is meaningful.
      unitLabel: !addon && qty > 1 ? "unit" : undefined,
    });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    resetForm();
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
                  <span>
                    {e.label}
                    {/* Only show the rate × count breakdown when a count was actually
                        involved — legacy flat lines stay clean. */}
                    {e.quantity > 1 && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        ₹{e.unit_amount} × {e.quantity}
                        {e.unit_label ? ` ${e.unit_label}s` : ""}
                      </span>
                    )}
                  </span>
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

          <div className="space-y-2 border-t border-border/60 pt-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total paid in-store</span>
              <span className="font-semibold">
                ₹{(booking?.price ?? 0) + extrasSum}
                {extrasSum > 0 && (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    (₹{booking?.price} + ₹{extrasSum})
                  </span>
                )}
              </span>
            </div>
            <div className="space-y-1.5">
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                How did the customer pay?
                {savingMode && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              </span>
              <ToggleGroup
                type="single"
                size="sm"
                variant="outline"
                value={mode ?? ""}
                onValueChange={(v) => onSetMode(v === "" ? null : (v as PaymentMode))}
                className="flex-wrap justify-start"
              >
                {PAYMENT_MODE_VALUES.map((m) => {
                  const Icon = m === "cash" ? Banknote : Smartphone;
                  return (
                    <ToggleGroupItem
                      key={m}
                      value={m}
                      className="gap-1 px-2.5"
                      aria-label={`Paid by ${PAYMENT_MODE_LABELS[m]}`}
                    >
                      <Icon className="h-3.5 w-3.5" /> {PAYMENT_MODE_LABELS[m]}
                    </ToggleGroupItem>
                  );
                })}
              </ToggleGroup>
            </div>
          </div>

          <div className="space-y-2 border-t border-border/60 pt-3">
            <div className="space-y-1">
              <Label className="text-xs">Extra service</Label>
              <Select value={picked} onValueChange={onPick}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {addons.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} — ₹{a.rate}
                      {a.per_unit ? ` / ${a.unit_label}` : ""}
                    </SelectItem>
                  ))}
                  <SelectItem value={CUSTOM}>Custom…</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Free text only for one-offs that aren't in the catalog. */}
            {!addon && (
              <div className="space-y-1">
                <Label className="text-xs">Describe it</Label>
                <Input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Nail art"
                />
              </div>
            )}

            <div className="flex items-end gap-2">
              <div className="w-28 space-y-1">
                <Label className="text-xs">₹ Rate{perUnit ? ` / ${unitLabel}` : ""}</Label>
                <Input
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  inputMode="numeric"
                  placeholder="0"
                />
              </div>

              {/* Per-unit add-ons get a count; flat charges don't (qty is forced to 1). */}
              {perUnit && (
                <div className="space-y-1">
                  <Label className="text-xs capitalize">{unitLabel}s</Label>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-9 w-9 shrink-0"
                      title={`One fewer ${unitLabel}`}
                      onClick={() => setQty((q) => Math.max(1, q - 1))}
                      disabled={qty <= 1}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <Input
                      value={qty}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        setQty(Number.isFinite(n) ? Math.min(500, Math.max(1, Math.round(n))) : 1);
                      }}
                      inputMode="numeric"
                      className="w-14 text-center"
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-9 w-9 shrink-0"
                      title={`One more ${unitLabel}`}
                      onClick={() => setQty((q) => Math.min(500, q + 1))}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}

              <Button onClick={onAdd} disabled={saving} className="ml-auto" title="Add extra">
                {saving ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-1 h-4 w-4" />
                )}
                Add {lineTotal > 0 && `₹${lineTotal}`}
              </Button>
            </div>

            {perUnit && lineTotal > 0 && (
              <p className="text-right text-xs text-muted-foreground">
                ₹{Math.round(rateNum)} × {qty} {unitLabel}
                {qty === 1 ? "" : "s"} = ₹{lineTotal}
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
