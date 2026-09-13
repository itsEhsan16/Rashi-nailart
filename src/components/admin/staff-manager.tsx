"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { UserPlus, Trash2, CalendarDays, Save, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StaffDaysOff } from "@/components/admin/staff-days-off";
import { SectionHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { cn } from "@/lib/utils";
import { BRANCHES } from "@/lib/salon-data";
import {
  listStaffManage,
  addStaff,
  updateStaff,
  removeStaff,
  getStaffSchedule,
  setStaffSchedule,
  getSchedulableSlots,
  type StaffRow,
} from "@/lib/actions/admin";

type BranchName = (typeof BRANCHES)[number];

/** index = day_of_week (JS getDay(): 0=Sun .. 6=Sat) */
const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Tabs inside the schedule dialog: the weekly matrix, or the dated days-off calendar. */
type SchedTab = "weekly" | "off";

export function StaffManager({ lockedBranch }: { lockedBranch?: BranchName }) {
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [storeNumber, setStoreNumber] = useState("");
  const [branch, setBranch] = useState<string>(lockedBranch ?? "");
  const [saving, setSaving] = useState(false);

  // Remove-artist confirmation. The target outlives `removeOpen` on purpose, so the
  // dialog's text doesn't blank out mid close-animation.
  const [removeTarget, setRemoveTarget] = useState<StaffRow | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  // Edit-store-number dialog
  const [editStaff, setEditStaff] = useState<StaffRow | null>(null);
  const [editStoreNumber, setEditStoreNumber] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Schedule editor
  const [schedOpen, setSchedOpen] = useState(false);
  const [schedStaff, setSchedStaff] = useState<StaffRow | null>(null);
  const [schedSlots, setSchedSlots] = useState<string[]>([]);
  const [sel, setSel] = useState<Record<number, string[]>>({});
  const [schedLoading, setSchedLoading] = useState(false);
  const [schedSaving, setSchedSaving] = useState(false);
  const [schedTab, setSchedTab] = useState<SchedTab>("weekly");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listStaffManage();
    setLoading(false);
    if (res.ok) setRows(res.staff);
    else toast.error(res.error);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onAdd() {
    const b = lockedBranch ?? branch;
    if (!name.trim() || !b) {
      toast.error("Enter a name and choose a branch");
      return;
    }
    setSaving(true);
    const res = await addStaff({
      name: name.trim(),
      branch: b as BranchName,
      store_number: storeNumber.trim() || null,
    });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Artist added");
    setName("");
    setStoreNumber("");
    if (!lockedBranch) setBranch("");
    void load();
  }

  function openEdit(s: StaffRow) {
    setEditStaff(s);
    setEditStoreNumber(s.store_number ?? "");
  }

  async function saveEdit() {
    if (!editStaff) return;
    setEditSaving(true);
    const res = await updateStaff({
      id: editStaff.id,
      store_number: editStoreNumber.trim() || null,
    });
    setEditSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Studio number updated");
    setEditStaff(null);
    void load();
  }

  function askRemove(s: StaffRow) {
    setRemoveTarget(s);
    setRemoveOpen(true);
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    setRemoving(true);
    const res = await removeStaff({ id: removeTarget.id });
    setRemoving(false);
    setRemoveOpen(false);
    // The server refuses while the artist has upcoming bookings; its message says
    // how many and what to do, so surface it verbatim.
    if (!res.ok) return toast.error(res.error);
    toast.success(`${removeTarget.name} removed from the roster`);
    void load();
  }

  // Columns shown in the schedule editor: active slots plus any already-saved
  // slot that may since have been deactivated (so nothing is silently hidden).
  const slotColumns = useMemo(() => {
    const extras = new Set<string>();
    for (const day of Object.keys(sel)) {
      for (const s of sel[Number(day)] ?? []) if (!schedSlots.includes(s)) extras.add(s);
    }
    return [...schedSlots, ...extras];
  }, [schedSlots, sel]);

  // Weekdays the artist works, taken from the UNSAVED editor state on purpose: the
  // days-off calendar should mute dates against what the admin is looking at right now.
  const workingWeekdays = useMemo(
    () => DOW.map((_, day) => day).filter((day) => (sel[day] ?? []).length > 0),
    [sel],
  );

  async function openSchedule(s: StaffRow) {
    setSchedStaff(s);
    setSel({});
    setSchedSlots([]);
    // Reopening for another artist must never land on the previous artist's tab.
    setSchedTab("weekly");
    setSchedOpen(true);
    setSchedLoading(true);
    const [slotsRes, schedRes] = await Promise.all([
      getSchedulableSlots(),
      getStaffSchedule({ staffId: s.id }),
    ]);
    setSchedLoading(false);
    if (!slotsRes.ok) {
      toast.error(slotsRes.error);
      setSchedOpen(false);
      return;
    }
    if (!schedRes.ok) {
      toast.error(schedRes.error);
      setSchedOpen(false);
      return;
    }
    setSchedSlots(slotsRes.slots);
    const next: Record<number, string[]> = {};
    for (const e of schedRes.entries) (next[e.day_of_week] ??= []).push(e.time_slot);
    setSel(next);
  }

  function isSlotOn(day: number, slot: string) {
    return (sel[day] ?? []).includes(slot);
  }
  function toggleSlot(day: number, slot: string) {
    setSel((prev) => {
      const cur = prev[day] ?? [];
      const next = cur.includes(slot) ? cur.filter((x) => x !== slot) : [...cur, slot];
      return { ...prev, [day]: next };
    });
  }
  function worksDay(day: number) {
    return (sel[day] ?? []).length > 0;
  }
  function toggleDay(day: number, on: boolean) {
    setSel((prev) => ({ ...prev, [day]: on ? [...slotColumns] : [] }));
  }

  async function saveSchedule() {
    if (!schedStaff) return;
    setSchedSaving(true);
    const entries = Object.entries(sel).flatMap(([day, slots]) =>
      (slots ?? []).map((time_slot) => ({ day_of_week: Number(day), time_slot })),
    );
    const res = await setStaffSchedule({ staff_id: schedStaff.id, entries });
    setSchedSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Schedule updated");
    setSchedOpen(false);
  }

  return (
    <Card className="rounded-xl p-5 shadow-soft">
      <SectionHeader
        title={
          <span className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" /> Artists
          </span>
        }
        description="Add artists, set their weekly availability, and block individual dates off."
      />
      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-border/60 bg-muted/30 p-4">
        <div className="space-y-1.5 flex-1 min-w-40">
          <Label className="text-xs">Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Artist name" />
        </div>
        <div className="space-y-1.5 min-w-40">
          <Label className="text-xs">Studio number</Label>
          <Input
            value={storeNumber}
            onChange={(e) => setStoreNumber(e.target.value)}
            placeholder="Optional"
          />
        </div>
        {!lockedBranch && (
          <div className="space-y-1.5">
            <Label className="text-xs">Branch</Label>
            <Select value={branch} onValueChange={setBranch}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Choose branch" />
              </SelectTrigger>
              <SelectContent>
                {BRANCHES.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <Button onClick={onAdd} disabled={saving} className="bg-gradient-hero text-primary-foreground">
          Add artist
        </Button>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Use the calendar button to set an artist&apos;s weekly schedule and to block single dates
        such as festivals or leave. Artists with no schedule won&apos;t appear in the booking form.
      </p>

      <div className="mt-4 space-y-2">
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!loading && rows.length === 0 && (
          <EmptyState
            icon={<UserPlus className="h-6 w-6" />}
            title="No artists yet"
            description="Add an artist above, then set their weekly schedule so they appear in the booking form."
          />
        )}
        {rows.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-4 py-3 transition-colors hover:border-border hover:bg-muted/40"
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-medium">{s.name}</span>
              <Badge variant="secondary">{s.branch}</Badge>
              {s.store_number && (
                <span className="text-xs text-muted-foreground">Studio: {s.store_number}</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                title="Edit studio number"
                onClick={() => openEdit(s)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                title="Schedule & days off"
                onClick={() => openSchedule(s)}
              >
                <CalendarDays className="h-4 w-4" />
              </Button>
              {/* Divider so the destructive button isn't flush against the schedule
                  button right beside it — the one admins click most. */}
              <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-destructive hover:text-destructive"
                title="Remove artist"
                aria-label={`Remove ${s.name}`}
                onClick={() => askRemove(s)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={schedOpen} onOpenChange={setSchedOpen}>
        {/* Capped and scrollable: the days-off month grid makes this dialog tall enough to
            overflow a laptop viewport, and a fixed, vertically-centred dialog clips off BOTH
            ends with nothing to scroll — the close button included. */}
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Schedule{schedStaff ? ` · ${schedStaff.name}` : ""}</DialogTitle>
          </DialogHeader>

          <Tabs value={schedTab} onValueChange={(v) => setSchedTab(v as SchedTab)}>
            <TabsList>
              <TabsTrigger value="weekly">Weekly hours</TabsTrigger>
              <TabsTrigger value="off">Days off</TabsTrigger>
            </TabsList>

            <TabsContent value="weekly">
              {schedLoading ? (
                <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : slotColumns.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">
                  No active time slots configured. Add time slots first under Manage → Time Slots.
                </p>
              ) : (
                <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
                  <p className="text-xs text-muted-foreground">
                    Toggle each day this artist works, then pick the time slots. Customers can only
                    book the days and slots enabled here.
                  </p>
                  {DOW.map((label, day) => (
                    <div key={label} className="rounded-lg border border-border/60 p-3">
                      <div className="flex items-center justify-between">
                        <Label className="font-medium">{label}</Label>
                        <Switch
                          checked={worksDay(day)}
                          onCheckedChange={(v) => toggleDay(day, v)}
                          aria-label={`Works on ${label}`}
                        />
                      </div>
                      {worksDay(day) && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {slotColumns.map((slot) => {
                            const on = isSlotOn(day, slot);
                            return (
                              <button
                                type="button"
                                key={slot}
                                onClick={() => toggleSlot(day, slot)}
                                className={cn(
                                  "rounded-full border px-3 py-1 text-xs transition",
                                  on
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-border/60 text-muted-foreground hover:border-primary/50",
                                )}
                              >
                                {slot}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="off">
              {schedStaff && (
                <StaffDaysOff staffId={schedStaff.id} canEdit workingWeekdays={workingWeekdays} />
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter>
            {schedTab === "weekly" ? (
              <Button
                onClick={saveSchedule}
                disabled={schedSaving || schedLoading}
                className="bg-gradient-hero text-primary-foreground"
              >
                {schedSaving ? (
                  <>
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Saving…
                  </>
                ) : (
                  <>
                    <Save className="mr-1 h-4 w-4" /> Save schedule
                  </>
                )}
              </Button>
            ) : (
              // Days off write themselves the moment a date is clicked, so there is nothing to
              // save here — the button-height line keeps the dialog from jumping between tabs.
              <p className="flex h-9 items-center text-xs text-muted-foreground">
                Changes to days off save automatically.
              </p>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Radix focuses Cancel when this opens, so Enter never removes anyone. The
          confirm is a plain Button, not AlertDialogAction: Action always closes the
          dialog, and it has to stay open while the server decides. */}
      <AlertDialog open={removeOpen} onOpenChange={(o) => !removing && setRemoveOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeTarget?.name} from the roster?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  This permanently deletes {removeTarget?.name}&apos;s weekly schedule, days off
                  and salary history. It can&apos;t be undone.
                </p>
                <p>
                  Past bookings are kept. An artist who still has upcoming bookings can&apos;t be
                  removed — reassign or cancel those first.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Keep {removeTarget?.name}</AlertDialogCancel>
            <Button variant="destructive" onClick={confirmRemove} disabled={removing}>
              {removing ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-1 h-4 w-4" />
              )}
              Remove {removeTarget?.name}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!editStaff} onOpenChange={(o) => !o && setEditStaff(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Studio number{editStaff ? ` · ${editStaff.name}` : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">Studio number</Label>
            <Input
              value={editStoreNumber}
              onChange={(e) => setEditStoreNumber(e.target.value)}
              placeholder="Shown to customers who pick this artist"
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to remove it. Customers see this once they select this artist.
            </p>
          </div>
          <DialogFooter>
            <Button
              onClick={saveEdit}
              disabled={editSaving}
              className="bg-gradient-hero text-primary-foreground"
            >
              {editSaving ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <Save className="mr-1 h-4 w-4" /> Save
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
