import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Building2, Scissors, ChevronRight } from "lucide-react";

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
    desc: "Your branch's bookings, members & stylists",
    icon: <Building2 className="h-5 w-5" />,
  },
  {
    href: "/login/staff",
    label: "Staff",
    desc: "Your appointments",
    icon: <Scissors className="h-5 w-5" />,
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
          <h1 className="font-display text-3xl font-semibold text-center">Choose your portal</h1>
          <p className="mt-2 text-sm text-muted-foreground text-center">
            Sign in to the area you manage.
          </p>

          <div className="mt-8 space-y-3">
            {PORTALS.map((p) => (
              <Link key={p.href} href={p.href} className="block">
                <Card className="p-4 flex items-center gap-4 transition-colors hover:border-primary/50 hover:bg-primary/5">
                  <div className="h-11 w-11 shrink-0 rounded-full bg-primary/10 text-primary grid place-items-center">
                    {p.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{p.label}</div>
                    <div className="text-xs text-muted-foreground">{p.desc}</div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
