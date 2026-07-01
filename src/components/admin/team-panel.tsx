"use client";

import { useCallback, useEffect, useState } from "react";
import { UserPlus, KeyRound, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectionHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { TeamPageSkeleton } from "@/components/dashboard/skeletons";
import { Users } from "lucide-react";
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
import { StaffAvatar } from "@/components/staff-avatar";
import { staffPhotoUrl } from "@/lib/staff-photos";
import { StaffDetail } from "./staff-detail";

type BranchName = (typeof BRANCHES)[number];

export function TeamPanel({ role, branch }: { role: UserRole; branch: string | null }) {
  const isAdmin = role === "admin";
  const [rows, setRows] = useState<TeamRow[]>([]);
  const [stylists, setStylists] = useState<StaffRow[]>([]);
  const [selected, setSelected] = useState<StaffRow | null>(null);
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
      return toast.error("Choose the artist this login belongs to.");
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

  const roleBadge = (t: TeamRow) => (
    <Badge
      variant={t.role === "admin" ? "default" : t.role === "manager" ? "secondary" : "outline"}
      className="capitalize"
    >
      {t.role}
    </Badge>
  );

  const teamActions = (t: TeamRow) =>
    t.role !== "admin" ? (
      <div className="flex flex-wrap items-center justify-end gap-1">
        <Button size="sm" variant="outline" onClick={() => onReset(t)}>
          <KeyRound className="mr-1 h-4 w-4" /> Reset
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={() => onDelete(t)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    ) : null;

  if (selected) {
    return (
      <StaffDetail
        staff={selected}
        canEdit
        onBack={() => setSelected(null)}
        onPhotoChanged={load}
      />
    );
  }

  // First load: show a skeleton in the shape of the team page. Refetches after
  // a mutation keep the existing data on screen instead of flashing back to this.
  if (loading && rows.length === 0 && stylists.length === 0) {
    return <TeamPageSkeleton />;
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <SectionHeader
          title="Employees"
          description={
            loading
              ? "Loading…"
              : `${stylists.length} ${stylists.length === 1 ? "stylist" : "stylists"} · tap to open`
          }
        />
        {stylists.length === 0 && !loading ? (
          <Card className="rounded-xl shadow-soft">
            <EmptyState
              icon={<Users className="h-6 w-6" />}
              title="No stylists yet"
              description="Add stylists under Manage → Artists, then open them here."
            />
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {stylists.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelected(s)}
                className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3 text-left shadow-soft transition-colors hover:border-border hover:bg-muted/40"
              >
                <StaffAvatar
                  name={s.name}
                  photoUrl={s.photo_url ?? staffPhotoUrl(s.name)}
                  className="h-12 w-12"
                />
                <div className="min-w-0">
                  <div className="truncate font-medium">{s.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {s.branch}
                    {s.store_number ? ` · Studio ${s.store_number}` : ""}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <SectionHeader
        title="Team logins"
        description={loading ? "Loading…" : `${rows.length} login${rows.length === 1 ? "" : "s"}`}
        actions={
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
                  <Label>Artist (for bookings)</Label>
                  <Select
                    value={form.staff_name}
                    onValueChange={(v) => setForm({ ...form, staff_name: v })}
                    disabled={!effectiveBranch}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={effectiveBranch ? "Choose artist" : "Pick a branch first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {branchStylists.length === 0 && (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          No artists in {effectiveBranch || "this branch"}. Add one under Manage → Artists.
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
                    Links this login to an artist so their dashboard shows their bookings.
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
        }
      />

      {rows.length === 0 && !loading && (
        <Card className="rounded-xl shadow-soft">
          <EmptyState icon={<Users className="h-6 w-6" />} title="No team logins yet" description="Add staff and manager logins so they can access their dashboards." />
        </Card>
      )}

      {/* Desktop table */}
      <Card className={rows.length === 0 ? "hidden" : "hidden rounded-xl shadow-soft md:block"}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="sticky top-0 z-10 border-b border-border bg-muted/40 backdrop-blur hover:bg-muted/40 [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide">
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.full_name ?? t.staff_name ?? "—"}</TableCell>
                  <TableCell className="font-mono text-sm">{t.email}</TableCell>
                  <TableCell>{roleBadge(t)}</TableCell>
                  <TableCell>{t.branch && <Badge variant="secondary">{t.branch}</Badge>}</TableCell>
                  <TableCell className="text-right">{teamActions(t)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {rows.map((t) => (
          <Card key={`m-${t.id}`} className="rounded-xl p-4 shadow-soft transition-colors hover:border-border">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-medium">{t.full_name ?? t.staff_name ?? "—"}</div>
                <div className="truncate font-mono text-xs text-muted-foreground">{t.email}</div>
              </div>
              <div className="flex flex-col items-end gap-1">
                {roleBadge(t)}
                {t.branch && <Badge variant="secondary">{t.branch}</Badge>}
              </div>
            </div>
            {t.role !== "admin" && (
              <div className="mt-3 flex flex-wrap justify-end border-t border-border/60 pt-3">{teamActions(t)}</div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
