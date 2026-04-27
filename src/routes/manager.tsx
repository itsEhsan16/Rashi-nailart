import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { getSession, type Session } from "@/lib/auth";
import { AppointmentsView } from "./admin";

export const Route = createFileRoute("/manager")({
  head: () => ({ meta: [{ title: "Manager — Rashi Nail Art Studio" }] }),
  component: ManagerPage,
});

function ManagerPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    const s = getSession();
    if (!s || s.role !== "manager") { navigate({ to: "/login" }); return; }
    setSession(s);
  }, [navigate]);
  if (!session) return null;
  return (
    <DashboardShell session={session} title="Manager Dashboard">
      <AppointmentsView session={session} canFilter />
    </DashboardShell>
  );
}
