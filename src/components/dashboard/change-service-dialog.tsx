"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Scissors } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listActiveServices,
  changeBookingService,
  type BookingRow,
  type ServiceOptionRow,
} from "@/lib/actions/admin";

/**
 * Swap a booking's base service when the customer decides in-studio to do a
 * different service than they booked. Loads the active service menu, and on
 * confirm re-prices the booking. Open when `booking` is non-null. Self-contained:
 * owns its service loading and the change call. Shared by the admin/manager
 * bookings table and the staff task list.
 */
export function ChangeServiceDialog({
  booking,
  onOpenChange,
  onChanged,
}: {
  booking: BookingRow | null;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}) {
  const [services, setServices] = useState<ServiceOptionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listActiveServices();
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error ?? "Could not load services");
      return;
    }
    setServices(res.services);
  }, []);

  useEffect(() => {
    if (!booking) return;
    setServices([]);
    setTarget("");
    void load();
  }, [booking, load]);

  const selected = services.find((s) => s.name === target);

  async function onConfirm() {
    if (!booking || !target) return;
    setSaving(true);
    const res = await changeBookingService({ id: booking.id, service: target });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(`Service changed to ${target}`);
    onChanged?.();
    onOpenChange(false);
  }

  return (
    <Dialog open={!!booking} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change service — {booking?.client_name}</DialogTitle>
          <DialogDescription>
            Currently {booking?.service} · ₹{booking?.price}. Pick the service the customer is
            actually doing — the price updates to match.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading services…
          </div>
        ) : (
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a service" />
            </SelectTrigger>
            <SelectContent>
              {services.map((s) => (
                <SelectItem key={s.name} value={s.name}>
                  {s.name} — ₹{s.price}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {selected && booking && selected.price !== booking.price && (
          <p className="text-xs text-muted-foreground">
            Price changes from ₹{booking.price} to ₹{selected.price}
            {booking.extras_total > 0 && " (extras unchanged)"}.
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={!target || target === booking?.service || saving}>
            {saving ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Scissors className="mr-1 h-4 w-4" />
            )}
            Change service
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
