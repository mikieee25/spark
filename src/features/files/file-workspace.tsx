"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, ArrowLeft, Clock3, File, Folder, FolderUp, LoaderCircle, Plus, Star, Trash2, Upload, X } from "lucide-react";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PreviewPanel, type PreviewItem } from "@/features/discovery/preview-panel";
import { SearchBar, type SearchKind } from "@/features/discovery/search-bar";
import { listRecent, searchFiles, setFavorite, type SearchFilesResponse } from "@/features/discovery/search-api";
import type { SearchResult } from "@/features/discovery/search-repository";
import type { Favorite, RecentItem } from "@/features/discovery/types";
import { createFolder, deleteFile, downloadUrl, FileApiError, listFiles, moveFile, uploadFile, uploadFolder, type ConflictPolicy, type FileEntry } from "./file-api";
import { WorkspaceFileList } from "./workspace-file-list";

type SelectedItem = FileEntry & { mimeType?: string };
type SearchState = "idle" | "loading" | "success" | "error";
type FolderConflict = Readonly<{ file: File; logicalPath: string }>;
type Props = Readonly<{ initialPath: string; initialEntries: FileEntry[] | null; initialPreview?: string; initialFavorites?: Favorite[]; initialRecent?: RecentItem[] }>;
const AUTO_REFRESH_STORAGE_KEY = "spark-auto-refresh-seconds";
const AUTO_REFRESH_OPTIONS = [
  { value: 0, label: "Off" },
  { value: 15, label: "15 seconds" },
  { value: 30, label: "30 seconds" },
  { value: 60, label: "1 minute" },
  { value: 300, label: "5 minutes" },
] as const;
const FOLDER_CACHE_LIMIT = 64;
const SEARCH_INDEX_REFRESH_MS = 2_000;

function rememberFolder(cache: Map<string, FileEntry[]>, logicalPath: string, entries: FileEntry[]) {
  cache.delete(logicalPath);
  cache.set(logicalPath, entries);
  while (cache.size > FOLDER_CACHE_LIMIT) cache.delete(cache.keys().next().value!);
}

function formatSize(size: number): string {
  if (!size) return "—";
  if (size < 1_024) return `${size} B`;
  if (size < 1_048_576) return `${(size / 1_024).toFixed(1)} KB`;
  return `${(size / 1_048_576).toFixed(1)} MB`;
}

function baseName(logicalPath: string): string {
  return logicalPath.split("/").at(-1) ?? logicalPath;
}

function parentPath(logicalPath: string): string {
  return logicalPath.split("/").slice(0, -1).join("/");
}

function FileGlyph({ entry }: { entry: Pick<FileEntry, "kind"> }) {
  const Icon = entry.kind === "folder" ? Folder : File;
  return <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-primary"><Icon className="size-5" aria-hidden="true" /></span>;
}

function DiscoveryList({ title, icon: Icon, items, empty, onSelect }: Readonly<{
  title: string;
  icon: typeof Star;
  items: Array<{ logicalPath: string }>;
  empty: string;
  onSelect: (path: string) => void;
}>) {
  const singular = title === "Favorites" ? "favorite" : "recent item";
  return <Card className="shadow-none"><CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Icon className="size-4 text-primary" aria-hidden="true" />{title}</CardTitle></CardHeader><CardContent>{items.length ? <ul className="flex flex-col gap-1">{items.slice(0, 6).map((item) => { const name = baseName(item.logicalPath); return <li key={item.logicalPath}><Button variant="ghost" className="h-auto w-full justify-start px-2 py-2 text-left" onClick={() => onSelect(item.logicalPath)} aria-label={`Open ${singular} ${name}`}><span className="min-w-0 truncate">{name}</span></Button></li>; })}</ul> : <p className="text-sm text-muted-foreground">{empty}</p>}</CardContent></Card>;
}

