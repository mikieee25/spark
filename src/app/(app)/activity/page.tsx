import { redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/request-auth";
import { listActivity } from "@/features/activity/activity-repository";
import { getDatabase } from "@/lib/db/runtime";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { ActivityList } from "@/features/activity/activity-list";

export default async function ActivityPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/files");
  const events = listActivity(getDatabase(), { limit: 100 });

  return (
    <section className="mx-auto max-w-[1200px] space-y-6">
      <PageHeader
        eyebrow="Activity"
        title="Activity history"
        description="Append-only records of authentication, system, and file operations."
        actions={
          <a
            className={buttonVariants({ variant: "outline" })}
            href="/api/admin/activity/export"
          >
            Export CSV
          </a>
        }
      />
      {events.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-muted-foreground">
          No activity recorded yet.
        </p>
      ) : (
        <ActivityList events={events} />
      )}
    </section>
  );
}
