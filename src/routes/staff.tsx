import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { CalendarDays, Clock, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { DashboardShell } from "@/components/DashboardShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSession, type Session } from "@/lib/auth";
import { listAppointmentsFn, completeAppointmentFn } from "@/lib/salon.functions";

export const Route = createFileRoute("/staff")({
  head: () => ({ meta: [{ title: "Staff — Rashi Nail Art Studio" }] }),
  component: StaffPage,
});

type StaffAppt = {
  id: string;
  client_name: string;
  appointment_date: string;
  time_slot: string;
  service: string;
  special_requests: string | null;
  completed?: boolean;
};

function StaffPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [rows, setRows] = useState<StaffAppt[]>([]);
  const [loading, setLoading] = useState(true);
  const list = useServerFn(listAppointmentsFn);
  const complete = useServerFn(completeAppointmentFn);

  useEffect(() => {
    const s = getSession();
    if (!s || s.role !== "staff") { navigate({ to: "/login" }); return; }
    setSession(s);
  }, [navigate]);

  async function load(s: Session) {
    const res = await list({
      data: {
        session: {
          id: s.id, role: s.role,
          branch: s.branch, staffName: s.staffName,
        },
      },
    });
    setLoading(false);
    if (res.ok) setRows(res.appointments as StaffAppt[]);
  }

  useEffect(() => {
    if (!session) return;
    void load(session);
    // eslint-disable-next-line
  }, [session]);

  async function onComplete(id: string) {
    if (!session) return;
    const res = await complete({ data: { staffId: session.id, appointmentId: id } });
    if (!res.ok) { toast.error(res.error); return; }
    toast.success("Appointment marked complete");
    void load(session);
  }

  if (!session) return null;

  return (
    <DashboardShell session={session} title={`Hi ${session.staffName ?? session.username} ✨`}>
      <p className="text-muted-foreground -mt-4 mb-6">Your upcoming appointments</p>

      {loading && <div className="text-muted-foreground">Loading...</div>}
      {!loading && rows.length === 0 && (
        <Card className="p-10 text-center text-muted-foreground">
          No appointments assigned to you yet.
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {rows.map((r) => (
          <Card key={r.id} className={`p-5 shadow-soft hover:shadow-elegant transition-shadow ${r.completed ? "opacity-70" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Client</div>
                <div className="font-display text-xl font-semibold">{r.client_name}</div>
              </div>
              <Badge className="bg-gradient-hero text-primary-foreground">{r.service}</Badge>
            </div>
            <div className="mt-4 flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4 text-primary" />
                {format(new Date(r.appointment_date), "EEE, dd MMM yyyy")}
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-primary" />
                {r.time_slot}
              </div>
            </div>
            {r.special_requests && (
              <div className="mt-4 rounded-lg bg-muted/60 p-3 text-sm">
                <div className="text-xs font-medium text-muted-foreground mb-1">Special requests</div>
                {r.special_requests}
              </div>
            )}
            <div className="mt-4 flex justify-end">
              {r.completed ? (
                <Badge className="bg-emerald-600 text-white gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Completed
                </Badge>
              ) : (
                <Button size="sm" onClick={() => onComplete(r.id)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Mark Complete
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </DashboardShell>
  );
}
