"use client";

import { createElement, useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Code2,
  File,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  Grid2X2,
  HardDrive,
  LayoutList,
  MoreHorizontal,
  Plus,
  Search,
  SlidersHorizontal,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MOCK_FILES, WORKSPACE_STATS, type MockFile } from "./mock-data";

type ViewMode = "list" | "grid";
type SortMode = "name" | "modified" | "size";

const iconFor = (file: MockFile, open = false) => {
  if (file.kind === "folder") return open ? FolderOpen : Folder;
  if (file.type === "Spreadsheet") return FileSpreadsheet;
  if (file.type === "Image") return FileImage;
  if (file.type === "PDF document") return FileText;
  if (file.type === "Text file") return Code2;
  if (file.type === "Archive") return FileArchive;
  return File;
};

const iconTone: Record<MockFile["tone"], string> = {
  blue: "bg-[color-mix(in_oklch,var(--pulse)_12%,transparent)] text-[var(--pulse)]",
  yellow: "bg-[color-mix(in_oklch,var(--warning)_20%,transparent)] text-[var(--warning)]",
  purple: "bg-[color-mix(in_oklch,var(--file-purple)_12%,transparent)] text-[var(--file-purple)]",
  green: "bg-[color-mix(in_oklch,var(--success)_12%,transparent)] text-[var(--success)]",
  slate: "bg-[color-mix(in_oklch,var(--ink-muted)_12%,transparent)] text-[var(--ink-muted)]",
  red: "bg-[color-mix(in_oklch,var(--destructive)_12%,transparent)] text-[var(--destructive)]",
};

function FileGlyph({ file, open = false }: { file: MockFile; open?: boolean }) {
  const Icon = iconFor(file, open);
  return <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${iconTone[file.tone]}`}>{createElement(Icon, { className: "size-5", "aria-hidden": true })}</span>;
}

function StatCard({ label, value, detail, progress, tone }: (typeof WORKSPACE_STATS)[number]) {
  return <Card className="min-w-0 shadow-none"><CardContent className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p></div><span className={`mt-1 size-2 rounded-full ${tone === "yellow" ? "bg-[var(--warning)]" : tone === "green" ? "bg-[var(--success)]" : "bg-[var(--pulse)]"}`} /></div><div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{detail}</span><span>{progress}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${tone === "yellow" ? "bg-[var(--warning)]" : tone === "green" ? "bg-[var(--success)]" : "bg-[var(--pulse)]"}`} style={{ width: `${progress}%` }} /></div></CardContent></Card>;
}

function FileName({ file }: { file: MockFile }) {
  return <div className="flex min-w-0 items-center gap-3"><FileGlyph file={file} /><div className="min-w-0"><p className="truncate font-medium">{file.name}</p><p className="truncate text-xs text-muted-foreground">{file.type}</p></div>{file.starred && <Star className="size-3.5 shrink-0 fill-[var(--warning)] text-[var(--warning)]" aria-label="Favorite" />}</div>;
}

