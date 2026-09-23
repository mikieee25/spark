"use client";

import { useEffect, useState } from "react";
import { Globe2, Info, LockKeyhole, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { adminApi } from "./admin-api";

const ACCESS_HOURS = [1, 4, 8, 24];

function hoursUntil(expiresAt: string | null): number {
  if (!expiresAt) return 1;
  const remainingHours = Math.max(1, (new Date(expiresAt).getTime() - Date.now()) / 3_600_000);
  return ACCESS_HOURS.find((value) => remainingHours <= value) ?? 24;
}

export function AccessSettings() {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState(1);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    void adminApi.access().then((settings) => {
      setOpen(!settings.requireSignIn);
      setReason(settings.reason ?? "");
      setHours(hoursUntil(settings.expiresAt));
    }).catch(() => setNotice("Unable to load the current access policy.")).finally(() => setLoading(false));
  }, []);

  async function persist() {
    setSaving(true);
    setNotice("");
    try {
      const settings = await adminApi.setAccess({ requireSignIn: !open, durationHours: hours, reason: reason.trim() || null });
      setOpen(!settings.requireSignIn);
      setReason(settings.reason ?? "");
      setNotice("Access policy saved");
    } catch {
      setNotice("Unable to save access policy");
    } finally {
      setSaving(false);
    }
  }

  function save() {
    if (open) {
      setConfirmOpen(true);
      return;
    }
    void persist();
  }

  const statusText = loading ? "Loading policy…" : open ? "Public read-only access is enabled" : "Private · sign-in required";
  const StatusIcon = open ? Globe2 : LockKeyhole;

  return <section aria-labelledby="access-policy-title" className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6"><header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Access control</p><h2 id="access-policy-title" className="mt-2 text-lg font-semibold tracking-tight">Access policy</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Choose whether SPARK requires an account before someone can view files.</p></div><div className={open ? "inline-flex w-fit items-center gap-2 rounded-full bg-success/10 px-3 py-1.5 text-xs font-medium text-success" : "inline-flex w-fit items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground"}><StatusIcon className="size-3.5" aria-hidden="true" />{statusText}</div></header><div className="mt-5 rounded-xl border bg-muted/20 p-4 sm:p-5"><div className="flex items-start justify-between gap-4"><div className="flex min-w-0 items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-background text-primary shadow-sm"><Globe2 className="size-4" aria-hidden="true" /></span><div><p className="font-medium">Anonymous read-only access</p><p className="mt-1 text-sm leading-5 text-muted-foreground">Visitors can browse and download files without signing in. They cannot upload, edit, or delete.</p></div></div><button type="button" role="switch" aria-checked={open} aria-label="Allow anonymous read-only access" onClick={() => setOpen((current) => !current)} disabled={loading || saving} className={open ? "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-primary transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" : "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-muted-foreground/30 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"}><span className={open ? "size-5 translate-x-5 rounded-full bg-white shadow-sm transition" : "size-5 translate-x-0.5 rounded-full bg-white shadow-sm transition"} /></button></div></div>{open && <div className="mt-4 grid gap-4 rounded-xl border border-primary/20 bg-primary/[0.03] p-4 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] sm:p-5"><label className="grid gap-1.5 text-sm font-medium">Auto-close after<select aria-label="Access duration" className="h-10 rounded-lg border bg-background px-3 font-normal" value={hours} onChange={(event) => setHours(Number(event.target.value))}>{ACCESS_HOURS.map((value) => <option key={value} value={value}>{value} {value === 1 ? "hour" : "hours"}</option>)}</select></label><label className="grid gap-1.5 text-sm font-medium">Reason <input aria-label="Access reason" className="h-10 rounded-lg border bg-background px-3 font-normal outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Internal review" maxLength={500} /></label><p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground sm:col-span-2"><Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />Access automatically returns to sign-in-only mode when the selected period ends.</p></div>}<footer className="mt-5 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"><p role="status" aria-live="polite" className={notice.startsWith("Unable") ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{notice || (open ? "Changes apply after you save." : "Only signed-in users can access this workspace.")}</p><Button onClick={save} disabled={loading || saving} className="sm:min-w-44">{saving ? "Saving…" : <><Save data-icon="inline-start" />Save policy</>}</Button></footer><Dialog open={confirmOpen} onOpenChange={(value) => { if (!saving) setConfirmOpen(value); }}><DialogContent><DialogHeader><DialogTitle>Enable anonymous access?</DialogTitle><DialogDescription>Anyone with the SPARK address will be able to browse and download files for {hours} {hours === 1 ? "hour" : "hours"}. Upload, edit, and delete actions will still require an account.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={saving}>Keep sign-in required</Button><Button onClick={() => { setConfirmOpen(false); void persist(); }} disabled={saving}>Confirm and enable</Button></DialogFooter></DialogContent></Dialog></section>;
}
