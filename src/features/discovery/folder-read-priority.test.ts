import { describe, expect, it, vi } from "vitest";
import { beginFolderRead, hasActiveFolderReads, waitForFolderReadQuietPeriod } from "./folder-read-priority";

describe("folder read priority", () => {
  it("tracks active interactive folder reads", () => {
    expect(hasActiveFolderReads()).toBe(false);
    const release = beginFolderRead();
    expect(hasActiveFolderReads()).toBe(true);
    release();
    expect(hasActiveFolderReads()).toBe(false);
  });

  it("waits for browsing to finish and remain quiet", async () => {
    vi.useFakeTimers();
    const release = beginFolderRead();
    let settled = false;
    const waiting = waitForFolderReadQuietPeriod(50).then(() => { settled = true; });
    try {
      await vi.advanceTimersByTimeAsync(100);
      expect(settled).toBe(false);
      release();
      await vi.advanceTimersByTimeAsync(100);
      await waiting;
      expect(settled).toBe(true);
    } finally {
      release();
      vi.useRealTimers();
    }
  });
});
