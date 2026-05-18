import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { CalendarIcon, Trash2, X, Crown, CheckCircle2 } from "lucide-react";
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
  listAppointmentsFn, deleteAppointmentFn, completeAppointmentFn,
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
  completed?: boolean;
};


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
  canDelete,
  canComplete,
}: {
  session: Session;
  canFilter?: boolean;
  canDelete?: boolean;
  canComplete?: boolean;
}) {
  const list = useServerFn(listAppointmentsFn);
  const del = useServerFn(deleteAppointmentFn);
  const complete = useServerFn(completeAppointmentFn);
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
                {(canDelete || canComplete) && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={canDelete || canComplete ? 10 : 9} className="text-center py-10 text-muted-foreground">
                    No appointments found.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow
                  key={r.id}
                  className={cn(
                    r.is_member && "bg-primary/5 hover:bg-primary/10",
                    r.payment_status === "pending" && "opacity-60",
                    r.completed && "bg-emerald-500/5"
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
                    {r.completed ? (
                      <Badge className="bg-emerald-600 text-white gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Completed
                      </Badge>
                    ) : r.payment_status === "paid" ? (
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
                  {(canDelete || canComplete) && (
                    <TableCell className="text-right space-x-1 whitespace-nowrap">
                      {canComplete && !r.completed && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            const res = await complete({ data: { staffId: session.id, appointmentId: r.id } });
                            if (!res.ok) { toast.error(res.error); return; }
                            toast.success("Marked complete");
                            void load();
                          }}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Complete
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={async () => {
                            if (!confirm(`Delete appointment for ${r.client_name}?`)) return;
                            const res = await del({ data: { adminId: session.id, appointmentId: r.id } });
                            if (!res.ok) { toast.error(res.error); return; }
                            toast.success("Appointment deleted");
                            void load();
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
