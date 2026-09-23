export type RuntimePerformanceSnapshot = Readonly<{
  measuredAt: number;
  eventLoopMeanMs: number;
  eventLoopP95Ms: number;
  eventLoopMaxMs: number;
}>;

const GLOBAL_KEY = "__SPARK_RUNTIME_PERFORMANCE__";

export function getRuntimePerformanceSnapshot(): RuntimePerformanceSnapshot | null {
  const value = (globalThis as typeof globalThis & { [GLOBAL_KEY]?: unknown })[GLOBAL_KEY];
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (!["measuredAt", "eventLoopMeanMs", "eventLoopP95Ms", "eventLoopMaxMs"].every((key) => typeof candidate[key] === "number" && Number.isFinite(candidate[key]))) return null;
  return candidate as RuntimePerformanceSnapshot;
}
