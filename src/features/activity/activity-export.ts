import type { ActivityEvent } from "./activity-repository";
const columns = [
  "occurred_at",
  "actor_type",
  "actor_username",
  "action",
  "paths",
  "outcome",
  "error_code",
] as const;
function cell(value: string | null): string {
  const text = value ?? "";
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
export function activityCsv(events: readonly ActivityEvent[]): string {
  return (
    [
      columns.join(","),
      ...events.map((event) =>
        [
          event.occurredAt,
          event.actorType,
          event.actorUsername,
          event.action,
          event.paths.join(";"),
          event.outcome,
          event.errorCode,
        ]
          .map(cell)
          .join(",")
      ),
    ].join("\r\n") + "\r\n"
  );
}
