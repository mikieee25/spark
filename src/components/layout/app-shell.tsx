import type { ReactNode } from "react";
import type { SessionUser } from "@/features/auth/types";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Sidebar } from "./sidebar";
import { AnonymousBanner } from "@/components/access/anonymous-banner";
import { BrandLockup } from "./brand-lockup";
import { SignOutButton } from "./sign-out-button";

export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  return <div className="min-h-screen md:grid md:grid-cols-[16rem_1fr]"><Sidebar user={user} /><div className="min-w-0"><header aria-label="Header" className="flex min-h-20 items-center justify-between border-b border-border bg-background px-6 sm:px-8"><div className="flex min-w-0 items-center gap-4"><BrandLockup compact /><div className="min-w-0 border-l border-border pl-4"><p className="truncate text-xs font-bold uppercase tracking-[0.2em] text-pulse">Department of Energy</p><p className="mt-1 truncate text-sm text-muted-foreground">Secure records workspace</p></div></div><div aria-label="Header actions" className="flex shrink-0 items-center gap-2"><ThemeToggle /><SignOutButton /></div></header><AnonymousBanner /> <main aria-label="Content" className="p-6 sm:p-8">{children}</main></div></div>;
}
