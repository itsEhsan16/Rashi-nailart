import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { loginFn } from "@/lib/salon.functions";
import { setSession } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Login — Rashi Nail Art Studio" },
      { name: "description", content: "Staff & admin login for Rashi Nail Art Studio." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const login = useServerFn(loginFn);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await login({ data: { username: username.trim().toLowerCase(), password } });
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setSession(res.session);
    toast.success(`Welcome, ${res.session.username}`);
    if (res.session.role === "admin") navigate({ to: "/admin" });
    else if (res.session.role === "manager") navigate({ to: "/manager" });
    else navigate({ to: "/staff" });
  }

  return (
    <div className="min-h-screen bg-gradient-soft flex flex-col">
      <header className="border-b border-border/50 bg-background/60 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-full bg-gradient-hero grid place-items-center shadow-soft">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-display font-semibold flex flex-col leading-tight">
              <span className="text-xl">Rashi</span>
              <span className="text-sm">Nail Art Studio</span>
            </span>
          </Link>
          <Button variant="ghost" onClick={() => navigate({ to: "/" })}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <Card className="w-full max-w-md p-8 shadow-elegant">
          <h1 className="font-display text-3xl font-semibold text-center">Sign in</h1>
          <p className="mt-2 text-sm text-muted-foreground text-center">
            For Admin, Manager and Staff
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div className="space-y-2">
              <Label>Username</Label>
              <Input
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
              />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-gradient-hero text-primary-foreground"
            >
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>


        </Card>
      </main>
    </div>
  );
}
