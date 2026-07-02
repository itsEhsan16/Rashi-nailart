import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
import { getCurrentProfile, dashboardPathForRole } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { AdminNav } from "@/components/admin/admin-nav";

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

  return (
    <DashboardShell profile={profile}>
      <PageHeader
        title="Jagruti Mehta — Dashboard"
        subtitle="Owner overview · everything across your studios"
        icon={<LayoutDashboard className="h-5 w-5" />}
      />
      <div className="md:grid md:grid-cols-[200px_1fr] md:gap-5">
        <AdminNav />
        <div className="min-w-0">{children}</div>
      </div>
    </DashboardShell>
  );
}
