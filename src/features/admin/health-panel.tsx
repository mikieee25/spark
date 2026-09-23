"use client";
import { useEffect, useState } from "react";
import { adminApi } from "./admin-api";
function indexLabel(status: unknown): string {
  if (status === "running") return "Indexing in background";
  if (status === "error") return "Indexing needs attention";
  if (status === "idle") return "Index up to date";
  return "Index status unavailable";
}

export function HealthPanel() {
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  useEffect(() => { void adminApi.health().then(setHealth).catch(() => setHealth({ ok: false })); }, []);
  const checks = health?.checks as { index?: unknown } | undefined;
  const performance = health?.runtimePerformance as { eventLoopP95Ms?: number; eventLoopMeanMs?: number } | null | undefined;
  return <section className="rounded-xl border bg-card p-4"><h2 className="font-semibold">System health</h2><div className="mt-3 grid gap-3 sm:grid-cols-3"><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Services</p><p className="mt-1 text-sm" aria-live="polite">{health ? (health.ok ? "Healthy" : "Attention required") : "Checking…"}</p></div><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Search index</p><p className="mt-1 text-sm" aria-live="polite">{health ? indexLabel(checks?.index) : "Checking…"}</p></div><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Event loop p95</p><p className="mt-1 text-sm" aria-live="polite">{performance ? `${performance.eventLoopP95Ms?.toFixed(1)} ms` : "Not available"}</p></div></div></section>;
}
