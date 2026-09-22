"use client";
import { useEffect, useState } from "react";
import { adminApi } from "./admin-api";
export function HealthPanel() { const [health, setHealth] = useState<Record<string, unknown> | null>(null); useEffect(() => { void adminApi.health().then(setHealth).catch(() => setHealth({ ok: false })); }, []); return <section className="rounded-xl border bg-card p-4"><h2 className="font-semibold">System health</h2><p className="mt-1 text-sm text-muted-foreground" aria-live="polite">{health ? (health.ok ? "Healthy" : "Attention required") : "Checking…"}</p></section>; }
