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
      <header className="border-b border-border/60 bg-background/70 backdrop-blur-md sticky top-0 z-40">
        <div className="mx-auto max-w-7xl px-6 py-3.5 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3 min-w-0">
            <Logo className="h-9 w-auto shrink-0" />
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium capitalize text-primary">
              <span>{profile.role} panel</span>
              {profile.branch ? (
                <>
                  <span aria-hidden className="text-primary/40">·</span>
                  <span>{profile.branch}</span>
                </>
              ) : null}
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <div className="hidden min-w-0 text-right sm:block">
              <div className="truncate text-sm font-medium leading-tight text-foreground">
                {profile.fullName ?? profile.staffName ?? profile.email}
              </div>
              <div className="text-xs capitalize text-muted-foreground">Signed in as {profile.role}</div>
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
