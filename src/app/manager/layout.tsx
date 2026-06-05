import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentProfile, dashboardPathForRole } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard-shell";

export const metadata: Metadata = {
  title: "Manager",
  robots: { index: false, follow: false },
};

export default async function ManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login?redirect=/manager");
  if (profile.role !== "manager") redirect(dashboardPathForRole(profile.role));

  return <DashboardShell profile={profile}>{children}</DashboardShell>;
}
