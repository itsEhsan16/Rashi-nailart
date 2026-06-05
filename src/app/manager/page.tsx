import { getCurrentProfile } from "@/lib/auth";
import { DashboardTabs } from "@/components/admin/dashboard-tabs";

export default async function ManagerPage() {
  const profile = await getCurrentProfile();
  return (
    <div>
      <h1 className="font-display text-3xl md:text-4xl font-semibold mb-1">Manager Dashboard</h1>
      <p className="text-muted-foreground mb-6">{profile?.branch ?? "Your branch"}</p>
      <DashboardTabs role="manager" branch={profile?.branch ?? null} />
    </div>
  );
}
