"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, UserCog } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
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
 * Move a booking to another artist. When a walk-in's assigned artist is busy, the
 * manager reassigns to whoever is actually free — including someone not rostered
 * for this slot, since the manager can see who's in the studio. Off-shift artists
 * are offered behind a confirmation; artists already holding the slot are shown
 * but disabled (the unique slot index makes that move impossible anyway).
 * Open when `booking` is non-null. Self-contained: owns its candidate loading and
 * the reassign call.
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

  const available = candidates.filter((c) => c.scheduled && !c.busy);
  const others = candidates.filter((c) => !c.scheduled || c.busy);
  const picked = candidates.find((c) => c.name === target) ?? null;
  const needsConfirm = !!picked && !picked.scheduled;

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
            {booking?.time_slot} · currently with {booking?.staff_name}. Pick whoever is free —
            artists without a shift for this slot can still be assigned.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Finding artists…
          </div>
        ) : candidates.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            No other artist is on this branch&apos;s roster.
          </p>
        ) : (
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger>
              <SelectValue placeholder="Choose an artist" />
            </SelectTrigger>
            <SelectContent>
              {available.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Available</SelectLabel>
                  {available.map((c) => (
                    <SelectItem key={c.staffId} value={c.name}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
              {others.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Off shift / busy</SelectLabel>
                  {others.map((c) => (
                    // Busy is a hard block — uq_appointment_slot would reject the
                    // write, so say why instead of failing on save. Off shift is
                    // only a warning: the manager decides.
                    <SelectItem key={c.staffId} value={c.name} disabled={c.busy}>
                      {c.name}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {c.busy ? "already booked" : "no shift this slot"}
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
        )}

        {needsConfirm && (
          <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>
              {target} isn&apos;t rostered for {booking?.time_slot}. Reassign anyway?
            </span>
          </p>
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
            {needsConfirm ? "Reassign anyway" : "Reassign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
