"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Download, Pencil, Trash2, Save } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { downloadCsv } from "@/lib/export-csv";
import { listMembers, updateMember, deleteMember, type MemberRow } from "@/lib/actions/admin";

const EMPTY_FORM = {
  client_name: "",
  phone: "",
  start_date: "",
  activation_date: "",
  expires_at: "",
  active: true,
  amount_paid: "",
};

export function MembersPanel() {
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MemberRow | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listMembers();
    setLoading(false);
    if (res.ok) setRows(res.members);
    else toast.error(res.error);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  function openEdit(m: MemberRow) {
    setEditing(m);
    setForm({
      client_name: m.client_name,
      phone: m.phone,
      start_date: m.start_date,
      activation_date: m.activation_date ?? "",
      expires_at: m.expires_at,
      active: m.active,
      amount_paid: String(m.amount_paid),
    });
    setOpen(true);
  }

  async function onSave() {
    if (!editing) return;
    setSaving(true);
    const res = await updateMember({
      id: editing.id,
      client_name: form.client_name.trim(),
      phone: form.phone.trim(),
      start_date: form.start_date,
      activation_date: form.activation_date || null,
      expires_at: form.expires_at,
      active: form.active,
      amount_paid: Number(form.amount_paid),
    });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Member updated");
    setOpen(false);
    void load();
  }

  async function onDelete(m: MemberRow) {
    if (!confirm(`Remove member "${m.client_name}"? This cannot be undone.`)) return;
    const res = await deleteMember({ id: m.id });
    if (!res.ok) return toast.error(res.error);
    toast.success("Member removed");
    void load();
  }

  return (
    <Card>
      <div className="p-4 flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold">Members</h3>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {loading ? "Loading…" : `${rows.length} member${rows.length === 1 ? "" : "s"}`}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={rows.length === 0}
            onClick={() =>
              downloadCsv(
                `members-${new Date().toISOString().slice(0, 10)}.csv`,
                rows.map((m) => ({
                  name: m.client_name,
                  phone: m.phone,
                  purchased: m.start_date,
                  activates: m.activation_date ?? "",
                  expires: m.expires_at,
                  status: m.status,
                  amount: m.amount_paid,
                })),
              )
            }
          >
            <Download className="mr-1 h-4 w-4" /> CSV
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Purchased</TableHead>
              <TableHead>Activates</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                  No members yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{m.client_name}</TableCell>
                <TableCell>{m.phone}</TableCell>
                <TableCell>{format(new Date(m.start_date), "dd MMM yyyy")}</TableCell>
                <TableCell>
                  {m.activation_date ? format(new Date(m.activation_date), "dd MMM yyyy") : "—"}
                </TableCell>
                <TableCell>{format(new Date(m.expires_at), "dd MMM yyyy")}</TableCell>
                <TableCell>
                  {m.status === "active" ? (
                    <Badge className="bg-emerald-600 text-white">Active</Badge>
                  ) : m.status === "pending" ? (
                    <Badge variant="outline">Pending activation</Badge>
                  ) : (
                    <Badge variant="destructive">Expired</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      aria-label="Edit member"
                      onClick={() => openEdit(m)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      aria-label="Remove member"
                      onClick={() => onDelete(m)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit member</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input
                  value={form.client_name}
                  onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Purchased</Label>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Activates</Label>
                <Input
                  type="date"
                  value={form.activation_date}
                  onChange={(e) => setForm({ ...form, activation_date: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Expires</Label>
                <Input
                  type="date"
                  value={form.expires_at}
                  onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Amount paid (₹)</Label>
                <Input
                  type="number"
                  value={form.amount_paid}
                  onChange={(e) => setForm({ ...form, amount_paid: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
              <Label htmlFor="member-active">Active</Label>
              <Switch
                id="member-active"
                checked={form.active}
                onCheckedChange={(v) => setForm({ ...form, active: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={onSave}
              disabled={saving}
              className="bg-gradient-hero text-primary-foreground"
            >
              <Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
