import { getCurrentProfile } from "@/lib/auth";
import { StaffDashboard } from "@/components/staff/staff-dashboard";

export default async function StaffPage() {
  const profile = await getCurrentProfile();
  const greetingName = profile?.fullName ?? profile?.staffName ?? "there";
  return <StaffDashboard greetingName={greetingName} />;
}
