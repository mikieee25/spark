"use client";

import { useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type RecycleEntryView = Readonly<{ id: string; originalPath: string; itemType: "file" | "folder"; sizeBytes: number; deletedAt: string; expiresAt: string; state: "active" | "restored" | "expired" | "purged" }>;

function formatSize(size: number): string {
  if (!size) return "—";
  if (size < 1_024) return `${size} B`;
  if (size < 1_048_576) return `${(size / 1_024).toFixed(1)} KB`;
  return `${(size / 1_048_576).toFixed(1)} MB`;
}

export function RecycleWorkspace({ entries: initialEntries, userRole }: { entries: RecycleEntryView[]; userRole: "user" | "admin" }) {
  const [entries, setEntries] = useState(initialEntries);
  const [purgeTarget, setPurgeTarget] = useState<RecycleEntryView | null>(null);
  const [restoreConflict, setRestoreConflict] = useState<RecycleEntryView | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function restore(entry: RecycleEntryView, conflict?: "replace") {
    const response = await fetch(`/api/recycle/${encodeURIComponent(entry.id)}/restore`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(conflict ? { conflict } : {}) });
    if (!response.ok) {
      const code = ((await response.json().catch(() => ({}))) as { error?: string }).error ?? "FILESYSTEM_ERROR";
      if (code === "CONFLICT" && !conflict) setRestoreConflict(entry);
      else setError(code === "CONFLICT" ? "Unable to replace the destination." : "Unable to restore item");
      return;
    }
    setEntries((current) => current.filter((item) => item.id !== entry.id));
    setRestoreConflict(null);
    setNotice(`${entry.originalPath} restored.`);
  }

  async function purge() {
    if (!purgeTarget) return;
    const response = await fetch(`/api/recycle/${encodeURIComponent(purgeTarget.id)}`, { method: "DELETE" });
    if (!response.ok) { setError(((await response.json().catch(() => ({}))) as { error?: string }).error ?? "Unable to permanently delete item"); return; }
    setEntries((current) => current.filter((item) => item.id !== purgeTarget.id));
    setNotice(`${purgeTarget.originalPath} permanently deleted.`);
    setPurgeTarget(null);
  }

  return <div className="mx-auto max-w-[1200px] space-y-6"><div><p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">Recovery</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Recycle bin</h1><p className="mt-2 text-sm text-muted-foreground">Restore deleted files or review when retained content will expire.</p></div>{error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}<Card className="shadow-none"><CardHeader><CardTitle className="text-base">Recoverable items</CardTitle><CardDescription>{entries.length} active item{entries.length === 1 ? "" : "s"}</CardDescription></CardHeader><CardContent className="p-0">{entries.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">The Recycle bin is empty.</div> : <div className="divide-y">{entries.map((entry) => <div key={entry.id} className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6"><div className="min-w-0"><p className="truncate font-medium">{entry.originalPath}</p><p className="mt-1 text-xs text-muted-foreground">{entry.itemType} · {formatSize(entry.sizeBytes)} · deleted {new Date(entry.deletedAt).toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">Expires {new Date(entry.expiresAt).toLocaleString()}</p></div><div className="flex items-center gap-2"><Button variant="outline" onClick={() => void restore(entry)}><RotateCcw data-icon="inline-start" />Restore</Button>{userRole === "admin" && <Button variant="destructive" aria-label="Permanently delete" onClick={() => setPurgeTarget(entry)}><Trash2 /></Button>}</div></div>)}</div>}</CardContent></Card><p aria-live="polite" className="text-sm text-muted-foreground">{notice}</p><Dialog open={Boolean(restoreConflict)} onOpenChange={(open) => { if (!open) setRestoreConflict(null); }}><DialogContent><DialogHeader><DialogTitle>Restore destination already exists</DialogTitle><DialogDescription>A file or folder already exists at the original destination.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setRestoreConflict(null)}>Choose another destination</Button><Button variant="destructive" onClick={() => restoreConflict && void restore(restoreConflict, "replace")}>Restore and replace</Button></DialogFooter></DialogContent></Dialog><Dialog open={Boolean(purgeTarget)} onOpenChange={(open) => { if (!open) setPurgeTarget(null); }}><DialogContent><DialogHeader><DialogTitle>Permanently delete this item?</DialogTitle><DialogDescription>This cannot be undone. The recycle-bin copy for {purgeTarget?.originalPath} will be removed.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setPurgeTarget(null)}>Cancel</Button><Button variant="destructive" onClick={() => void purge()}>Permanently delete</Button></DialogFooter></DialogContent></Dialog></div>;
}
