"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xl font-semibold">Services &amp; pricing</h3>
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
                <Label htmlFor="nailart">Nail-art (member 50% off applies)</Label>
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
      </div>

      <div className="mt-4 space-y-2">
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {rows.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2"
          >
            <div>
              <div className="font-medium flex items-center gap-2">
                {s.name}
                {s.is_nail_art && <Badge variant="secondary">nail art</Badge>}
                {!s.active && <Badge variant="outline">hidden</Badge>}
              </div>
              <div className="text-sm text-muted-foreground">₹{s.price}</div>
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
  const [label, setLabel] = useState("");

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
    if (!label.trim()) return;
    const res = await saveTimeSlot({ label: label.trim(), active: true, sort_order: rows.length + 1 });
    if (!res.ok) return toast.error(res.error);
    setLabel("");
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
    <Card className="p-6">
      <h3 className="font-display text-xl font-semibold">Time slots</h3>
      <div className="mt-4 flex items-end gap-3">
        <div className="space-y-1.5 flex-1">
          <Label className="text-xs">New slot label</Label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. 8:30 PM – 10:00 PM" />
        </div>
        <Button onClick={onAdd} className="bg-gradient-hero text-primary-foreground">
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>
      <div className="mt-4 space-y-2">
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {rows.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2"
          >
            <span className={s.active ? "" : "text-muted-foreground line-through"}>{s.label}</span>
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
    <Card className="p-6">
      <h3 className="font-display text-xl font-semibold">Branches</h3>
      <div className="mt-4 space-y-4">
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {rows.map((b) => (
          <div key={b.id} className="rounded-lg border border-border/60 p-4 space-y-3">
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
    <Tabs defaultValue="services">
      <TabsList>
        <TabsTrigger value="services">Services</TabsTrigger>
        <TabsTrigger value="slots">Time slots</TabsTrigger>
        <TabsTrigger value="branches">Branches</TabsTrigger>
        <TabsTrigger value="staff">Stylists</TabsTrigger>
      </TabsList>
      <TabsContent value="services" className="mt-6">
        <ServicesManager />
      </TabsContent>
      <TabsContent value="slots" className="mt-6">
        <SlotsManager />
      </TabsContent>
      <TabsContent value="branches" className="mt-6">
        <BranchesManager />
      </TabsContent>
      <TabsContent value="staff" className="mt-6">
        <StaffManager />
      </TabsContent>
    </Tabs>
  );
}
