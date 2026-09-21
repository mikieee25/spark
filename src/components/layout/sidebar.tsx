import Link from "next/link";
import type { SessionUser } from "@/features/auth/types";
import { BrandLockup } from "./brand-lockup";
import { SignOutButton } from "./sign-out-button";

export function Sidebar({ user }: { user: SessionUser }) {
  return <aside aria-label="Sidebar" className="flex min-h-screen w-64 flex-col border-r border-[var(--line)] bg-[var(--paper)] p-5 max-md:min-h-0 max-md:w-full max-md:border-b max-md:border-r-0"><BrandLockup /><nav aria-label="Primary" className="mt-10 grid gap-2 max-md:mt-5 max-md:grid-cols-3"><Link className="rounded-xl bg-[var(--pulse-soft)] px-4 py-3 font-bold text-[var(--pulse)]" href="/files">Files</Link><Link className="rounded-xl px-4 py-3 text-[var(--ink-muted)] hover:bg-[var(--paper-dim)]" href="/activity">Activity</Link>{user.role === "admin" && <Link className="rounded-xl px-4 py-3 text-[var(--ink-muted)] hover:bg-[var(--paper-dim)]" href="/admin">Administration</Link>}</nav><div className="mt-auto pt-8 max-md:hidden"><p className="mb-3 px-1 text-sm"><strong className="block">{user.displayName}</strong><span className="text-[var(--ink-muted)]">{user.role}</span></p><SignOutButton /></div></aside>;
}
