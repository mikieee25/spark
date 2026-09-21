"use client";

import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();
  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }
  return <button type="button" onClick={signOut} className="w-full rounded-xl border border-[var(--line)] px-4 py-3 text-left text-sm font-bold hover:bg-[var(--paper-dim)]">Sign out</button>;
}
