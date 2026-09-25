import { afterEach, describe, expect, it } from "vitest";
import { getRuntimePerformanceSnapshot } from "./runtime-performance";

describe("runtime performance", () => {
  afterEach(() => {
    delete (
      globalThis as typeof globalThis & {
        __SPARK_RUNTIME_PERFORMANCE__?: unknown;
      }
    ).__SPARK_RUNTIME_PERFORMANCE__;
  });

  it("returns the server event-loop sample when the custom server has published one", () => {
    (
      globalThis as typeof globalThis & {
        __SPARK_RUNTIME_PERFORMANCE__?: unknown;
      }
    ).__SPARK_RUNTIME_PERFORMANCE__ = {
      measuredAt: 1_700_000_000_000,
      eventLoopMeanMs: 4.2,
      eventLoopP95Ms: 8.7,
      eventLoopMaxMs: 15.1,
    };
    expect(getRuntimePerformanceSnapshot()).toEqual({
      measuredAt: 1_700_000_000_000,
      eventLoopMeanMs: 4.2,
      eventLoopP95Ms: 8.7,
      eventLoopMaxMs: 15.1,
    });
  });
});
