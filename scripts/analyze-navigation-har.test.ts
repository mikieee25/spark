import { describe, expect, it } from "vitest";
import { analyzeHarDocument } from "./analyze-navigation-har.mjs";

describe("navigation HAR analysis", () => {
  it("separates browser wait from server timing and inventories RSC prefetches", () => {
    const report = analyzeHarDocument({
      log: {
        entries: [
          {
            startedDateTime: "2026-09-23T00:00:00.000Z",
            time: 6100,
            timings: { wait: 6000, receive: 100 },
            request: { method: "GET", url: "http://spark.test/api/files?path=Reports" },
            response: {
              status: 200,
              headers: [{ name: "Server-Timing", value: "auth;dur=1.0, path;dur=2.0, directory;dur=3.0, readdir;dur=4.0, metadata;dur=4980.0, sort;dur=1.0, list;dur=5000.0, total;dur=5003.0" }],
              content: { size: 20 },
            },
          },
          {
            startedDateTime: "2026-09-23T00:00:00.000Z",
            time: 900,
            timings: { wait: 800, receive: 100 },
            request: { method: "GET", url: "http://spark.test/admin?_rsc=abc" },
            response: { status: 200, headers: [], content: { size: 10 } },
          },
        ],
      },
    });

    expect(report.listings).toEqual([{ path: "Reports", entries: null, browserMs: 6100, waitMs: 6000, receiveMs: 100, serverPathMs: 2, serverDirectoryMs: 3, serverReaddirMs: 4, serverMetadataMs: 4980, serverSortMs: 1, serverTotalMs: 5003, serverListMs: 5000 }]);
    expect(report.rscCount).toBe(1);
    expect(report.p95BrowserMs).toBe(6100);
  });
});
