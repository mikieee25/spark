"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SessionUser } from "@/features/auth/types";
import { cn } from "@/lib/utils";

export function SidebarNav({ user }: { user: SessionUser }) {
  const pathname = usePathname() ?? "";
  const links = [
    { href: "/files", label: "Files" },
    { href: "/recycle", label: "Recycle bin" },
    ...(user.role === "admin" ? [{ href: "/activity", label: "Activity" }, { href: "/admin", label: "Administration" }] : []),
  ];
  return (
    <nav aria-label="Primary" className="mt-10 grid gap-2 max-md:mt-5 max-md:grid-cols-2">
      {links.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return <Link key={link.href} className={cn("rounded-lg px-4 py-3 text-sm font-medium transition-colors hover:bg-muted", active && "bg-accent font-bold text-primary")} href={link.href} aria-current={active ? "page" : undefined}>{link.label}</Link>;
      })}
    </nav>
  );
}
