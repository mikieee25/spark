import { redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/request-auth";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/files");
  return <section><p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--pulse)]">Administration</p><h1 className="mt-2 text-3xl font-black">System controls are staged for Phase 6.</h1><p className="mt-3 text-[var(--ink-muted)]">Account management, audit review, and the timed public-access switch will live here.</p></section>;
}
