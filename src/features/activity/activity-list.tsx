"use client";

import { useState } from "react";
import { PaginationControls } from "@/components/ui/pagination-controls";
import type { ActivityEvent } from "./activity-repository";

function actorLabel(event: ActivityEvent): string {
  return event.actorDisplayName ?? event.actorUsername ?? event.actorType;
}

export function ActivityList({ events }: Readonly<{ events: readonly ActivityEvent[] }>) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(events.length / pageSize)));
  const visibleEvents = events.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return <>
    <ol aria-label="Activity events" className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {visibleEvents.map((event) => <li className="grid gap-2 p-5 sm:grid-cols-[1fr_auto] sm:items-center" key={event.id}>
        <div>
          <p className="font-bold">{event.action.replaceAll("_", " ")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{actorLabel(event)} · {event.outcome}{event.paths.length > 0 ? ` · ${event.paths.join(", ")}` : ""}</p>
        </div>
        <time className="text-sm text-muted-foreground" dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleString("en-PH")}</time>
      </li>)}
    </ol>
    {events.length > 0 && <PaginationControls label="Activity" totalItems={events.length} page={currentPage} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />}
  </>;
}
