import type { SessionUser } from "@/features/auth/types";
import { BrandLockup } from "./brand-lockup";
import { SidebarNav } from "./sidebar-nav";

export function Sidebar({ user }: { user: SessionUser }) {
  return <aside aria-label="Sidebar" className="flex min-h-screen w-64 flex-col border-r border-border bg-card p-5 max-md:min-h-0 max-md:w-full max-md:border-b max-md:border-r-0"><BrandLockup /><SidebarNav user={user} /><div className="mt-auto pt-8 max-md:hidden"><p className="px-1 text-sm"><strong className="block">{user.displayName}</strong><span className="text-muted-foreground">{user.role}</span></p></div></aside>;
}
