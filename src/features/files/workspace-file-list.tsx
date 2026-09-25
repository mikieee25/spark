"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ArrowDownToLine,
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  File,
  Folder,
  Image,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { downloadUrl, type FileEntry } from "./file-api";

export type WorkspaceViewMode =
  | "extra-large-icons"
  | "large-icons"
  | "medium-icons"
  | "small-icons"
  | "list"
  | "details"
  | "tiles"
  | "content";
type SortField = "name" | "size" | "modified";
const PREFERENCES_KEY = "spark-workspace-preferences";
const PAGE_SIZES = [25, 50, 100];
type WorkspacePreferences = Readonly<{
  viewMode: WorkspaceViewMode;
  sortField: SortField;
  sortDirection: "asc" | "desc";
  pageSize: number;
}>;
const DEFAULT_PREFERENCES: WorkspacePreferences = {
  viewMode: "details",
  sortField: "name",
  sortDirection: "asc",
  pageSize: 50,
};

function subscribePreferences(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("spark-workspace-preferences", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("spark-workspace-preferences", onChange);
  };
}

function getPreferencesSnapshot(): string {
  try {
    return window.localStorage.getItem(PREFERENCES_KEY) ?? "";
  } catch {
    return "";
  }
}

function parsePreferences(snapshot: string): WorkspacePreferences {
  try {
    const value = JSON.parse(snapshot) as Record<string, unknown>;
    return {
      viewMode: VIEW_MODES.some((mode) => mode.value === value.viewMode)
        ? (value.viewMode as WorkspaceViewMode)
        : DEFAULT_PREFERENCES.viewMode,
      sortField:
        value.sortField === "size" || value.sortField === "modified"
          ? value.sortField
          : DEFAULT_PREFERENCES.sortField,
      sortDirection:
        value.sortDirection === "desc"
          ? "desc"
          : DEFAULT_PREFERENCES.sortDirection,
      pageSize: PAGE_SIZES.includes(value.pageSize as number)
        ? (value.pageSize as number)
        : DEFAULT_PREFERENCES.pageSize,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function savePreferences(preferences: WorkspacePreferences): void {
  try {
    window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
    window.dispatchEvent(new Event("spark-workspace-preferences"));
  } catch {
    /* Keep the active view usable when browser storage is unavailable. */
  }
}

const VIEW_MODES: Array<{ value: WorkspaceViewMode; label: string }> = [
  { value: "extra-large-icons", label: "Extra large icons" },
  { value: "large-icons", label: "Large icons" },
  { value: "medium-icons", label: "Medium icons" },
  { value: "small-icons", label: "Small icons" },
  { value: "list", label: "List" },
  { value: "details", label: "Details" },
  { value: "tiles", label: "Tiles" },
  { value: "content", label: "Content" },
];
const ICON_SIZES: Record<WorkspaceViewMode, string> = {
  "extra-large-icons": "size-16",
  "large-icons": "size-12",
  "medium-icons": "size-9",
  "small-icons": "size-7",
  list: "size-7",
  details: "size-7",
  tiles: "size-10",
  content: "size-10",
};
const VIEW_GRID: Record<WorkspaceViewMode, string> = {
  "extra-large-icons":
    "grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5",
  "large-icons": "grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 xl:grid-cols-6",
  "medium-icons": "grid grid-cols-3 gap-3 p-4 sm:grid-cols-5 xl:grid-cols-8",
  "small-icons":
    "grid grid-cols-2 gap-2 p-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-10",
  list: "divide-y",
  details: "divide-y",
  tiles: "grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-3",
  content: "divide-y",
};

function openUrl(entry: FileEntry): string {
  return entry.kind === "folder"
    ? `/files?path=${encodeURIComponent(entry.logicalPath)}`
    : `/files?preview=${encodeURIComponent(entry.logicalPath)}`;
}

function ItemIcon({
  entry,
  mode,
}: {
  entry: FileEntry;
  mode: WorkspaceViewMode;
}) {
  const Icon =
    entry.kind === "folder"
      ? Folder
      : /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(entry.name)
        ? Image
        : File;
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-xl bg-accent text-primary ${mode.startsWith("extra-large") ? "size-24" : mode.startsWith("large") ? "size-20" : mode.startsWith("medium") ? "size-14" : mode === "small-icons" || mode === "list" || mode === "details" ? "size-10" : "size-12"}`}
    >
      <Icon className={ICON_SIZES[mode]} aria-hidden="true" />
    </span>
  );
}

export function WorkspaceFileList({
  entries,
  selectedPath,
  selectedPaths,
  batchBusy,
  batchMessage,
  batchMessageIsError,
  onSelect,
  onOpen,
  onRename,
  onDelete,
  onToggleFavorite,
  onToggleSelection,
  onToggleAllSelection,
  onDownloadSelected,
  onRecycleSelected,
  isFavorite,
}: Readonly<{
  entries: readonly FileEntry[];
  selectedPath: string | null;
  selectedPaths: ReadonlySet<string>;
  batchBusy: "download" | "recycle" | null;
  batchMessage: string;
  batchMessageIsError: boolean;
  onSelect: (entry: FileEntry) => void;
  onOpen: (entry: FileEntry) => void;
  onRename: (entry: FileEntry) => void;
  onDelete: (entry: FileEntry) => void;
  onToggleFavorite: (entry: FileEntry) => void;
  onToggleSelection: (path: string, selected: boolean) => void;
  onToggleAllSelection: (selected: boolean) => void;
  onDownloadSelected: () => void;
  onRecycleSelected: () => void;
  isFavorite: (path: string) => boolean;
}>) {
  const [page, setPage] = useState(1);
  const preferencesSnapshot = useSyncExternalStore(
    subscribePreferences,
    getPreferencesSnapshot,
    () => ""
  );
  const preferences = useMemo(
    () => parsePreferences(preferencesSnapshot),
    [preferencesSnapshot]
  );
  const { viewMode, sortField, sortDirection, pageSize } = preferences;
  const selectionTimer = useRef<number | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const sortedEntries = useMemo(
    () =>
      [...entries].sort((left, right) => {
        if (left.kind !== right.kind) return left.kind === "folder" ? -1 : 1;
        const result =
          sortField === "name"
            ? left.name.localeCompare(right.name, undefined, {
                numeric: true,
                sensitivity: "base",
              })
            : sortField === "size"
              ? left.sizeBytes - right.sizeBytes
              : Date.parse(left.modifiedAt) - Date.parse(right.modifiedAt);
        return result === 0
          ? left.logicalPath.localeCompare(right.logicalPath)
          : sortDirection === "asc"
            ? result
            : -result;
      }),
    [entries, sortDirection, sortField]
  );
  const pageCount = Math.max(1, Math.ceil(sortedEntries.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageEntries = sortedEntries.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );
  const allSelected =
    entries.length > 0 &&
    entries.every((entry) => selectedPaths.has(entry.logicalPath));
  const someSelected = entries.some((entry) =>
    selectedPaths.has(entry.logicalPath)
  );

  useEffect(
    () => () => {
      if (selectionTimer.current !== null)
        window.clearTimeout(selectionTimer.current);
    },
    []
  );
  useEffect(() => {
    if (selectAllRef.current)
      selectAllRef.current.indeterminate = someSelected && !allSelected;
  }, [allSelected, someSelected]);

  function updatePreferences(next: Partial<WorkspacePreferences>) {
    savePreferences({ ...preferences, ...next });
  }

  function row(entry: FileEntry, dense = false) {
    const selected = selectedPath === entry.logicalPath;
    const checked = selectedPaths.has(entry.logicalPath);
    const iconMode = viewMode.includes("icons");
    const rowClass = `group/entry relative flex w-full min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${iconMode ? "min-h-36 flex-col items-center justify-center gap-2 p-3 text-center" : `items-center gap-3 text-left ${dense ? "px-3 py-2" : "px-4 py-3"}`} ${selected || checked ? "bg-accent" : "hover:bg-muted/60"}`;
    return (
      <ContextMenu key={entry.logicalPath}>
        <ContextMenuTrigger
          render={
            <div
              role="listitem"
              className={rowClass}
              data-selected={selected ? "true" : "false"}
            />
          }
        >
          <input
            type="checkbox"
            aria-label={`${checked ? "Deselect" : "Select"} ${entry.name}`}
            checked={checked}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) =>
              onToggleSelection(entry.logicalPath, event.target.checked)
            }
            className={`size-4 shrink-0 cursor-pointer rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${iconMode ? "absolute top-2 left-2" : ""}`}
          />
          <button
            type="button"
            className={`flex min-w-0 focus-visible:outline-none ${iconMode ? "w-full flex-col items-center gap-2 text-center" : "flex-1 items-center gap-3 text-left"}`}
            aria-label={entry.name}
            aria-pressed={selected}
            onClick={() => {
              if (selectionTimer.current !== null)
                window.clearTimeout(selectionTimer.current);
              selectionTimer.current = window.setTimeout(() => {
                selectionTimer.current = null;
                onSelect(entry);
              }, 300);
            }}
            onDoubleClick={() => {
              if (selectionTimer.current !== null)
                window.clearTimeout(selectionTimer.current);
              selectionTimer.current = null;
              onOpen(entry);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (selectionTimer.current !== null)
                  window.clearTimeout(selectionTimer.current);
                selectionTimer.current = null;
                onOpen(entry);
              }
            }}
          >
            <ItemIcon entry={entry} mode={viewMode} />
            <span className={`${iconMode ? "w-full" : "min-w-0 flex-1"}`}>
              <span className="block truncate font-medium">{entry.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {entry.kind === "folder"
                  ? "Folder"
                  : `${formatSize(entry.sizeBytes)} · ${formatDate(entry.modifiedAt)}`}
              </span>
            </span>
          </button>
          {viewMode === "details" && (
            <>
              <span className="hidden w-24 text-sm text-muted-foreground md:block">
                {formatSize(entry.sizeBytes)}
              </span>
              <time
                className="hidden w-36 text-sm text-muted-foreground lg:block"
                dateTime={entry.modifiedAt}
              >
                {formatDate(entry.modifiedAt)}
              </time>
            </>
          )}
          {(viewMode === "list" || viewMode === "details") && (
            <span className="sr-only">{entry.kind}</span>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={iconMode ? "absolute top-1 right-1" : undefined}
            aria-label={`Actions for ${entry.name}`}
            onClick={() => onSelect(entry)}
          >
            <MoreHorizontal />
          </Button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => onOpen(entry)}>
            {entry.kind === "folder" ? "Open folder" : "Open details"}
          </ContextMenuItem>
          <ContextMenuItem
            render={
              <a
                href={openUrl(entry)}
                target="_blank"
                rel="noopener noreferrer"
              />
            }
          >
            Open in new tab
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              window.open(
                openUrl(entry),
                "_blank",
                "popup,width=1200,height=800,noopener,noreferrer"
              );
            }}
          >
            Open in new window
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem render={<a href={downloadUrl(entry.logicalPath)} />}>
            <ArrowDownToLine />
            Download
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onToggleFavorite(entry)}>
            {isFavorite(entry.logicalPath)
              ? "Remove from favorites"
              : "Add to favorites"}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onRename(entry)}>
            Rename
          </ContextMenuItem>
          <ContextMenuItem
            variant="destructive"
            onClick={() => onDelete(entry)}
          >
            Move to Recycle bin
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      data-view-mode={viewMode}
      role="region"
      aria-label="Workspace files"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-center gap-2">
          {entries.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                ref={selectAllRef}
                type="checkbox"
                aria-label="Select all items in current folder"
                checked={allSelected}
                onChange={(event) => onToggleAllSelection(event.target.checked)}
                className="size-4 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              Select all
            </label>
          )}
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            View
            <select
              aria-label="View mode"
              className="h-10 rounded-lg border bg-background px-3 text-sm text-foreground"
              value={viewMode}
              onChange={(event) =>
                updatePreferences({
                  viewMode: event.target.value as WorkspaceViewMode,
                })
              }
            >
              {VIEW_MODES.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Sort by
            <select
              aria-label="Sort by"
              className="h-10 rounded-lg border bg-background px-3 text-sm text-foreground"
              value={sortField}
              onChange={(event) => {
                updatePreferences({
                  sortField: event.target.value as SortField,
                });
                setPage(1);
              }}
            >
              <option value="name">Name</option>
              <option value="size">Size</option>
              <option value="modified">Date modified</option>
            </select>
          </label>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={
              sortDirection === "asc" ? "Sort ascending" : "Sort descending"
            }
            onClick={() =>
              updatePreferences({
                sortDirection: sortDirection === "asc" ? "desc" : "asc",
              })
            }
          >
            {sortDirection === "asc" ? (
              <ArrowDownWideNarrow />
            ) : (
              <ArrowUpWideNarrow />
            )}
          </Button>
          {selectedPaths.size > 0 && (
            <>
              <span
                className="text-xs font-medium text-muted-foreground"
                role="status"
              >
                {selectedPaths.size} selected
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={batchBusy !== null}
                onClick={onDownloadSelected}
                aria-label="Download selected"
              >
                <ArrowDownToLine data-icon="inline-start" />
                {batchBusy === "download"
                  ? "Preparing ZIP…"
                  : "Download selected"}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={batchBusy !== null}
                onClick={onRecycleSelected}
                aria-label="Move selected to Recycle bin"
              >
                <Trash2 data-icon="inline-start" />
                Move selected to Recycle bin
              </Button>
            </>
          )}
          {batchMessage && (
            <span
              className="basis-full text-xs text-muted-foreground"
              role={batchMessageIsError ? "alert" : "status"}
            >
              {batchMessage}
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {entries.length} items
        </span>
      </div>
      {viewMode === "details" && (
        <div className="hidden shrink-0 grid-cols-[1.5rem_minmax(0,1fr)_6rem_9rem_auto] items-center gap-3 border-b bg-card px-6 py-2 text-xs font-medium text-muted-foreground md:grid">
          <span />
          <span>Name</span>
          <span>Size</span>
          <span>Modified</span>
          <span />
        </div>
      )}
      <div
        role="region"
        aria-label="File list scroll area"
        tabIndex={0}
        className="min-h-0 flex-1 overflow-x-auto overflow-y-auto overscroll-contain"
      >
        <div
          role="list"
          aria-label="File and folder entries"
          className={VIEW_GRID[viewMode]}
        >
          {pageEntries.map((entry) => (
            <div
              className={
                viewMode.includes("icons")
                  ? "flex min-w-0 flex-col items-center gap-2 rounded-xl p-2 text-center"
                  : viewMode === "tiles"
                    ? "rounded-xl border"
                    : ""
              }
              key={entry.logicalPath}
            >
              {row(
                entry,
                viewMode === "small-icons" ||
                  viewMode === "list" ||
                  viewMode === "details"
              )}
            </div>
          ))}
        </div>
      </div>
      {entries.length > 0 && (
        <PaginationControls
          label="Workspace files"
          totalItems={entries.length}
          page={currentPage}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            updatePreferences({ pageSize: size });
            setPage(1);
          }}
        />
      )}
    </section>
  );
}

function formatSize(size: number): string {
  if (!size) return "—";
  if (size < 1_024) return `${size} B`;
  if (size < 1_048_576) return `${(size / 1_024).toFixed(1)} KB`;
  return `${(size / 1_048_576).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
