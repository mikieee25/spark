import type { ReactNode } from "react";
import Image from "next/image";
import type { SessionUser } from "@/features/auth/types";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Sidebar } from "./sidebar";
import { AnonymousBanner } from "@/components/access/anonymous-banner";
import { SignOutButton } from "./sign-out-button";

export function AppShell({
  user,
  children,
}: {
  user: SessionUser;
  children: ReactNode;
}) {
  return (
    <div data-app-shell className="min-h-screen md:grid md:grid-cols-[16rem_1fr]">
      <Sidebar user={user} />
      <div data-app-content className="min-w-0">
        <header
          aria-label="Header"
          className="flex min-h-20 shrink-0 items-center justify-between border-b border-border bg-background px-6 sm:px-8"
        >
          <div className="flex min-w-0 items-center gap-3">
            <Image
              src="/DOE%20LOGO%20OFFICIAL%20PNG.png"
              alt="Department of Energy seal"
              width={44}
              height={44}
              className="size-10 shrink-0 rounded-lg object-cover shadow-sm"
            />
            <div className="min-w-0">
              <p className="truncate text-xs font-bold uppercase tracking-[0.2em] text-pulse">
                Department of Energy
              </p>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                Secure records workspace
              </p>
            </div>
          </div>
          <div
            aria-label="Header actions"
            className="flex shrink-0 items-center gap-2"
          >
            <ThemeToggle />
            <SignOutButton />
          </div>
        </header>
        <AnonymousBanner />{" "}
        <main data-app-main aria-label="Content" className="p-6 sm:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
