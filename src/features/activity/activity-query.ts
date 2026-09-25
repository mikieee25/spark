import type Database from "better-sqlite3";
import { listActivity, type ActivityEvent } from "./activity-repository";

export type ActivityFilters = {
  limit?: number;
  cursor?: string;
  actorUserId?: string;
  action?: string;
  outcome?: "success" | "failure";
  from?: string;
  to?: string;
  path?: string;
};
export function queryActivity(
  database: Database.Database,
  filters: ActivityFilters
): { items: ActivityEvent[]; nextCursor: string | null } {
  const requested = Math.floor(filters.limit ?? 50);
  if (requested <= 0) return { items: [], nextCursor: null };
  const limit = Math.min(100, requested);
  let cursor: { occurredAt: string; id: string } | undefined;
  if (filters.cursor) {
    try {
      cursor = JSON.parse(
        Buffer.from(filters.cursor, "base64url").toString("utf8")
      ) as { occurredAt: string; id: string };
    } catch {
      const legacy = new Date(filters.cursor);
      if (Number.isNaN(legacy.getTime())) throw new Error("INVALID_CURSOR");
      cursor = { occurredAt: legacy.toISOString(), id: "" };
    }
  }
  let items = listActivity(database, {
    limit: 100,
    before: cursor ? new Date(cursor.occurredAt) : undefined,
  });
  if (cursor)
    items = items.filter(
      (event) =>
        event.occurredAt < cursor!.occurredAt ||
        (event.occurredAt === cursor!.occurredAt && event.id < cursor!.id)
    );
  items = items.filter(
    (event) =>
      (!filters.actorUserId || event.actorUserId === filters.actorUserId) &&
      (!filters.action || event.action === filters.action) &&
      (!filters.outcome || event.outcome === filters.outcome) &&
      (!filters.from || event.occurredAt >= filters.from) &&
      (!filters.to || event.occurredAt <= filters.to) &&
      (!filters.path ||
        event.paths.some((value) => value.includes(filters.path!)))
  );
  const page = items.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page,
    nextCursor:
      items.length > limit && last
        ? Buffer.from(
            JSON.stringify({ occurredAt: last.occurredAt, id: last.id }),
            "utf8"
          ).toString("base64url")
        : null,
  };
}