export function FileWorkspace({ initialPath, initialEntries, initialPreview, initialFavorites = [], initialRecent = [] }: Props) {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [entries, setEntries] = useState(initialEntries ?? []);
  const [selected, setSelected] = useState<SelectedItem | null>(() => initialPreview ? { name: baseName(initialPreview), logicalPath: initialPreview, kind: "file", sizeBytes: 0, modifiedAt: new Date(0).toISOString() } : null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [renameName, setRenameName] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [favorites, setFavorites] = useState(initialFavorites);
  const [recent, setRecent] = useState(initialRecent);
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchKind, setSearchKind] = useState<SearchKind>("all");
  const [searchResult, setSearchResult] = useState<SearchFilesResponse>({ items: [], nextCursor: null, index: { status: "ready" } });
  const [folderProgress, setFolderProgress] = useState<{ completed: number; total: number; logicalPath: string } | null>(null);
  const [uploadingFile, setUploadingFile] = useState<string | null>(null);
  const [openingPath, setOpeningPath] = useState<string | null>(null);
  const [folderLoading, setFolderLoading] = useState(initialEntries === null);
  const [autoRefreshSeconds, setAutoRefreshSeconds] = useState(60);
  const [folderConflict, setFolderConflict] = useState<FolderConflict | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const folderConflictResolver = useRef<((choice: ConflictPolicy | "cancel") => void) | null>(null);
  const searchController = useRef<AbortController>(null);
  const uploadController = useRef<AbortController>(null);
  const autoRefreshController = useRef<AbortController>(null);
  const navigationController = useRef<AbortController>(null);
  const navigationSequence = useRef(0);
  const folderCache = useRef(new Map<string, FileEntry[]>(initialEntries ? [[initialPath, initialEntries]] : []));

  useEffect(() => () => {
    searchController.current?.abort();
    uploadController.current?.abort();
    autoRefreshController.current?.abort();
    navigationController.current?.abort();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = Number(window.localStorage.getItem(AUTO_REFRESH_STORAGE_KEY));
      if (AUTO_REFRESH_OPTIONS.some((option) => option.value === stored)) setAutoRefreshSeconds(stored);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (initialEntries !== null) return;
    const controller = new AbortController();
    const sequence = ++navigationSequence.current;
    navigationController.current = controller;
    void listFiles(initialPath, controller.signal).then((result) => {
      if (controller.signal.aborted || sequence !== navigationSequence.current) return;
      rememberFolder(folderCache.current, result.path, result.entries);
      setCurrentPath(result.path);
      setEntries(result.entries);
      setError("");
    }).catch((cause) => {
      if (!controller.signal.aborted && sequence === navigationSequence.current) setError(cause instanceof Error ? cause.message : "Unable to open folder");
    }).finally(() => {
      if (sequence === navigationSequence.current) {
        setOpeningPath(null);
        setFolderLoading(false);
        navigationController.current = null;
      }
    });
    return () => controller.abort();
  }, [initialEntries, initialPath]);

  const refreshCurrentFolder = useCallback(async () => {
    if (openingPath !== null || folderProgress || uploadingFile || autoRefreshController.current) return;
    const controller = new AbortController();
    autoRefreshController.current = controller;
    try {
      const result = await listFiles(currentPath, controller.signal);
      if (!controller.signal.aborted) {
        rememberFolder(folderCache.current, result.path, result.entries);
        setEntries(result.entries);
      }
    } catch {
      // Preserve the current listing when a background refresh cannot complete.
    } finally {
      if (autoRefreshController.current === controller) autoRefreshController.current = null;
    }
  }, [currentPath, folderProgress, openingPath, uploadingFile]);

  useEffect(() => {
    if (!autoRefreshSeconds) return;
    const timer = window.setInterval(() => void refreshCurrentFolder(), autoRefreshSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [autoRefreshSeconds, refreshCurrentFolder]);

  function changeAutoRefresh(value: number) {
    setAutoRefreshSeconds(value);
    window.localStorage.setItem(AUTO_REFRESH_STORAGE_KEY, String(value));
  }

  const performSearch = useCallback(async (query: string, kind: SearchKind = searchKind) => {
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    setSearchQuery(query);
    setSearchState("loading");
    try {
      const result = await searchFiles({ query, path: currentPath || undefined, kind: kind === "all" ? undefined : kind, limit: 25, signal: controller.signal });
      if (!controller.signal.aborted) { setSearchResult(result); setSearchState("success"); }
    } catch (cause) {
      if (!controller.signal.aborted) setSearchState(cause instanceof DOMException && cause.name === "AbortError" ? "idle" : "error");
    }
  }, [currentPath, searchKind]);

  useEffect(() => {
    if (searchState !== "success" || !searchQuery || !["pending", "indexing"].includes(searchResult.index.status)) return;
    let refreshing = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const result = await searchFiles({ query: searchQuery, path: currentPath || undefined, kind: searchKind === "all" ? undefined : searchKind, limit: 25, signal: controller.signal });
        if (!controller.signal.aborted) setSearchResult(result);
      } catch {
        // Keep the last useful results and retry on the next interval.
      } finally {
        refreshing = false;
      }
    };
    const timer = window.setInterval(() => void refresh(), SEARCH_INDEX_REFRESH_MS);
    return () => { window.clearInterval(timer); controller.abort(); };
  }, [currentPath, searchKind, searchQuery, searchResult.index.status, searchState]);

  function submitSearch(query: string, kind: SearchKind) {
    setSearchKind(kind);
    void performSearch(query, kind);
  }

  const refreshRecent = useCallback(async () => {
    try { setRecent(await listRecent()); } catch { /* Preserve the existing list if a refresh fails. */ }
  }, []);

  async function navigateTo(logicalPath: string) {
    autoRefreshController.current?.abort();
    navigationController.current?.abort();
    const controller = new AbortController();
    const sequence = ++navigationSequence.current;
    navigationController.current = controller;
    const cached = folderCache.current.get(logicalPath);
    setError("");
    setOpeningPath(logicalPath);
    setFolderLoading(!cached);
    setCurrentPath(logicalPath);
    setEntries(cached ?? []);
    setSearchState("idle");
    setSelected(null);
    try {
      const result = await listFiles(logicalPath, controller.signal);
      if (controller.signal.aborted || sequence !== navigationSequence.current) return;
      rememberFolder(folderCache.current, result.path, result.entries);
      setCurrentPath(result.path);
      setEntries(result.entries);
      void refreshRecent();
    } catch (cause) {
      if (!controller.signal.aborted && sequence === navigationSequence.current) {
        setError(cause instanceof Error ? cause.message : "Unable to open folder");
      }
    } finally {
      if (sequence === navigationSequence.current) {
        setOpeningPath(null);
        setFolderLoading(false);
        navigationController.current = null;
      }
    }
  }

  async function openFolder(entry: Pick<FileEntry, "kind" | "logicalPath">) {
    if (entry.kind !== "folder") { setSelected(entry as SelectedItem); return; }
    await navigateTo(entry.logicalPath);
  }

  async function goBack() {
    if (currentPath) await navigateTo(parentPath(currentPath));
  }

  async function selectPath(logicalPath: string) {
    const known = entries.find((entry) => entry.logicalPath === logicalPath);
    if (known) { await openFolder(known); return; }
    try {
      const result = await listFiles(logicalPath);
      setCurrentPath(result.path);
      setEntries(result.entries);
      setSearchState("idle");
      void refreshRecent();
      return;
    } catch {
      // A recent or favorite file is not a directory; fall through to preview.
    }
    setSelected({ name: baseName(logicalPath), logicalPath, kind: "file", sizeBytes: 0, modifiedAt: new Date(0).toISOString() });
  }

  function selectSearchResult(result: SearchResult) {
    const entry: SelectedItem = { name: result.name, logicalPath: result.logicalPath, kind: result.kind, sizeBytes: result.sizeBytes, modifiedAt: result.modifiedAt, mimeType: result.mimeType };
    void openFolder(entry);
  }

  async function toggleFavorite(item: SelectedItem | null = selected) {
    if (!item) return;
    const isFavorite = favorites.some((favorite) => favorite.logicalPath === item.logicalPath);
    try {
      await setFavorite(item.logicalPath, !isFavorite);
      setFavorites((current) => isFavorite ? current.filter((favorite) => favorite.logicalPath !== item.logicalPath) : [{ userId: "", logicalPath: item.logicalPath, createdAt: new Date().toISOString() }, ...current]);
      setNotice(isFavorite ? `${item.name} removed from favorites.` : `${item.name} added to favorites.`);
    } catch { setError("Unable to update favorites"); }
  }

  async function submitFolder() {
    const name = folderName.trim();
    if (!name) return;
    const path = currentPath ? `${currentPath}/${name}` : name;
    try { const result = await createFolder(path); setEntries((current) => { const next = [result.item, ...current]; rememberFolder(folderCache.current, currentPath, next); return next; }); setFolderName(""); setNewFolderOpen(false); setNotice(`${name} created.`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create folder"); }
  }

  async function submitUpload(file: File) {
    const controller = new AbortController();
    uploadController.current = controller;
    setUploadingFile(file.name);
    setError("");
    try { await uploadFile({ directory: currentPath, file, signal: controller.signal }); const result = await listFiles(currentPath); rememberFolder(folderCache.current, currentPath, result.entries); setEntries(result.entries); setNotice(`${file.name} uploaded.`); }
    catch (cause) { setError(controller.signal.aborted || (cause instanceof DOMException && cause.name === "AbortError") ? "Upload cancelled." : cause instanceof Error ? cause.message : "Unable to upload file"); }
    finally { setUploadingFile(null); uploadController.current = null; }
  }

  function askFolderConflict(conflict: FolderConflict): Promise<ConflictPolicy | "cancel"> {
    return new Promise((resolve) => {
      folderConflictResolver.current = resolve;
      setFolderConflict(conflict);
    });
  }

  function resolveFolderConflict(choice: ConflictPolicy | "cancel") {
    folderConflictResolver.current?.(choice);
    folderConflictResolver.current = null;
    setFolderConflict(null);
  }

  async function submitFolderUpload(files: File[]) {
    if (!files.length) return;
    const controller = new AbortController();
    uploadController.current = controller;
    setFolderProgress({ completed: 0, total: files.length, logicalPath: files[0]?.name ?? "" });
    setError("");
    try {
      const result = await uploadFolder({ directory: currentPath, files, signal: controller.signal, onProgress: setFolderProgress, onConflict: askFolderConflict });
      const listing = await listFiles(currentPath);
      rememberFolder(folderCache.current, currentPath, listing.entries);
      setEntries(listing.entries);
      setNotice(`Uploaded ${result.uploaded} of ${files.length} files${result.skipped ? `; skipped ${result.skipped}` : ""}.`);
    } catch (cause) {
      setError(controller.signal.aborted || (cause instanceof Error && cause.message === "UPLOAD_CANCELLED") || (cause instanceof DOMException && cause.name === "AbortError") ? "Folder upload cancelled." : cause instanceof Error ? cause.message : "Unable to upload folder");
    } finally {
      setFolderProgress(null);
      uploadController.current = null;
    }
  }

  function cancelUpload() {
    uploadController.current?.abort();
    if (folderConflict) resolveFolderConflict("cancel");
  }

  async function submitDelete() {
    if (!selected) return;
    try { await deleteFile(selected.logicalPath); setEntries((current) => { const next = current.filter((entry) => entry.logicalPath !== selected.logicalPath); rememberFolder(folderCache.current, currentPath, next); return next; }); setFavorites((current) => current.filter((favorite) => favorite.logicalPath !== selected.logicalPath)); setSelected(null); setDeleteOpen(false); setNotice(`${selected.name} moved to Recycle bin.`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to delete item"); }
  }

  async function submitRename(conflict?: "replace") {
    if (!selected || !renameName.trim()) return;
    const destination = currentPath ? `${currentPath}/${renameName.trim()}` : renameName.trim();
    try { await moveFile({ source: selected.logicalPath, destination, conflict }); const result = await listFiles(currentPath); rememberFolder(folderCache.current, currentPath, result.entries); setEntries(result.entries); setRenameOpen(false); setConflictOpen(false); setSelected(null); setNotice(`${selected.name} renamed.`); }
    catch (cause) { if (cause instanceof FileApiError && cause.status === 409) setConflictOpen(true); else setError(cause instanceof Error ? cause.message : "Unable to rename item"); }
  }

  const selectedIsFavorite = useMemo(() => Boolean(selected && favorites.some((favorite) => favorite.logicalPath === selected.logicalPath)), [favorites, selected]);

  const isOpeningFolder = openingPath !== null;
  return <div className="mx-auto flex max-w-[1500px] flex-col gap-6">
    <Breadcrumb><BreadcrumbList><BreadcrumbItem><BreadcrumbLink href="/files">Workspace</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>{currentPath || "Shared files"}</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb>
    <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">My workspace</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Shared files</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">A calm, searchable home for DOE records, working files, and shared knowledge.</p></div><div className="flex flex-wrap items-center gap-2"><Button variant="outline" onClick={() => setNewFolderOpen(true)} disabled={Boolean(folderProgress || uploadingFile || isOpeningFolder)}><Plus data-icon="inline-start" />New folder</Button><Button variant="outline" onClick={() => folderInput.current?.click()} disabled={Boolean(folderProgress || uploadingFile || isOpeningFolder)}><FolderUp data-icon="inline-start" />Upload folder</Button><Button onClick={() => fileInput.current?.click()} disabled={Boolean(folderProgress || uploadingFile || isOpeningFolder)}><Upload data-icon="inline-start" />Upload</Button><input ref={fileInput} type="file" className="sr-only" aria-label="File upload" onChange={(event) => { const file = event.target.files?.[0]; if (file) void submitUpload(file); event.target.value = ""; }} /><input ref={(element) => { folderInput.current = element; element?.setAttribute("webkitdirectory", ""); }} type="file" className="sr-only" aria-label="Folder upload" onChange={(event) => { void submitFolderUpload(Array.from(event.target.files ?? [])); event.target.value = ""; }} /></div></div>
    <SearchBar loading={searchState === "loading"} onSearch={submitSearch} onClear={() => { searchController.current?.abort(); setSearchState("idle"); setSearchQuery(""); }} />
    <section aria-label="Search results" aria-live="polite">
      {searchState === "loading" && <Card className="shadow-none"><CardContent className="grid gap-3 py-4 sm:grid-cols-3"><Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14" /></CardContent></Card>}
      {searchState === "error" && <Card className="border-destructive/30 shadow-none"><CardContent className="flex flex-col items-start gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium text-destructive">Search is unavailable right now.</p><p className="text-sm text-muted-foreground">Your current folder remains available.</p></div><Button variant="outline" onClick={() => void performSearch(searchQuery, searchKind)} aria-label="Retry search">Retry</Button></CardContent></Card>}
      {searchState === "success" && ["pending", "indexing"].includes(searchResult.index.status) && <Card className="border-primary/20 shadow-none"><CardContent className="flex items-center gap-2 py-3" role="status"><LoaderCircle className="size-4 animate-spin text-primary" aria-hidden="true" /><p className="text-sm text-muted-foreground">Search index is building. Results may be incomplete; this search updates automatically.</p></CardContent></Card>}
      {searchState === "success" && searchResult.index.status === "error" && <Card className="border-destructive/30 shadow-none"><CardContent className="py-3" role="status"><p className="text-sm text-muted-foreground">Search indexing needs attention. Results may be incomplete.</p></CardContent></Card>}
      {searchState === "success" && <Card className="shadow-none"><CardHeader><CardTitle className="text-base">Search results</CardTitle><CardDescription>{searchResult.items.length ? `${searchResult.items.length} matches in ${currentPath || "Shared files"}` : ["pending", "indexing"].includes(searchResult.index.status) ? "No indexed matches yet; more may appear as indexing finishes." : searchResult.index.status === "error" ? "Indexing did not finish; results may be incomplete." : "No matches found"}</CardDescription></CardHeader>{searchResult.items.length > 0 && <CardContent><ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{searchResult.items.map((item) => <li key={item.logicalPath}><Button variant="ghost" className="h-auto w-full justify-start gap-3 border px-3 py-3 text-left" onClick={() => selectSearchResult(item)} aria-label={`Open search result ${item.name}`}><FileGlyph entry={item} /><span className="min-w-0"><span className="block truncate font-medium">{item.name}</span><span className="block truncate text-xs text-muted-foreground">{item.kind === "folder" ? "Folder" : "File"} · {item.logicalPath}</span></span></Button></li>)}</ul></CardContent>}</Card>}
    </section>
    {error && <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"><span>{error}</span><span className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={() => void navigateTo(currentPath)} aria-label="Retry folder">Retry</Button><Button variant="ghost" size="icon-sm" onClick={() => setError("")} aria-label="Dismiss error"><X /></Button></span></div>}
    {currentPath && <div><Button variant="outline" onClick={() => void goBack()} aria-label="Go back"><ArrowLeft data-icon="inline-start" />Back</Button></div>}
    <div className="grid gap-3 md:grid-cols-3"><Card className="shadow-none"><CardContent className="p-4"><p className="text-xs font-medium text-muted-foreground">Current folder</p><p className="mt-1 truncate text-lg font-semibold">{currentPath || "Shared files"}</p></CardContent></Card><Card className="shadow-none"><CardContent className="p-4"><p className="text-xs font-medium text-muted-foreground">Indexed results</p><p className="mt-1 text-lg font-semibold">{searchState === "success" ? searchResult.items.length : "—"}</p></CardContent></Card><Card className="shadow-none"><CardContent className="p-4"><p className="text-xs font-medium text-muted-foreground">Files and folders</p><p className="mt-1 text-lg font-semibold">{entries.length}</p></CardContent></Card></div>
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Card className="min-w-0 overflow-hidden shadow-none">
        <CardHeader className="gap-4 border-b bg-muted/20 px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div><CardTitle className="text-base">{currentPath || "My workspace"}</CardTitle><CardDescription className="mt-1">{entries.length} items</CardDescription></div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              {isOpeningFolder && <span role="status" aria-label="Opening folder" aria-live="polite" className="inline-flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />Opening folder…</span>}
              <label className="flex items-center gap-2 text-xs text-muted-foreground">Auto-refresh<select aria-label="Auto-refresh interval" className="h-10 rounded-lg border bg-background px-3 text-sm text-foreground" value={autoRefreshSeconds} onChange={(event) => changeAutoRefresh(Number(event.target.value))}>{AUTO_REFRESH_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {folderLoading ? <div role="status" aria-label="Loading folder contents" className="grid min-h-72 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3"><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div> : entries.length === 0 ? <div className="flex min-h-72 flex-col items-center justify-center gap-3 p-8 text-center"><Folder className="size-8 text-muted-foreground" /><h2 className="font-semibold">This folder is empty</h2><p className="text-sm text-muted-foreground">Create a folder or upload a file to begin.</p></div> : <WorkspaceFileList entries={entries} selectedPath={selected?.logicalPath ?? null} onSelect={setSelected} onOpen={(entry) => void openFolder(entry)} onRename={(entry) => { setSelected(entry); setRenameName(entry.name); setRenameOpen(true); }} onDelete={(entry) => { setSelected(entry); setDeleteOpen(true); }} onToggleFavorite={(entry) => void toggleFavorite(entry)} isFavorite={(logicalPath) => favorites.some((favorite) => favorite.logicalPath === logicalPath)} />}
        </CardContent>
      </Card>
      <aside aria-label="Discovery shortcuts" className="grid content-start gap-4 sm:grid-cols-2 lg:grid-cols-1"><DiscoveryList title="Favorites" icon={Star} items={favorites} empty="Favorite important files and folders for quick access." onSelect={selectPath} /><DiscoveryList title="Recent items" icon={Clock3} items={recent} empty="Files and folders you open will appear here." onSelect={selectPath} /></aside>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed bg-muted/20 px-4 py-3 text-xs text-muted-foreground"><span>Local-first workspace · OneDrive sync stays external to SPARK</span><span className="flex items-center gap-3" aria-live="polite">{folderProgress ? `Uploading ${folderProgress.completed} of ${folderProgress.total}: ${baseName(folderProgress.logicalPath)}` : uploadingFile ? `Uploading ${uploadingFile}…` : notice}{(folderProgress || uploadingFile) && <Button variant="outline" size="sm" onClick={cancelUpload}>Cancel upload</Button>}</span></div>
    <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}><DialogContent><DialogHeader><DialogTitle>Create a folder</DialogTitle><DialogDescription>The folder will be created in the current workspace.</DialogDescription></DialogHeader><Input autoFocus value={folderName} onChange={(event) => setFolderName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void submitFolder(); }} placeholder="Folder name" aria-label="Folder name" /><DialogFooter><Button variant="outline" onClick={() => setNewFolderOpen(false)}>Cancel</Button><Button onClick={() => void submitFolder()} disabled={!folderName.trim()}>Create folder</Button></DialogFooter></DialogContent></Dialog>
    {selected && <aside aria-label="Selected item details" className="fixed inset-y-0 right-0 z-40 flex w-full flex-col gap-4 overflow-y-auto border-l bg-popover pb-6 text-popover-foreground shadow-lg sm:w-3/4 sm:max-w-xl max-sm:inset-x-0 max-sm:inset-y-auto max-sm:bottom-0 max-sm:h-5/6 max-sm:rounded-t-2xl max-sm:border-l-0 max-sm:border-t">
      <header className="flex items-start justify-between gap-4 border-b p-4">
        <div className="min-w-0"><h2 className="truncate font-heading text-base font-medium">{selected.name}</h2><p className="text-sm text-muted-foreground">{selected.kind === "folder" ? "Folder" : "File"}{selected.sizeBytes > 0 ? ` · ${formatSize(selected.sizeBytes)}` : ""}</p></div>
        <Button variant="ghost" size="icon-sm" aria-label="Close details" onClick={() => setSelected(null)}><X /></Button>
      </header>
      <div className="flex flex-col gap-4 px-4">{selected.kind === "file" && <PreviewPanel item={selected as PreviewItem} onPreviewed={refreshRecent} />}<Button variant="outline" onClick={() => void toggleFavorite()}><Star data-icon="inline-start" fill={selectedIsFavorite ? "currentColor" : "none"} />{selectedIsFavorite ? "Remove from favorites" : "Add to favorites"}</Button><a className={buttonVariants()} href={downloadUrl(selected.logicalPath)}><ArrowDownToLine data-icon="inline-start" />{selected.kind === "file" ? "Download" : "Download folder"}</a><Button variant="outline" onClick={() => { setRenameName(selected.name); setRenameOpen(true); }}>Rename</Button><Button variant="destructive" onClick={() => setDeleteOpen(true)}><Trash2 data-icon="inline-start" />Move to Recycle bin</Button></div>
    </aside>}
    <Dialog open={renameOpen} onOpenChange={setRenameOpen}><DialogContent><DialogHeader><DialogTitle>Rename item</DialogTitle><DialogDescription>Choose a new name for {selected?.name}.</DialogDescription></DialogHeader><Input value={renameName} onChange={(event) => setRenameName(event.target.value)} aria-label="New name" /><DialogFooter><Button variant="outline" onClick={() => setRenameOpen(false)}>Cancel</Button><Button onClick={() => void submitRename()}>Rename</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={conflictOpen} onOpenChange={setConflictOpen}><DialogContent><DialogHeader><DialogTitle>Destination already exists</DialogTitle><DialogDescription>A file or folder already has that name. Replacing it creates a recoverable version.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setConflictOpen(false)}>Choose another name</Button><Button variant="destructive" onClick={() => void submitRename("replace")}>Replace existing file</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(folderConflict)} onOpenChange={(open) => { if (!open) resolveFolderConflict("cancel"); }}><DialogContent><DialogHeader><DialogTitle>File already exists</DialogTitle><DialogDescription>{folderConflict?.logicalPath} is already in the destination. Choose how to continue.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => resolveFolderConflict("cancel")}>Cancel upload</Button><Button variant="outline" onClick={() => resolveFolderConflict("skip")}>Skip</Button><Button variant="outline" onClick={() => resolveFolderConflict("rename")}>Keep both</Button><Button variant="destructive" onClick={() => resolveFolderConflict("replace")}>Replace</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}><DialogContent><DialogHeader><DialogTitle>Move to Recycle bin?</DialogTitle><DialogDescription>{selected?.name} will be moved to the recoverable Recycle bin.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button><Button variant="destructive" onClick={() => void submitDelete()}>Move to Recycle bin</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
