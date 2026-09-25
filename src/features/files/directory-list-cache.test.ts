import { describe, expect, it, vi } from "vitest";
import { createDirectoryListCache } from "./directory-list-cache";

describe("directory list cache", () => {
  it("expires entries and invalidates paths", () => {
    vi.useFakeTimers();
    try {
      const cache = createDirectoryListCache<string[]>({
        ttlMs: 1_000,
        maxEntries: 2,
      });
      cache.set("Reports", "v1", ["a"]);
      expect(cache.get("Reports", "v1")).toEqual(["a"]);
      expect(cache.get("Reports", "v2")).toBeUndefined();
      cache.invalidate("Reports");
      expect(cache.get("Reports", "v1")).toBeUndefined();
      cache.set("Reports", "v1", ["a"]);
      vi.advanceTimersByTime(1_001);
      expect(cache.get("Reports", "v1")).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("bounds capacity using least-recently-used eviction", () => {
    const cache = createDirectoryListCache<string[]>({
      ttlMs: 1_000,
      maxEntries: 2,
    });
    cache.set("a", "1", ["a"]);
    cache.set("b", "1", ["b"]);
    expect(cache.get("a", "1")).toEqual(["a"]);
    cache.set("c", "1", ["c"]);
    expect(cache.get("b", "1")).toBeUndefined();
    expect(cache.get("a", "1")).toEqual(["a"]);
  });
});
