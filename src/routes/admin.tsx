import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { CalendarIcon, Trash2, UserPlus, X, Crown } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import { DashboardShell } from "@/components/DashboardShell";
import { CredentialsManager } from "@/components/CredentialsManager";
import { getSession, type Session } from "@/lib/auth";
import { BRANCHES, type Branch } from "@/lib/salon-data";
import {
  listAppointmentsFn, deleteAppointmentFn,
} from "@/lib/salon.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — Rashi Nail Art Studio" }] }),
  component: AdminPage,
});

type Appt = {
  id: string;
  client_name: string;
  phone: string;
  branch: string;
  appointment_date: string;
  time_slot: string;
  service: string;
  price: number;
  staff_name: string;
  special_requests: string | null;
  created_at: string;
  payment_status?: string;
  is_member?: boolean;
  discount_applied?: number;
};
type StaffRow = { id: string; name: string; branch: string };

function AdminPage() {
  const navigate = useNavigate();
  const [session, setSessionState] = useState<Session | null>(null);

  useEffect(() => {
    const s = getSession();
    if (!s || s.role !== "admin") {
      navigate({ to: "/login" });
      return;
    }
    setSessionState(s);
  }, [navigate]);

  if (!session) return null;

  return (
    <DashboardShell session={session} title="Admin Dashboard">
      <Tabs defaultValue="appointments">
        <TabsList>
          <TabsTrigger value="appointments">Appointments</TabsTrigger>
          <TabsTrigger value="credentials">Login Credentials</TabsTrigger>
        </TabsList>
        <TabsContent value="appointments" className="mt-6">
          <AppointmentsView session={session} canFilter canDelete />
        </TabsContent>
        <TabsContent value="credentials" className="mt-6">
          <CredentialsManager session={session} />
        </TabsContent>
      </Tabs>
    </DashboardShell>
  );
}

export function AppointmentsView({
  session,
  canFilter,
}: {
  session: Session;
  canFilter?: boolean;
}) {
  const list = useServerFn(listAppointmentsFn);
  const [rows, setRows] = useState<Appt[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState<Date | undefined>();
  const [branch, setBranch] = useState<string>("");
  const [staff, setStaff] = useState<string>("");

  async function load() {
    setLoading(true);
    const res = await list({
      data: {
        session: {
          id: session.id,
          role: session.role,
          branch: session.branch,
          staffName: session.staffName,
        },
        filters: canFilter
          ? {
              date: date ? format(date, "yyyy-MM-dd") : undefined,
              branch: (branch || undefined) as Branch | undefined,
              staff: staff || undefined,
            }
          : undefined,
      },
    });
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setRows(res.appointments as Appt[]);
  }

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [date, branch, staff]);

  return (
    <div className="space-y-4">
      {canFilter && (
        <Card className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-44 justify-start text-left font-normal", !date && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "PP") : "Any date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={date} onSelect={setDate} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Branch</Label>
              <Select value={branch} onValueChange={setBranch}>
                <SelectTrigger className="w-40"><SelectValue placeholder="All branches" /></SelectTrigger>
                <SelectContent>
                  {BRANCHES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Staff</Label>
              <Input className="w-40" value={staff} onChange={(e) => setStaff(e.target.value)} placeholder="Staff name" />
            </div>
            {(date || branch || staff) && (
              <Button variant="ghost" size="sm" onClick={() => { setDate(undefined); setBranch(""); setStaff(""); }}>
                <X className="mr-1 h-4 w-4" /> Clear
              </Button>
            )}
            <div className="ml-auto text-sm text-muted-foreground">
              {loading ? "Loading..." : `${rows.length} appointment${rows.length === 1 ? "" : "s"}`}
            </div>
          </div>
        </Card>
      )}

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Staff</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                    No appointments found.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow
                  key={r.id}
                  className={cn(
                    r.is_member && "bg-primary/5 hover:bg-primary/10",
                    r.payment_status === "pending" && "opacity-60"
                  )}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {r.client_name}
                      {r.is_member && (
                        <Badge className="bg-primary text-primary-foreground gap-1">
                          <Crown className="h-3 w-3" /> Member
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{r.phone}</TableCell>
                  <TableCell><Badge variant="secondary">{r.branch}</Badge></TableCell>
                  <TableCell>{format(new Date(r.appointment_date), "dd MMM yyyy")}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.time_slot}</TableCell>
                  <TableCell>
                    <div>{r.service}</div>
                    <div className="text-xs text-muted-foreground">
                      ₹{r.price}
                      {r.discount_applied && r.discount_applied > 0 ? (
                        <span className="ml-1 text-primary">(−₹{r.discount_applied})</span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>{r.staff_name}</TableCell>
                  <TableCell>
                    {r.payment_status === "paid" ? (
                      <Badge className="bg-emerald-600 text-white">Paid</Badge>
                    ) : r.payment_status === "cancelled" ? (
                      <Badge variant="destructive">Cancelled</Badge>
                    ) : (
                      <Badge variant="outline">Pending</Badge>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[220px] text-sm text-muted-foreground">
                    {r.special_requests || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function StaffManager({ session }: { session: Session }) {
  const listStaff = useServerFn(listStaffFn);
  const addStaff = useServerFn(addStaffFn);
  const removeStaff = useServerFn(removeStaffFn);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [name, setName] = useState("");
  const [branch, setBranch] = useState<Branch | "">("");

  async function load() {
    const res = await listStaff();
    if (res.ok) setStaff(res.staff as StaffRow[]);
  }
  useEffect(() => { void load(); }, []);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !branch) {
      toast.error("Enter name and branch");
      return;
    }
    const res = await addStaff({ data: { adminId: session.id, name: name.trim(), branch } });
    if (!res.ok) { toast.error(res.error); return; }
    toast.success("Staff added");
    setName(""); setBranch("");
    void load();
  }

  async function onRemove(id: string) {
    const res = await removeStaff({ data: { adminId: session.id, staffId: id } });
    if (!res.ok) { toast.error(res.error); return; }
    toast.success("Staff removed");
    void load();
  }

  const grouped = BRANCHES.map((b) => ({ branch: b, members: staff.filter((s) => s.branch === b) }));

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <Card className="p-6 lg:col-span-1 h-fit">
        <h3 className="font-display text-xl font-semibold flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-primary" /> Add Staff
        </h3>
        <form onSubmit={onAdd} className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
          </div>
          <div className="space-y-1.5">
            <Label>Branch</Label>
            <Select value={branch} onValueChange={(v) => setBranch(v as Branch)}>
              <SelectTrigger><SelectValue placeholder="Choose branch" /></SelectTrigger>
              <SelectContent>
                {BRANCHES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" className="w-full bg-gradient-hero text-primary-foreground">
            Add Staff Member
          </Button>
        </form>
      </Card>

      <div className="lg:col-span-2 space-y-6">
        {grouped.map((g) => (
          <Card key={g.branch} className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-xl font-semibold">{g.branch}</h3>
              <Badge variant="secondary">{g.members.length} members</Badge>
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              {g.members.length === 0 && (
                <div className="text-sm text-muted-foreground">No staff yet.</div>
              )}
              {g.members.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 bg-background">
                  <span className="font-medium">{m.name}</span>
                  <Button size="icon" variant="ghost" onClick={() => onRemove(m.id)} className="h-8 w-8 text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
