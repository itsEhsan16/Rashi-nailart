import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardShell } from "@/components/DashboardShell";
import { CredentialsManager } from "@/components/CredentialsManager";
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
      <Tabs defaultValue="appointments">
        <TabsList>
          <TabsTrigger value="appointments">Appointments</TabsTrigger>
          <TabsTrigger value="credentials">Login Credentials</TabsTrigger>
        </TabsList>
        <TabsContent value="appointments" className="mt-6">
          <AppointmentsView session={session} canFilter />
        </TabsContent>
        <TabsContent value="credentials" className="mt-6">
          <CredentialsManager session={session} />
        </TabsContent>
      </Tabs>
    </DashboardShell>
  );
}