export function FileWorkspace() {
  const [files, setFiles] = useState(MOCK_FILES);
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const selected = files.find((file) => file.id === selectedId) ?? null;
  const visibleFiles = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return files.filter((file) => !normalized || `${file.name} ${file.type} ${file.owner}`.toLowerCase().includes(normalized)).sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      if (sortMode === "modified") return b.modified.localeCompare(a.modified);
      if (sortMode === "size") return b.size.localeCompare(a.size);
      return a.name.localeCompare(b.name);
    });
  }, [files, query, sortMode]);

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  }

  function createFolder() {
    const name = folderName.trim();
    if (!name) return;
    setFiles((current) => [{ id: `folder-${Date.now()}`, name, kind: "folder", type: "Folder", size: "—", modified: "Just now", owner: "You", tone: "blue" }, ...current]);
    setFolderName("");
    setNewFolderOpen(false);
    showNotice(`${name} created in My workspace`);
  }

  function removeSelected() {
    if (!selected) return;
    setFiles((current) => current.filter((file) => file.id !== selected.id));
    setSelectedId(null);
    setDeleteOpen(false);
    showNotice(`${selected.name} moved to Recycle bin`);
  }

  return <TooltipProvider>
    <div className="mx-auto max-w-[1500px] space-y-6">
      <Breadcrumb><BreadcrumbList><BreadcrumbItem><BreadcrumbLink href="/files">Workspace</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>Shared files</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb>
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--pulse)]">My workspace</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Shared files</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">A calm, searchable home for DOE records, working files, and shared knowledge.</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setNewFolderOpen(true)}><Plus data-icon="inline-start" />New folder</Button>
          <Button onClick={() => showNotice("Upload workflow arrives with Phase 2 storage") }><Upload data-icon="inline-start" />Upload</Button>
        </div>
      </div>

      <div className="relative max-w-2xl"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input value={query} onChange={(event) => setQuery(event.target.value)} onFocus={() => setCommandOpen(true)} placeholder="Search files, folders, and people" aria-label="Search workspace" className="h-11 pl-10 pr-24" /><kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">⌘ K</kbd></div>

      <div className="grid gap-3 md:grid-cols-3">{WORKSPACE_STATS.map((stat) => <StatCard key={stat.label} {...stat} />)}</div>

      <Card className="overflow-hidden shadow-none">
        <CardHeader className="gap-4 border-b bg-muted/20 px-4 py-4 sm:px-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><CardTitle className="text-base">My workspace</CardTitle><CardDescription className="mt-1">{visibleFiles.length} items · updated moments ago</CardDescription></div><div className="flex flex-wrap items-center gap-2"><DropdownMenu><DropdownMenuTrigger render={<Button variant="outline" size="sm" />}><SlidersHorizontal data-icon="inline-start" />Sort<ChevronDown data-icon="inline-end" /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuLabel>Sort by</DropdownMenuLabel><DropdownMenuSeparator />{([["name", "Name"], ["modified", "Last modified"], ["size", "File size"]] as const).map(([value, label]) => <DropdownMenuItem key={value} onClick={() => setSortMode(value)}>{label}{sortMode === value && <Check className="ml-auto size-4" />}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu><div className="flex rounded-lg border bg-background p-0.5"><Tooltip><TooltipTrigger render={<Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon-sm" aria-label="List view" onClick={() => setViewMode("list")} />}><LayoutList /></TooltipTrigger><TooltipContent>List view</TooltipContent></Tooltip><Tooltip><TooltipTrigger render={<Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="icon-sm" aria-label="Grid view" onClick={() => setViewMode("grid")} />}><Grid2X2 /></TooltipTrigger><TooltipContent>Grid view</TooltipContent></Tooltip></div></div></div></CardHeader>
        <CardContent className="p-0">
          {visibleFiles.length === 0 ? <div className="flex min-h-72 flex-col items-center justify-center gap-3 p-8 text-center"><Search className="size-8 text-muted-foreground" /><h2 className="font-semibold">No matching files</h2><p className="max-w-sm text-sm text-muted-foreground">Try a different search term or clear the filter.</p><Button variant="outline" onClick={() => setQuery("")}>Clear search</Button></div> : viewMode === "list" ? <div role="table" aria-label="Workspace files"><div role="row" className="hidden grid-cols-[minmax(17rem,1.6fr)_minmax(8rem,0.7fr)_minmax(10rem,0.8fr)_auto] gap-4 border-b px-6 py-3 text-xs font-medium text-muted-foreground md:grid"><span role="columnheader">Name</span><span role="columnheader">Owner</span><span role="columnheader">Last modified</span><span role="columnheader" /></div><div>{visibleFiles.map((file) => <ContextMenu key={file.id}><ContextMenuTrigger><div role="row" tabIndex={0} onClick={() => setSelectedId(file.id)} onKeyDown={(event) => { if (event.key === "Enter") setSelectedId(file.id); }} className={`grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b px-4 py-3.5 outline-none transition-colors last:border-0 hover:bg-muted/50 focus-visible:bg-accent md:grid-cols-[minmax(17rem,1.6fr)_minmax(8rem,0.7fr)_minmax(10rem,0.8fr)_auto] md:px-6 ${selectedId === file.id ? "bg-accent/60" : ""}`}><FileName file={file} /><span className="hidden truncate text-sm text-muted-foreground md:block">{file.owner}</span><span className="hidden text-sm text-muted-foreground md:block">{file.modified}</span><MoreHorizontal className="size-4 text-muted-foreground" aria-hidden="true" /></div></ContextMenuTrigger><ContextMenuContent><ContextMenuItem onClick={() => setSelectedId(file.id)}>Open details</ContextMenuItem><ContextMenuItem onClick={() => showNotice(`${file.name} added to favorites`)}>Add to favorites</ContextMenuItem><ContextMenuSeparator /><ContextMenuItem variant="destructive" onClick={() => { setSelectedId(file.id); setDeleteOpen(true); }}><Trash2 />Move to Recycle bin</ContextMenuItem></ContextMenuContent></ContextMenu>)}</div></div> : <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{visibleFiles.map((file) => <button type="button" key={file.id} onClick={() => setSelectedId(file.id)} className={`group rounded-xl border p-4 text-left transition hover:border-[var(--pulse)] hover:shadow-sm focus-visible:border-[var(--focus)] ${selectedId === file.id ? "border-[var(--pulse)] bg-accent/50" : "bg-background"}`}><div className="flex items-start justify-between gap-3"><FileGlyph file={file} open={selectedId === file.id} /><MoreHorizontal className="size-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" /></div><p className="mt-4 truncate font-medium">{file.name}</p><p className="mt-1 truncate text-xs text-muted-foreground">{file.modified}</p><div className="mt-4 flex items-center justify-between text-xs text-muted-foreground"><span>{file.owner}</span>{file.starred && <Star className="size-3.5 fill-[var(--warning)] text-[var(--warning)]" />}</div></button>)}</div>}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed bg-muted/20 px-4 py-3 text-xs text-muted-foreground"><span className="inline-flex items-center gap-2"><HardDrive className="size-4" />Local-first workspace · OneDrive sync stays external to SPARK</span><span className="inline-flex items-center gap-2"><Clock3 className="size-4" />Activity tracking begins in Phase 2</span></div>
    </div>

    <Dialog open={commandOpen} onOpenChange={setCommandOpen}><DialogContent className="p-0 sm:max-w-xl"><DialogHeader className="sr-only"><DialogTitle>Search workspace</DialogTitle><DialogDescription>Search mock files by name, type, or owner.</DialogDescription></DialogHeader><div className="flex items-center gap-3 border-b px-4"><Search className="size-4 text-muted-foreground" /><Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search workspace" className="h-12 border-0 px-0 shadow-none focus-visible:ring-0" /><Button variant="ghost" size="icon-sm" onClick={() => setCommandOpen(false)} aria-label="Close search"><X /></Button></div><ScrollArea className="max-h-72"><div className="grid gap-1 p-2">{visibleFiles.map((file) => <button type="button" key={file.id} onClick={() => { setSelectedId(file.id); setCommandOpen(false); }} className="flex items-center gap-3 rounded-lg p-3 text-left hover:bg-muted"><FileGlyph file={file} /><span className="min-w-0"><span className="block truncate text-sm font-medium">{file.name}</span><span className="block text-xs text-muted-foreground">{file.owner} · {file.type}</span></span><ChevronRight className="ml-auto size-4 text-muted-foreground" /></button>)}{visibleFiles.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No files found.</p>}</div></ScrollArea></DialogContent></Dialog>

    <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}><DialogContent><DialogHeader><DialogTitle>Create a folder</DialogTitle><DialogDescription>This mock interaction stays in the browser until the storage phase is connected.</DialogDescription></DialogHeader><Input autoFocus value={folderName} onChange={(event) => setFolderName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") createFolder(); }} placeholder="Folder name" aria-label="Folder name" /><DialogFooter><Button variant="outline" onClick={() => setNewFolderOpen(false)}>Cancel</Button><Button onClick={createFolder} disabled={!folderName.trim()}>Create folder</Button></DialogFooter></DialogContent></Dialog>

    <Sheet open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelectedId(null); }}><SheetContent><SheetHeader><SheetTitle>{selected?.name ?? "File details"}</SheetTitle><SheetDescription>{selected?.type} · mock workspace item</SheetDescription></SheetHeader>{selected && <ScrollArea className="flex-1"><div className="grid gap-6 px-4 pb-6"><div className="grid place-items-center rounded-2xl bg-muted/50 py-10"><FileGlyph file={selected} open /></div><div className="grid gap-4"><div><p className="text-xs text-muted-foreground">Owner</p><p className="mt-1 font-medium">{selected.owner}</p></div><div><p className="text-xs text-muted-foreground">Last modified</p><p className="mt-1 font-medium">{selected.modified}</p></div><div><p className="text-xs text-muted-foreground">Size</p><p className="mt-1 font-medium">{selected.size}</p></div></div><Separator /><div className="grid gap-2"><Button onClick={() => showNotice(`Preview for ${selected.name} is staged for Phase 4`)}><FileText data-icon="inline-start" />Preview file</Button><Button variant="outline" onClick={() => showNotice("Download workflow arrives with Phase 2 storage")}><ArrowDownToLine data-icon="inline-start" />Download</Button><Button variant="destructive" onClick={() => setDeleteOpen(true)}><Trash2 data-icon="inline-start" />Move to Recycle bin</Button></div></div></ScrollArea>}</SheetContent></Sheet>

    <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}><DialogContent><DialogHeader><DialogTitle>Move to Recycle bin?</DialogTitle><DialogDescription>{selected ? `${selected.name} will be moved to the recoverable Recycle bin in the connected workspace.` : "This item will be moved to the recoverable Recycle bin."}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button><Button variant="destructive" onClick={removeSelected}>Move to Recycle bin</Button></DialogFooter></DialogContent></Dialog>

    <div aria-live="polite" className="sr-only">{notice}</div>
  </TooltipProvider>;
}
