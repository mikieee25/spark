import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUser } from "@/features/auth/request-auth";
import { headers } from "next/headers";
import { getAccessState } from "@/features/access/access-policy";
import { getDatabase } from "@/lib/db/runtime";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    if (!getAccessState(getDatabase()).anonymous) redirect("/login");
    return <AppShell user={{ id: "anonymous", username: "guest", displayName: "Guest access", role: "user", mustChangePassword: false }}>{children}</AppShell>;
  }
  const pathname = (await headers()).get("x-invoke-path") ?? "";
  if (user.mustChangePassword && !pathname.startsWith("/account/password")) redirect("/account/password");
  return <AppShell user={user}>{children}</AppShell>;
}
