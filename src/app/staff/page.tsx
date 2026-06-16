import { getCurrentProfile } from "@/lib/auth";
import { BookingsPanel } from "@/components/admin/bookings-panel";

export default async function StaffPage() {
  const profile = await getCurrentProfile();
  return (
    <div>
      <h1 className="font-display text-3xl md:text-4xl font-semibold mb-1">
        Hi {profile?.staffName ?? profile?.fullName ?? "there"} ✨
      </h1>
      <p className="text-muted-foreground mb-6">Your upcoming appointments</p>
      <BookingsPanel role="staff" />
    </div>
  );
}
