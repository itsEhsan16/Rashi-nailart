"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/actions/auth";

export function LogoutButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(() => void signOut())}
    >
      <LogOut className="mr-2 h-4 w-4" />
      {pending ? "Signing out…" : "Logout"}
    </Button>
  );
}
