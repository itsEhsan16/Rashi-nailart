import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, KeyRound, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

import { type Session } from "@/lib/auth";
import { BRANCHES, type Branch } from "@/lib/salon-data";
import {
  bulkCreateCredentialsFn,
  createCredentialFn,
  deleteCredentialFn,
  listCredentialsFn,
  resetCredentialPasswordFn,
} from "@/lib/salon.functions";

type AppUser = {
  id: string;
  username: string;
  role: "admin" | "manager" | "staff";
  branch: string | null;
  staff_name: string | null;
  created_at: string;
};

type CreatedCred = { staff_name: string; branch: string; username: string; password: string };

function copy(text: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success("Copied"),
    () => toast.error("Copy failed"),
  );
}

export function CredentialsManager({ session }: { session: Session }) {
  const listFn = useServerFn(listCredentialsFn);
  const createFn = useServerFn(createCredentialFn);
  const bulkFn = useServerFn(bulkCreateCredentialsFn);
  const resetFn = useServerFn(resetCredentialPasswordFn);
  const deleteFn = useServerFn(deleteCredentialFn);

  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);

  // individual create
  const [staffName, setStaffName] = useState("");
  const [role, setRole] = useState<"staff" | "manager">("staff");
  const [branch, setBranch] = useState<Branch | "">("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // bulk create
  const [bulkBranch, setBulkBranch] = useState<Branch | "all">("all");
  const [bulkPassword, setBulkPassword] = useState("");

  // result dialog
  const [resultOpen, setResultOpen] = useState(false);
  const [resultCreds, setResultCreds] = useState<CreatedCred[]>([]);
  const [resultSkipped, setResultSkipped] = useState<{ staff_name: string; reason: string }[]>([]);
  const [resultTitle, setResultTitle] = useState("Credentials created");

  async function load() {
    setLoading(true);
    const res = await listFn({ data: { actorId: session.id } });
    setLoading(false);
    if (!res.ok) { toast.error(res.error); return; }
    setUsers(res.users as AppUser[]);
  }
  useEffect(() => { void load(); }, []);

  const staffUsers = useMemo(() => users.filter((u) => u.role !== "admin"), [users]);

  async function onCreateOne(e: React.FormEvent) {
    e.preventDefault();
    if (!staffName.trim() || !username.trim() || !password) {
      toast.error("Fill all fields");
      return;
    }
    if (role === "staff" && !branch) {
      toast.error("Choose a branch for staff");
      return;
    }
    const res = await createFn({
      data: {
        actorId: session.id,
        credential: {
          username: username.trim().toLowerCase(),
          password,
          staff_name: staffName.trim(),
          branch: role === "staff" ? (branch as Branch) : null,
          role,
        },
      },
    });
    if (!res.ok) { toast.error(res.error); return; }
    setResultTitle("Credential created");
    setResultCreds([{
      staff_name: staffName.trim(),
      branch: role === "staff" ? (branch as string) : "Manager",
      username: res.credential.username,
      password: res.credential.password,
    }]);
    setResultSkipped([]);
    setResultOpen(true);
    setStaffName(""); setBranch(""); setUsername(""); setPassword(""); setRole("staff");
    void load();
  }

  async function onBulk() {
    const res = await bulkFn({
      data: {
        actorId: session.id,
        branch: bulkBranch === "all" ? undefined : bulkBranch,
        defaultPassword: bulkPassword || undefined,
      },
    });
    if (!res.ok) { toast.error(res.error); return; }
    setResultTitle(`Bulk: ${res.created.length} created, ${res.skipped.length} skipped`);
    setResultCreds(res.created);
    setResultSkipped(res.skipped);
    setResultOpen(true);
    void load();
  }

  async function onReset(userId: string) {
    const res = await resetFn({ data: { actorId: session.id, userId } });
    if (!res.ok) { toast.error(res.error); return; }
    setResultTitle("Password reset");
    setResultCreds([{
      staff_name: res.username,
      branch: "",
      username: res.username,
      password: res.password,
    }]);
    setResultSkipped([]);
    setResultOpen(true);
  }

  async function onDelete(userId: string) {
    if (!confirm("Delete this login?")) return;
    const res = await deleteFn({ data: { actorId: session.id, userId } });
    if (!res.ok) { toast.error(res.error); return; }
    toast.success("Login deleted");
    void load();
  }

  function copyAll() {
    const lines = resultCreds.map(
      (c) => `${c.staff_name}${c.branch ? ` (${c.branch})` : ""} — username: ${c.username} | password: ${c.password}`,
    );
    copy(lines.join("\n"));
  }

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Individual */}
        <Card className="p-6">
          <h3 className="font-display text-xl font-semibold flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" /> Create individual login
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Set a custom username & password for one staff member.
          </p>
          <form onSubmit={onCreateOne} className="mt-4 grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5 sm:col-span-1">
              <Label>Name</Label>
              <Input value={staffName} onChange={(e) => setStaffName(e.target.value)} placeholder="Divya" />
            </div>
            <div className="space-y-1.5 sm:col-span-1">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as "staff" | "manager")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {role === "staff" && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Branch</Label>
                <Select value={branch} onValueChange={(v) => setBranch(v as Branch)}>
                  <SelectTrigger><SelectValue placeholder="Choose branch" /></SelectTrigger>
                  <SelectContent>
                    {BRANCHES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5 sm:col-span-1">
              <Label>Username</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} placeholder="divya" />
            </div>
            <div className="space-y-1.5 sm:col-span-1">
              <Label>Password</Label>
              <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min 6 chars" />
            </div>
            <Button type="submit" className="sm:col-span-2 bg-gradient-hero text-primary-foreground">
              Create login
            </Button>
          </form>
        </Card>

        {/* Bulk */}
        <Card className="p-6">
          <h3 className="font-display text-xl font-semibold flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" /> Bulk create logins
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Auto-generate logins for all staff members who don't have one yet. Usernames come from staff name.
          </p>
          <div className="mt-4 grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Branch</Label>
              <Select value={bulkBranch} onValueChange={(v) => setBulkBranch(v as Branch | "all")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All branches</SelectItem>
                  {BRANCHES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Default password (optional)</Label>
              <Input
                value={bulkPassword}
                onChange={(e) => setBulkPassword(e.target.value)}
                placeholder="Leave blank to auto-generate"
              />
            </div>
            <Button onClick={onBulk} className="sm:col-span-2 bg-gradient-hero text-primary-foreground">
              Generate logins
            </Button>
          </div>
        </Card>
      </div>

      {/* Existing logins */}
      <Card>
        <div className="p-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold">Staff logins</h3>
          <span className="text-sm text-muted-foreground">
            {loading ? "Loading..." : `${staffUsers.length} login${staffUsers.length === 1 ? "" : "s"}`}
          </span>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead>Staff name</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staffUsers.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    No staff logins yet.
                  </TableCell>
                </TableRow>
              )}
              {staffUsers.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-mono">{u.username}</TableCell>
                  <TableCell>{u.staff_name}</TableCell>
                  <TableCell>{u.branch && <Badge variant="secondary">{u.branch}</Badge>}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button size="sm" variant="outline" onClick={() => onReset(u.id)}>
                      <KeyRound className="h-4 w-4 mr-1" /> Reset password
                    </Button>
                    <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => onDelete(u.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={resultOpen} onOpenChange={setResultOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{resultTitle}</DialogTitle>
            <DialogDescription>
              Save these credentials now — passwords cannot be retrieved later. Share them with each staff member securely.
            </DialogDescription>
          </DialogHeader>

          {resultCreds.length > 0 && (
            <div className="rounded-lg border border-border/60 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>Password</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resultCreds.map((c, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        {c.staff_name}
                        {c.branch && <div className="text-xs text-muted-foreground">{c.branch}</div>}
                      </TableCell>
                      <TableCell className="font-mono">{c.username}</TableCell>
                      <TableCell className="font-mono">{c.password}</TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => copy(`${c.username} / ${c.password}`)}>
                          <Copy className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {resultSkipped.length > 0 && (
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <div className="font-medium mb-1">Skipped ({resultSkipped.length})</div>
              <ul className="space-y-0.5 text-muted-foreground">
                {resultSkipped.map((s, i) => (
                  <li key={i}>• {s.staff_name} — {s.reason}</li>
                ))}
              </ul>
            </div>
          )}

          <DialogFooter>
            {resultCreds.length > 0 && (
              <Button variant="outline" onClick={copyAll}>
                <Copy className="h-4 w-4 mr-1" /> Copy all
              </Button>
            )}
            <Button onClick={() => setResultOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
