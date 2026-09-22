"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Archive, Download, EyeOff, FileText, LoaderCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { downloadUrl } from "@/features/files/file-api";

export type PreviewItem = Readonly<{ name: string; logicalPath: string; mimeType?: string }>;
type ArchiveEntry = Readonly<{ name: string; sizeBytes: number; kind: string }>;
type PreviewData =
  | Readonly<{ kind: "text"; content: string; truncated: boolean }>
  | Readonly<{ kind: "archive"; entries: ArchiveEntry[] }>;

const TEXT_EXTENSIONS = new Set(["txt", "md", "csv", "json", "xml", "yaml", "yml", "log", "js", "jsx", "ts", "tsx", "css", "html", "sql", "ps1", "py"]);
const IMAGE_EXTENSIONS = new Set(["avif", "bmp", "gif", "jpeg", "jpg", "png", "tif", "tiff", "webp"]);
const AUDIO_EXTENSIONS = new Set(["flac", "m4a", "mp3", "oga", "ogg", "wav"]);
const VIDEO_EXTENSIONS = new Set(["avi", "m4v", "mov", "mp4", "mpeg", "webm"]);

function previewUrl(path: string): string {
  return `/api/files/preview?path=${encodeURIComponent(path)}`;
}

function extension(name: string): string {
  return name.split(".").at(-1)?.toLowerCase() ?? "";
}

export function PreviewPanel({ item, onPreviewed }: Readonly<{ item: PreviewItem; onPreviewed?: () => void }>) {
  const [result, setResult] = useState<{ path: string; data?: PreviewData; failed?: boolean }>({ path: item.logicalPath });
  const mime = item.mimeType ?? "";
  const ext = extension(item.name);
  const mediaKind = mime.startsWith("image/") || IMAGE_EXTENSIONS.has(ext) ? "image"
    : mime.startsWith("audio/") || AUDIO_EXTENSIONS.has(ext) ? "audio"
      : mime.startsWith("video/") || VIDEO_EXTENSIONS.has(ext) ? "video"
        : mime === "application/pdf" || ext === "pdf" ? "pdf" : null;
  const current = result.path === item.logicalPath ? result : { path: item.logicalPath };
  const data = current.data ?? null;
  const failed = Boolean(current.failed);
  const loading = !mediaKind && !data && !failed;

  useEffect(() => {
    if (mediaKind) return;
    const controller = new AbortController();
    fetch(previewUrl(item.logicalPath), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("PREVIEW_UNAVAILABLE");
        const result = await response.json() as PreviewData;
        if (result.kind !== "text" && result.kind !== "archive") throw new Error("PREVIEW_UNAVAILABLE");
        setResult({ path: item.logicalPath, data: result });
        onPreviewed?.();
      })
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setResult({ path: item.logicalPath, failed: true }); });
    return () => controller.abort();
  }, [item.logicalPath, mediaKind, onPreviewed]);

  const fallback = <div className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/20 p-6 text-center">
    <EyeOff className="size-8 text-muted-foreground" aria-hidden="true" />
    <p className="font-medium">Preview unavailable</p>
    <p className="max-w-sm text-sm text-muted-foreground">This format cannot be shown safely here. Download it to open with a compatible app.</p>
  </div>;

  return <section aria-label={`Preview of ${item.name}`} className="flex min-h-0 flex-col gap-4">
    {loading && <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-muted-foreground" role="status"><LoaderCircle className="motion-safe:animate-spin" />Loading preview…</div>}
    {!loading && !failed && mediaKind === "image" && <Image unoptimized width={1000} height={700} src={`/api/files/thumbnail?path=${encodeURIComponent(item.logicalPath)}`} alt={`Preview of ${item.name}`} className="max-h-[28rem] w-full rounded-lg border bg-muted/20 object-contain" onLoad={onPreviewed} onError={() => setResult({ path: item.logicalPath, failed: true })} />}
    {!loading && !failed && mediaKind === "pdf" && <iframe src={previewUrl(item.logicalPath)} title={`Preview of ${item.name}`} className="h-[28rem] w-full rounded-lg border bg-background" onLoad={onPreviewed} />}
    {!loading && !failed && mediaKind === "audio" && <audio controls src={previewUrl(item.logicalPath)} className="w-full" onLoadedData={onPreviewed}>Audio preview is unavailable.</audio>}
    {!loading && !failed && mediaKind === "video" && <video controls src={previewUrl(item.logicalPath)} className="max-h-[28rem] w-full rounded-lg border bg-muted/20" onLoadedData={onPreviewed}>Video preview is unavailable.</video>}
    {!loading && !failed && data?.kind === "text" && <div className="overflow-hidden rounded-lg border bg-muted/20"><div className="flex items-center gap-2 border-b px-3 py-2 text-xs text-muted-foreground"><FileText className="size-4" aria-hidden="true" />{data.truncated ? "Preview truncated to the safe limit" : "Text preview"}</div><ScrollArea className="h-72"><pre className="whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed">{data.content}</pre></ScrollArea></div>}
    {!loading && !failed && data?.kind === "archive" && <div className="overflow-hidden rounded-lg border"><div className="flex items-center gap-2 border-b bg-muted/20 px-3 py-2 text-xs text-muted-foreground"><Archive className="size-4" aria-hidden="true" />{data.entries.length} archive entries</div><ScrollArea className="h-72"><ul className="divide-y">{data.entries.map((entry) => <li key={entry.name} className="flex items-center justify-between gap-3 px-4 py-3 text-sm"><span className="min-w-0 truncate">{entry.name}</span><span className="shrink-0 text-xs text-muted-foreground">{entry.kind}</span></li>)}</ul></ScrollArea></div>}
    {!loading && (failed || (!mediaKind && !data && !TEXT_EXTENSIONS.has(ext))) && fallback}
    <a href={downloadUrl(item.logicalPath)} className={buttonVariants({ variant: "outline" })} aria-label={`Download ${item.name}`}><Download data-icon="inline-start" />Download</a>
  </section>;
}
