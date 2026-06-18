"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Building2, Scissors } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/logo";
import { signIn } from "@/lib/actions/auth";
import { signInSchema, type SignInValues } from "@/lib/validations/auth";
import type { UserRole } from "@/lib/auth";

const CONFIG: Record<
  UserRole,
  { title: string; desc: string; icon: React.ReactNode; placeholder: string }
> = {
  admin: {
    title: "Admin sign in",
    desc: "Owner & administrator portal",
    icon: <ShieldCheck className="h-5 w-5" />,
    placeholder: "admin@rashi.studio",
  },
  manager: {
    title: "Manager sign in",
    desc: "Branch manager portal",
    icon: <Building2 className="h-5 w-5" />,
    placeholder: "manager@rashi.studio",
  },
  staff: {
    title: "Staff sign in",
    desc: "Stylist portal",
    icon: <Scissors className="h-5 w-5" />,
    placeholder: "you@rashi.studio",
  },
};

const OTHER_PORTALS: Record<UserRole, { href: string; label: string }[]> = {
  admin: [
    { href: "/login/manager", label: "Manager" },
    { href: "/login/staff", label: "Staff" },
  ],
  manager: [
    { href: "/login/admin", label: "Admin" },
    { href: "/login/staff", label: "Staff" },
  ],
  staff: [
    { href: "/login/admin", label: "Admin" },
    { href: "/login/manager", label: "Manager" },
  ],
};

export function PortalLogin({ role }: { role: UserRole }) {
  const cfg = CONFIG[role];
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: SignInValues) {
    const res = await signIn(values, role);
    // On success the server action redirects; only failures return here.
    if (res?.error) toast.error(res.error);
  }

  return (
    <div className="min-h-screen bg-gradient-soft flex flex-col">
      <header className="border-b border-border/50 bg-background/60 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Logo className="h-10 w-auto" />
          </Link>
          <Button asChild variant="ghost">
            <Link href="/login">
              <ArrowLeft className="mr-2 h-4 w-4" /> All portals
            </Link>
          </Button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <Card className="w-full max-w-md p-8 shadow-elegant">
          <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-primary/10 text-primary grid place-items-center">
            {cfg.icon}
          </div>
          <h1 className="font-display text-3xl font-semibold text-center">{cfg.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground text-center">{cfg.desc}</p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                placeholder={cfg.placeholder}
                aria-invalid={!!errors.email}
                {...register("email")}
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                aria-invalid={!!errors.password}
                {...register("password")}
              />
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-11 bg-gradient-hero text-primary-foreground"
            >
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Not a {role}?{" "}
            {OTHER_PORTALS[role].map((p, i) => (
              <span key={p.href}>
                <Link href={p.href} className="underline underline-offset-4 hover:text-foreground">
                  {p.label}
                </Link>
                {i === 0 ? " · " : ""}
              </span>
            ))}{" "}
            login
          </p>
        </Card>
      </main>
    </div>
  );
}
