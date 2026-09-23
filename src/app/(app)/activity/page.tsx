import { redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/request-auth";
import { listActivity } from "@/features/activity/activity-repository";
import { getDatabase } from "@/lib/db/runtime";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";

function actorLabel(event: ReturnType<typeof listActivity>[number]): string {
  return event.actorDisplayName ?? event.actorUsername ?? event.actorType;
}

export default async function ActivityPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/files");
  const events = listActivity(getDatabase(), { limit: 100 });

  return (
    <section className="mx-auto max-w-[1200px] space-y-6">
      <PageHeader eyebrow="Activity" title="Activity history" description="Append-only records of authentication, system, and file operations." actions={<a className={buttonVariants({ variant: "outline" })} href="/api/admin/activity/export">Export CSV</a>} />
      {events.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-muted-foreground">
          No activity recorded yet.
        </p>
      ) : (
        <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {events.map((event) => (
            <li className="grid gap-2 p-5 sm:grid-cols-[1fr_auto] sm:items-center" key={event.id}>
              <div>
                <p className="font-bold">{event.action.replaceAll("_", " ")}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {actorLabel(event)} · {event.outcome}
                  {event.paths.length > 0 ? ` · ${event.paths.join(", ")}` : ""}
                </p>
              </div>
              <time className="text-sm text-muted-foreground" dateTime={event.occurredAt}>
                {new Date(event.occurredAt).toLocaleString("en-PH")}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
