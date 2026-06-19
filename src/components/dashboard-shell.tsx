import Link from "next/link";
import { Logo } from "@/components/logo";
import { LogoutButton } from "@/components/logout-button";
import type { AuthProfile } from "@/lib/auth";

export function DashboardShell({
  profile,
  children,
}: {
  profile: AuthProfile;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-soft">
      <header className="border-b border-border/50 bg-background/70 backdrop-blur-md sticky top-0 z-40">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Logo className="h-9 w-auto" />
            <div className="text-xs text-muted-foreground capitalize border-l border-border/60 pl-3">
              {profile.role} panel
              {profile.branch ? ` · ${profile.branch}` : ""}
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <div className="text-sm text-muted-foreground hidden sm:block">
              Signed in as{" "}
              <span className="font-medium text-foreground">
                {profile.fullName ?? profile.staffName ?? profile.email}
              </span>
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
