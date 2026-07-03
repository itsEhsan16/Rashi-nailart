"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, UserCog } from "lucide-react";
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
  listReassignCandidates,
  reassignBookingStaff,
  type BookingRow,
  type ReassignCandidate,
} from "@/lib/actions/admin";

/**
 * Move a booking to another available artist. When a walk-in's assigned artist is
 * busy, the manager reassigns to someone scheduled for that slot and not already
 * booked. Open when `booking` is non-null. Self-contained: owns its candidate
 * loading and the reassign call.
 */
export function ReassignDialog({
  booking,
  onOpenChange,
  onChanged,
}: {
  booking: BookingRow | null;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}) {
  const [candidates, setCandidates] = useState<ReassignCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    const res = await listReassignCandidates({ id });
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error ?? "Could not load available artists");
      return;
    }
    setCandidates(res.candidates);
  }, []);

  useEffect(() => {
    if (!booking) return;
    setCandidates([]);
    setTarget("");
    void load(booking.id);
  }, [booking, load]);

  async function onConfirm() {
    if (!booking || !target) return;
    setSaving(true);
    const res = await reassignBookingStaff({ id: booking.id, staffName: target });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(`Reassigned to ${target}`);
    onChanged?.();
    onOpenChange(false);
  }

  return (
    <Dialog open={!!booking} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reassign artist — {booking?.client_name}</DialogTitle>
          <DialogDescription>
            {booking?.time_slot} · currently with {booking?.staff_name}. Pick another artist who is
            free for this slot.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Finding available artists…
          </div>
        ) : candidates.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            No other artist is scheduled and free for this slot.
          </p>
        ) : (
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger>
              <SelectValue placeholder="Choose an available artist" />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((c) => (
                <SelectItem key={c.staffId} value={c.name}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={!target || saving}>
            {saving ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <UserCog className="mr-1 h-4 w-4" />
            )}
            Reassign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
