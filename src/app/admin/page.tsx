import { DashboardTabs } from "@/components/admin/dashboard-tabs";

export default function AdminPage() {
  return (
    <div>
      <h1 className="font-display text-3xl md:text-4xl font-semibold mb-6">Jagruti Mehta — Dashboard</h1>
      <DashboardTabs role="admin" branch={null} />
    </div>
  );
}
