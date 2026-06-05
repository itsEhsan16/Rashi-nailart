import { getCurrentProfile } from "@/lib/auth";

export default async function StaffPage() {
  const profile = await getCurrentProfile();
  return (
    <div>
      <h1 className="font-display text-3xl md:text-4xl font-semibold mb-2">
        Hi {profile?.staffName ?? profile?.fullName ?? "there"} ✨
      </h1>
      <p className="text-muted-foreground">
        Your assigned appointments and the &ldquo;mark complete&rdquo; flow are wired up in Phase 6.
      </p>
    </div>
  );
}
