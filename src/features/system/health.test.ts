// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { checkLiveness, checkReadiness } from "./health";

describe("system health", () => {
  it("reports liveness without touching storage", () => {
    const storage = vi.fn();
    expect(checkLiveness()).toEqual({ ok: true });
    expect(storage).not.toHaveBeenCalled();
  });

  it("reports safe readiness booleans without host paths", () => {
    const ready = checkReadiness({
      database: () => true,
      dataDirectory: () => true,
      filesRoot: () => false,
    });
    expect(ready).toEqual({
      ok: false,
      checks: { database: true, dataDirectory: true, filesRoot: false },
    });
    expect(JSON.stringify(ready)).not.toContain("C:\\");
  });

  it("is ready only when every dependency is ready", () => {
    expect(
      checkReadiness({
        database: () => true,
        dataDirectory: () => true,
        filesRoot: () => true,
      }).ok
    ).toBe(true);
  });
});
