"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type SearchKind = "all" | "file" | "folder";

type Props = Readonly<{
  loading?: boolean;
  onSearch: (query: string, kind: SearchKind) => void;
  onClear?: () => void;
}>;

export function SearchBar({ loading = false, onSearch, onClear }: Props) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<SearchKind>("all");
  const lastSubmitted = useRef("");

  useEffect(() => {
    const normalized = query.trim();
    if (!normalized) return;
    const submissionKey = `${kind}:${normalized}`;
    const timer = window.setTimeout(() => {
      if (lastSubmitted.current === submissionKey) return;
      lastSubmitted.current = submissionKey;
      onSearch(normalized, kind);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [kind, onSearch, query]);

  function submit() {
    const normalized = query.trim();
    if (!normalized) return;
    lastSubmitted.current = `${kind}:${normalized}`;
    onSearch(normalized, kind);
  }

  function clear() {
    setQuery("");
    lastSubmitted.current = "";
    onClear?.();
  }

  return <div role="search" className="flex w-full max-w-4xl flex-wrap items-center gap-2">
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); submit(); } }}
        placeholder="Search files, folders, and supported content"
        aria-label="Search workspace"
        className="h-9 pr-10 pl-10"
      />
      {query && <Button type="button" variant="ghost" size="icon-sm" onClick={clear} aria-label="Clear search" className="absolute top-1/2 right-2 -translate-y-1/2"><X /></Button>}
    </div>
    <label className="flex h-9 items-center gap-2 rounded-lg border bg-background px-3 text-sm text-muted-foreground transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
      <span className="sr-only">Search item type</span>
      <select aria-label="Search item type" className="bg-transparent text-foreground outline-none" value={kind} onChange={(event) => setKind(event.target.value as SearchKind)}>
        <option value="all">All items</option>
        <option value="file">Files</option>
        <option value="folder">Folders</option>
      </select>
    </label>
    <Button type="button" size="lg" aria-label="Search workspace" onClick={submit} disabled={!query.trim() || loading}>
      {loading ? <LoaderCircle data-icon="inline-start" className="motion-safe:animate-spin" /> : <Search data-icon="inline-start" />}
      <span className="hidden sm:inline">Search</span>
    </Button>
    <span className="sr-only" aria-live="polite">{loading ? "Searching…" : ""}</span>
  </div>;
}
