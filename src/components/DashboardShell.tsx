import { Link, useNavigate } from "@tanstack/react-router";
import { Sparkles, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clearSession, type Session } from "@/lib/auth";

export function DashboardShell({
  session,
  title,
  children,
}: {
  session: Session;
  title: string;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gradient-soft">
      <header className="border-b border-border/50 bg-background/70 backdrop-blur-md sticky top-0 z-10">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-full bg-gradient-hero grid place-items-center shadow-soft">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <div className="font-display text-lg font-semibold leading-tight">Belle Nails</div>
              <div className="text-xs text-muted-foreground capitalize">{session.role} panel</div>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <div className="text-sm text-muted-foreground hidden sm:block">
              Signed in as <span className="font-medium text-foreground">{session.username}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                clearSession();
                navigate({ to: "/login" });
              }}
            >
              <LogOut className="mr-2 h-4 w-4" /> Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <h1 className="font-display text-3xl md:text-4xl font-semibold mb-6">{title}</h1>
        {children}
      </main>
    </div>
  );
}
