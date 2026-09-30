"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SessionUser } from "@/features/auth/types";
import { cn } from "@/lib/utils";

export function SidebarNav({ user }: { user: SessionUser }) {
  const pathname = usePathname() ?? "";
  const workspaceLinks = [
    { href: "/files", label: "Files" },
    { href: "/recycle", label: "Recycle bin" },
    ...(user.role === "admin"
      ? [{ href: "/activity", label: "Activity" }]
      : []),
  ];
  const adminLinks =
    user.role === "admin"
      ? [{ href: "/admin", label: "Administration" }]
      : [];
  function renderLink(link: (typeof workspaceLinks)[number]) {
    const active =
      pathname === link.href || pathname.startsWith(`${link.href}/`);
    return (
      <Link
        key={link.href}
        prefetch={false}
        className={cn(
          "rounded-lg px-4 py-3 text-sm font-medium transition-colors hover:bg-muted",
          active && "bg-accent font-bold text-primary"
        )}
        href={link.href}
        aria-current={active ? "page" : undefined}
      >
        {link.label}
      </Link>
    );
  }
  return (
    <nav
      aria-label="Primary"
      className="mt-10 grid gap-5 max-md:mt-5 max-md:gap-3"
    >
      <div className="grid gap-1">
        <p className="px-4 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Workspace
        </p>
        {workspaceLinks.map(renderLink)}
      </div>
      {adminLinks.length > 0 && (
        <div className="grid gap-1">
          <p className="px-4 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Administration
          </p>
          {adminLinks.map(renderLink)}
        </div>
      )}
    </nav>
  );
}
