"use client";

import { useCallback, useEffect, useState } from "react";
import { UserPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BRANCHES } from "@/lib/salon-data";
import { listStaffManage, addStaff, removeStaff, type StaffRow } from "@/lib/actions/admin";

type BranchName = (typeof BRANCHES)[number];

export function StaffManager({ lockedBranch }: { lockedBranch?: BranchName }) {
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [branch, setBranch] = useState<string>(lockedBranch ?? "");
  const [saving, setSaving] = useState(false);

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
    const res = await addStaff({ name: name.trim(), branch: b as BranchName });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Stylist added");
    setName("");
    if (!lockedBranch) setBranch("");
    void load();
  }

  async function onRemove(id: string, n: string) {
    if (!confirm(`Remove ${n}?`)) return;
    const res = await removeStaff({ id });
    if (!res.ok) return toast.error(res.error);
    toast.success("Stylist removed");
    void load();
  }

  return (
    <Card className="p-6">
      <h3 className="font-display text-xl font-semibold flex items-center gap-2">
        <UserPlus className="h-5 w-5 text-primary" /> Stylists
      </h3>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1.5 flex-1 min-w-40">
          <Label className="text-xs">Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Stylist name" />
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
          Add stylist
        </Button>
      </div>

      <div className="mt-6 space-y-2">
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!loading && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">No stylists yet.</p>
        )}
        {rows.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2"
          >
            <div className="flex items-center gap-3">
              <span className="font-medium">{s.name}</span>
              <Badge variant="secondary">{s.branch}</Badge>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={() => onRemove(s.id, s.name)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}
