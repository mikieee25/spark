"use client";
import { useEffect, useState } from "react";
import { adminApi } from "./admin-api";
export function ActivityExplorer() { const [items, setItems] = useState<unknown[]>([]); useEffect(() => { void adminApi.activity().then((result) => setItems(result.items)); }, []); return <section className="rounded-xl border bg-card p-4"><h2 className="font-semibold">Recent activity</h2><p className="mt-1 text-sm text-muted-foreground">{items.length} events loaded. Export from the activity page.</p></section>; }
