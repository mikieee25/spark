import type { ReactNode } from "react";
import type { SessionUser } from "@/features/auth/types";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Sidebar } from "./sidebar";
import { AnonymousBanner } from "@/components/access/anonymous-banner";
import { BrandLockup } from "./brand-lockup";

export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  return <div className="min-h-screen md:grid md:grid-cols-[16rem_1fr]"><Sidebar user={user} /><div className="min-w-0"><header aria-label="Header" className="flex min-h-20 items-center justify-between border-b border-[var(--line)] bg-[var(--canvas)] px-6 sm:px-8"><div className="flex items-center gap-4"><BrandLockup compact /><div className="border-l border-[var(--line)] pl-4"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--pulse)]">Department of Energy</p><p className="mt-1 text-sm text-[var(--ink-muted)]">Secure records workspace</p></div></div><ThemeToggle /></header><AnonymousBanner /> <main aria-label="Content" className="p-6 sm:p-8">{children}</main></div></div>;
}
