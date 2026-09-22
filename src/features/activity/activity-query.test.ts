// @vitest-environment node
import { describe, expect, it } from "vitest";
import { activityCsv } from "./activity-export";
import { queryActivity } from "./activity-query";
describe("activity query and export", () => {
  it("exports a fixed escaped safe column set", () => {
    const csv = activityCsv([{ id: "1", occurredAt: "2026-09-22T00:00:00Z", actorUserId: "u", actorType: "user", actorUsername: "admin", actorDisplayName: "Admin", action: "file_added", paths: ["a,b"], operationId: null, outcome: "success", errorCode: null, metadata: { password: "hidden" } }]);
    expect(csv).toContain("occurred_at,actor_type,actor_username,action,paths,outcome,error_code"); expect(csv).toContain('"a,b"'); expect(csv).not.toContain("hidden");
  });
  it("returns bounded deterministic activity results", () => expect(queryActivity({} as never, { limit: 0 })).toMatchObject({ items: [], nextCursor: null }));
});
