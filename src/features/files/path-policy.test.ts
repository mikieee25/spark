// @vitest-environment node
import { describe, expect, it } from "vitest";
import { normalizeLogicalPath, validateName } from "./path-policy";

describe("logical path policy", () => {
  it("normalizes safe relative paths", () => {
    expect(normalizeLogicalPath("Reports/2026")).toBe("Reports/2026");
    expect(normalizeLogicalPath("")).toBe("");
  });

  it.each(["../outside", "/absolute", "Reports//note.txt", "Reports/./note.txt", "Reports/..", "Reports\\note.txt", "Reports\0note.txt"])(
    "rejects unsafe path %j",
    (value) => {
      expect(() => normalizeLogicalPath(value)).toThrow("INVALID_PATH");
    },
  );

  it.each(["CON", "NUL.txt", "report.", "report ", "bad:name", "bad*name"])(
    "rejects Windows-invalid name %j",
    (value) => {
      expect(() => validateName(value)).toThrow("INVALID_NAME");
    },
  );
});
