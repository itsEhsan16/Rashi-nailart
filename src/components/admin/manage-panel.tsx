"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Save, Scissors, Clock, MapPin } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { TimeField12h } from "@/components/ui/time-field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SectionHeader } from "@/components/dashboard/page-header";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  listServices,
  saveService,
  deleteService,
  listTimeSlots,
  saveTimeSlot,
  deleteTimeSlot,
  listBranchesManage,
  saveBranch,
  type ServiceRow,
  type SlotRow,
  type BranchRow,
} from "@/lib/actions/admin";
import { StaffManager } from "@/components/admin/staff-manager";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ListSkeleton } from "@/components/dashboard/skeletons";
import { composeSlotLabel, minutesOfDay, slotStartLabel } from "@/lib/utils";

// ───────────────────────────── Services ─────────────────────────────────────
function ServicesManager() {
  const [rows, setRows] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceRow | null>(null);
  const [form, setForm] = useState({ name: "", price: "", is_nail_art: false, active: true, sort_order: "0" });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listServices();
    setLoading(false);
    if (res.ok) setRows(res.services);
    else toast.error(res.error);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  function openNew() {
    setEditing(null);
    setForm({ name: "", price: "", is_nail_art: false, active: true, sort_order: String(rows.length + 1) });
    setOpen(true);
  }
  function openEdit(s: ServiceRow) {
    setEditing(s);
    setForm({
      name: s.name,
      price: String(s.price),
      is_nail_art: s.is_nail_art,
      active: s.active,
      sort_order: String(s.sort_order),
    });
    setOpen(true);
  }

  async function onSave() {
    const res = await saveService({
      id: editing?.id,
      name: form.name.trim(),
      price: Number(form.price),
      is_nail_art: form.is_nail_art,
      active: form.active,
      sort_order: Number(form.sort_order),
    });
    if (!res.ok) return toast.error(res.error);
    toast.success(editing ? "Service updated" : "Service added");
    setOpen(false);
    void load();
  }
  async function onDelete(s: ServiceRow) {
    if (!confirm(`Delete "${s.name}"?`)) return;
    const res = await deleteService({ id: s.id });
    if (!res.ok) return toast.error(res.error);
    toast.success("Service deleted");
    void load();
  }

  return (
    <Card className="rounded-xl p-5 shadow-soft">
      <SectionHeader
        title="Services & pricing"
        description="Manage what customers can book and how it's priced."
        actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openNew} className="bg-gradient-hero text-primary-foreground">
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit service" : "Add service"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Price (₹)</Label>
                  <Input
                    type="number"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Sort order</Label>
                  <Input
                    type="number"
                    value={form.sort_order}
                    onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                <Label htmlFor="nailart">Nail-art (informational tag only — no automatic discount)</Label>
                <Switch
                  id="nailart"
                  checked={form.is_nail_art}
                  onCheckedChange={(v) => setForm({ ...form, is_nail_art: v })}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                <Label htmlFor="active">Active (shown on booking form)</Label>
                <Switch
                  id="active"
                  checked={form.active}
                  onCheckedChange={(v) => setForm({ ...form, active: v })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={onSave} className="bg-gradient-hero text-primary-foreground">
                <Save className="h-4 w-4 mr-1" /> Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        }
      />

      <div className="mt-4 space-y-2">
        {loading && <ListSkeleton />}
        {!loading && rows.length === 0 && (
          <EmptyState
            icon={<Scissors className="h-6 w-6" />}
            title="No services yet"
            description="Add your first service so customers have something to book."
          />
        )}
        {rows.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-4 py-3 transition-colors hover:border-border hover:bg-muted/40"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 font-medium">
                {s.name}
                {s.is_nail_art && <Badge variant="secondary">nail art</Badge>}
                {!s.active && <Badge variant="outline">hidden</Badge>}
              </div>
              <div className="mt-0.5 text-sm text-muted-foreground">₹{s.price}</div>
            </div>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(s)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => onDelete(s)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ───────────────────────────── Time slots ───────────────────────────────────
function SlotsManager() {
  const [rows, setRows] = useState<SlotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  // Live preview of the label that will be stored (range form, e.g. "8:30 PM – 10:00 PM").
  const previewLabel = composeSlotLabel(start, end);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listTimeSlots();
    setLoading(false);
    if (res.ok) setRows(res.slots);
    else toast.error(res.error);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function onAdd() {
    if (!start || !end) return toast.error("Pick a start and end time");
    if (minutesOfDay(end) <= minutesOfDay(start))
      return toast.error("End time must be after the start time");
    const label = composeSlotLabel(start, end);
    if (!label) return toast.error("Enter valid times");
    if (rows.some((r) => r.label === label)) return toast.error("That slot already exists");
    // sort_order = start time in minutes so slots list chronologically.
    const res = await saveTimeSlot({ label, active: true, sort_order: minutesOfDay(start) });
    if (!res.ok) return toast.error(res.error);
    setStart("");
    setEnd("");
    void load();
  }
  async function onToggle(s: SlotRow) {
    const res = await saveTimeSlot({ id: s.id, label: s.label, active: !s.active, sort_order: s.sort_order });
    if (!res.ok) return toast.error(res.error);
    void load();
  }
  async function onDelete(s: SlotRow) {
    if (!confirm(`Delete slot "${s.label}"?`)) return;
    const res = await deleteTimeSlot({ id: s.id });
    if (!res.ok) return toast.error(res.error);
    void load();
  }

  return (
    <Card className="rounded-xl p-5 shadow-soft">
      <SectionHeader
        title="Time slots"
        description="Define the slots artists can be scheduled into."
      />
      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-border/60 bg-muted/30 p-4">
        <div className="space-y-1.5">
          <Label className="text-xs" htmlFor="slot-start">Start time</Label>
          <TimeField12h id="slot-start" ariaLabel="Start time" value={start} onChange={setStart} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs" htmlFor="slot-end">End time</Label>
          <TimeField12h id="slot-end" ariaLabel="End time" value={end} onChange={setEnd} />
        </div>
        <Button onClick={onAdd} className="bg-gradient-hero text-primary-foreground">
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {previewLabel
          ? `Saved as "${previewLabel}". Customers see the start time (${slotStartLabel(
              previewLabel,
            )}); artists pick from these slots in their weekly schedule.`
          : "Pick a start and end time. Customers see only the start time; artists choose from these slots in their weekly schedule."}
      </p>
      <div className="mt-4 space-y-2">
        {loading && <ListSkeleton />}
        {!loading && rows.length === 0 && (
          <EmptyState
            icon={<Clock className="h-6 w-6" />}
            title="No time slots yet"
            description="Add a slot above so artists can be scheduled and customers can book."
          />
        )}
        {rows.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-4 py-3 transition-colors hover:border-border hover:bg-muted/40"
          >
            <span className={s.active ? "font-medium" : "text-muted-foreground line-through"}>{s.label}</span>
            <div className="flex items-center gap-3">
              <Switch checked={s.active} onCheckedChange={() => onToggle(s)} />
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => onDelete(s)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ───────────────────────────── Branches ─────────────────────────────────────
function BranchesManager() {
  const [rows, setRows] = useState<BranchRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listBranchesManage();
    setLoading(false);
    if (res.ok) setRows(res.branches);
    else toast.error(res.error);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  function update(id: string, patch: Partial<BranchRow>) {
    setRows((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }
  async function onSave(b: BranchRow) {
    const res = await saveBranch({
      id: b.id,
      address: b.address,
      phone: b.phone,
      map_url: b.map_url,
      active: b.active,
    });
    if (!res.ok) return toast.error(res.error);
    toast.success(`${b.name} updated`);
  }

  return (
    <Card className="rounded-xl p-5 shadow-soft">
      <SectionHeader
        title="Branches"
        description="Update the contact details customers see for each location."
      />
      <div className="mt-4 space-y-4">
        {loading && <ListSkeleton />}
        {!loading && rows.length === 0 && (
          <EmptyState
            icon={<MapPin className="h-6 w-6" />}
            title="No branches yet"
            description="Branches appear here once they're configured."
          />
        )}
        {rows.map((b) => (
          <div key={b.id} className="space-y-3 rounded-lg border border-border/60 p-4 transition-colors hover:border-border">
            <div className="flex items-center justify-between">
              <span className="font-display text-lg font-semibold">{b.name}</span>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Active</span>
                <Switch checked={b.active} onCheckedChange={(v) => update(b.id, { active: v })} />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Address</Label>
                <Input
                  value={b.address ?? ""}
                  onChange={(e) => update(b.id, { address: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Phone</Label>
                <Input value={b.phone ?? ""} onChange={(e) => update(b.id, { phone: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Google Maps URL</Label>
              <Input value={b.map_url ?? ""} onChange={(e) => update(b.id, { map_url: e.target.value })} />
            </div>
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => onSave(b)}>
                <Save className="h-4 w-4 mr-1" /> Save
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function ManagePanel() {
  return (
    <Tabs defaultValue="services" className="space-y-6">
      <TabsList>
        <TabsTrigger value="services">Services</TabsTrigger>
        <TabsTrigger value="slots">Time slots</TabsTrigger>
        <TabsTrigger value="branches">Branches</TabsTrigger>
        <TabsTrigger value="staff">Artists</TabsTrigger>
      </TabsList>
      <TabsContent value="services" className="mt-0">
        <ServicesManager />
      </TabsContent>
      <TabsContent value="slots" className="mt-0">
        <SlotsManager />
      </TabsContent>
      <TabsContent value="branches" className="mt-0">
        <BranchesManager />
      </TabsContent>
      <TabsContent value="staff" className="mt-0">
        <StaffManager />
      </TabsContent>
    </Tabs>
  );
}
