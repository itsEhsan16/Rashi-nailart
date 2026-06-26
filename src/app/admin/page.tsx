import { LayoutDashboard } from "lucide-react";
import { DashboardTabs } from "@/components/admin/dashboard-tabs";
import { PageHeader } from "@/components/dashboard/page-header";

export default function AdminPage() {
  return (
    <div>
      <PageHeader
        title="Jagruti Mehta — Dashboard"
        subtitle="Owner overview · everything across your studios"
        icon={<LayoutDashboard className="h-5 w-5" />}
      />
      <DashboardTabs role="admin" branch={null} />
    </div>
  );
}
