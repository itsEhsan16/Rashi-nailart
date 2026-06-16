"use client";

import { useCallback, useEffect, useState } from "react";
import { UserPlus, KeyRound, Trash2 } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { BRANCHES } from "@/lib/salon-data";
import type { UserRole } from "@/lib/auth";
import {
  listTeam,
  createTeamMember,
  resetTeamPassword,
  deleteTeamMember,
  type TeamRow,
} from "@/lib/actions/admin";

type BranchName = (typeof BRANCHES)[number];

export function TeamPanel({ role, branch }: { role: UserRole; branch: string | null }) {
  const isAdmin = role === "admin";
  const [rows, setRows] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    full_name: "",
    staff_name: "",
    role: "staff" as "manager" | "staff",
    branch: (branch ?? "") as string,
  });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listTeam();
    setLoading(false);
    if (res.ok) setRows(res.team);
    else toast.error(res.error);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate() {
    setSaving(true);
    const res = await createTeamMember({
      email: form.email.trim(),
      password: form.password,
      full_name: form.full_name.trim(),
      staff_name: form.staff_name.trim() || form.full_name.trim(),
      role: isAdmin ? form.role : "staff",
      branch: (branch ?? form.branch) as BranchName,
    });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Team member created");
    setOpen(false);
    setForm({ email: "", password: "", full_name: "", staff_name: "", role: "staff", branch: branch ?? "" });
    void load();
  }

  async function onReset(t: TeamRow) {
    const pw = window.prompt(`New password for ${t.email} (min 8 chars):`);
    if (!pw) return;
    const res = await resetTeamPassword({ id: t.id, password: pw });
    if (!res.ok) return toast.error(res.error);
    toast.success("Password updated");
  }

  async function onDelete(t: TeamRow) {
    if (!confirm(`Delete the login for ${t.email}?`)) return;
    const res = await deleteTeamMember({ id: t.id });
    if (!res.ok) return toast.error(res.error);
    toast.success("Login deleted");
    void load();
  }

  return (
    <Card>
      <div className="p-4 flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold">Team logins</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-gradient-hero text-primary-foreground">
              <UserPlus className="h-4 w-4 mr-1" /> Add member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create team login</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Full name</Label>
                  <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Stylist name (for bookings)</Label>
                  <Input
                    value={form.staff_name}
                    onChange={(e) => setForm({ ...form, staff_name: e.target.value })}
                    placeholder="matches the stylist list"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Temporary password</Label>
                  <Input
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="min 8 characters"
                  />
                </div>
                {isAdmin && (
                  <div className="space-y-1.5">
                    <Label>Role</Label>
                    <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as "manager" | "staff" })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="staff">Staff</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              {isAdmin && (
                <div className="space-y-1.5">
                  <Label>Branch</Label>
                  <Select value={form.branch} onValueChange={(v) => setForm({ ...form, branch: v })}>
                    <SelectTrigger>
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
              {!isAdmin && (
                <p className="text-xs text-muted-foreground">
                  New staff will be added to your branch ({branch}).
                </p>
              )}
            </div>
            <DialogFooter>
              <Button onClick={onCreate} disabled={saving} className="bg-gradient-hero text-primary-foreground">
                {saving ? "Creating…" : "Create login"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No team logins yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.full_name ?? t.staff_name ?? "—"}</TableCell>
                <TableCell className="font-mono text-sm">{t.email}</TableCell>
                <TableCell>
                  <Badge variant={t.role === "admin" ? "default" : t.role === "manager" ? "secondary" : "outline"} className="capitalize">
                    {t.role}
                  </Badge>
                </TableCell>
                <TableCell>{t.branch && <Badge variant="secondary">{t.branch}</Badge>}</TableCell>
                <TableCell className="text-right space-x-1 whitespace-nowrap">
                  {t.role !== "admin" && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => onReset(t)}>
                        <KeyRound className="h-4 w-4 mr-1" /> Reset
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => onDelete(t)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
