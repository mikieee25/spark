import { redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/request-auth";
import { AdminShell } from "@/features/admin/admin-shell";
import { UserManagement } from "@/features/admin/user-management";
import { AccessSettings } from "@/features/admin/access-settings";
import { RetentionSettings } from "@/features/admin/retention-settings";
import { HealthPanel } from "@/features/admin/health-panel";
import { ActivityExplorer } from "@/features/admin/activity-explorer";
import { PageHeader } from "@/components/layout/page-header";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/files");
  return <section className="mx-auto max-w-[1200px] space-y-6"><PageHeader eyebrow="Administration" title="SPARK control room" description="Manage accounts, access, retention, and system readiness." /><AdminShell><UserManagement /><AccessSettings /><RetentionSettings /><HealthPanel /><ActivityExplorer /></AdminShell></section>;
}
