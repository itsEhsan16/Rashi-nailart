import { Building2 } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth";
import { DashboardTabs } from "@/components/admin/dashboard-tabs";
import { PageHeader } from "@/components/dashboard/page-header";

export default async function ManagerPage() {
  const profile = await getCurrentProfile();
  return (
    <div>
      <PageHeader
        title="Manager Dashboard"
        subtitle={profile?.branch ?? "Your branch"}
        icon={<Building2 className="h-5 w-5" />}
      />
      <DashboardTabs role="manager" branch={profile?.branch ?? null} />
    </div>
  );
}
