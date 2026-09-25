"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();
  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label="Sign out"
      className="gap-2"
      onClick={signOut}
    >
      <LogOut aria-hidden="true" />
      <span aria-hidden="true" className="hidden sm:inline">
        Sign out
      </span>
    </Button>
  );
}
