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
  listStaffManage,
  createTeamMember,
  resetTeamPassword,
  deleteTeamMember,
  type TeamRow,
  type StaffRow,
} from "@/lib/actions/admin";

type BranchName = (typeof BRANCHES)[number];

export function TeamPanel({ role, branch }: { role: UserRole; branch: string | null }) {
  const isAdmin = role === "admin";
  const [rows, setRows] = useState<TeamRow[]>([]);
  const [stylists, setStylists] = useState<StaffRow[]>([]);
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
    const [teamRes, staffRes] = await Promise.all([listTeam(), listStaffManage()]);
    setLoading(false);
    if (teamRes.ok) setRows(teamRes.team);
    else toast.error(teamRes.error);
    if (staffRes.ok) setStylists(staffRes.staff);
    else toast.error(staffRes.error);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  // The stylist dropdown is the booking-match key, so it's scoped to the chosen
  // branch and only applies to staff logins (managers are matched by branch).
  const effectiveRole = isAdmin ? form.role : "staff";
  const effectiveBranch = isAdmin ? form.branch : branch ?? "";
  const branchStylists = stylists.filter((s) => s.branch === effectiveBranch);
  const takenNames = new Set(
    rows
      .filter((r) => r.role === "staff" && r.staff_name)
      .map((r) => `${r.branch ?? ""}|${r.staff_name!.toLowerCase()}`),
  );

  async function onCreate() {
    if (effectiveRole === "staff" && !form.staff_name) {
      return toast.error("Choose the stylist this login belongs to.");
    }
    setSaving(true);
    const res = await createTeamMember({
      email: form.email.trim(),
      password: form.password,
      full_name: form.full_name.trim(),
      staff_name: effectiveRole === "staff" ? form.staff_name : form.full_name.trim() || form.staff_name,
      role: effectiveRole,
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
                  <Label>Email</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
              </div>

              {isAdmin && (
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Role</Label>
                    <Select
                      value={form.role}
                      onValueChange={(v) => setForm({ ...form, role: v as "manager" | "staff", staff_name: "" })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="staff">Staff</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Branch</Label>
                    <Select
                      value={form.branch}
                      onValueChange={(v) => setForm({ ...form, branch: v, staff_name: "" })}
                    >
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
                </div>
              )}

              {effectiveRole === "staff" && (
                <div className="space-y-1.5">
                  <Label>Stylist (for bookings)</Label>
                  <Select
                    value={form.staff_name}
                    onValueChange={(v) => setForm({ ...form, staff_name: v })}
                    disabled={!effectiveBranch}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={effectiveBranch ? "Choose stylist" : "Pick a branch first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {branchStylists.length === 0 && (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          No stylists in {effectiveBranch || "this branch"}. Add one under Manage → Stylists.
                        </div>
                      )}
                      {branchStylists.map((s) => {
                        const taken = takenNames.has(`${effectiveBranch}|${s.name.toLowerCase()}`);
                        return (
                          <SelectItem key={s.id} value={s.name} disabled={taken}>
                            {s.name}
                            {taken ? " · has login" : ""}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Links this login to a stylist so their dashboard shows their bookings.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Temporary password</Label>
                <Input
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="min 8 characters"
                />
              </div>

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
