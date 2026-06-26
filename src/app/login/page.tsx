import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Building2, User, ChevronRight, LogIn } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/logo";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

const PORTALS = [
  {
    href: "/login/admin",
    label: "Jagruti Mehta",
    desc: "Owner & administrator portal",
    icon: <ShieldCheck className="h-5 w-5" />,
  },
  {
    href: "/login/manager",
    label: "Manager",
    desc: "Your branch's bookings, members & artists",
    icon: <Building2 className="h-5 w-5" />,
  },
  {
    href: "/login/staff",
    label: "Staff",
    desc: "Your appointments",
    icon: <User className="h-5 w-5" />,
  },
];

export default function LoginChooserPage() {
  return (
    <div className="min-h-screen bg-gradient-soft flex flex-col">
      <header className="border-b border-border/50 bg-background/60 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Logo className="h-10 w-auto" />
          </Link>
          <Button asChild variant="ghost">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Link>
          </Button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            <LogIn className="h-5 w-5" />
          </div>
          <h1 className="font-display text-3xl font-semibold text-center">Choose your portal</h1>
          <p className="mt-2 text-sm text-muted-foreground text-center">
            Sign in to the area you manage.
          </p>

          <div className="mt-8 space-y-3">
            {PORTALS.map((p) => (
              <Link key={p.href} href={p.href} className="group block">
                <Card className="flex items-center gap-4 p-4 shadow-soft transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/5 hover:shadow-elegant">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    {p.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{p.label}</div>
                    <div className="text-xs text-muted-foreground">{p.desc}</div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
