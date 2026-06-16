import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentProfile, dashboardPathForRole } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard-shell";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login/admin");
  if (profile.role !== "admin") redirect(dashboardPathForRole(profile.role));

  return <DashboardShell profile={profile}>{children}</DashboardShell>;
}
