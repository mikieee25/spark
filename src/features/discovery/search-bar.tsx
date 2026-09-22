"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = Readonly<{
  loading?: boolean;
  onSearch: (query: string) => void;
  onClear?: () => void;
}>;

export function SearchBar({ loading = false, onSearch, onClear }: Props) {
  const [query, setQuery] = useState("");
  const lastSubmitted = useRef("");

  useEffect(() => {
    const normalized = query.trim();
    if (!normalized) return;
    const timer = window.setTimeout(() => {
      if (lastSubmitted.current === normalized) return;
      lastSubmitted.current = normalized;
      onSearch(normalized);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [onSearch, query]);

  function submit() {
    const normalized = query.trim();
    if (!normalized) return;
    lastSubmitted.current = normalized;
    onSearch(normalized);
  }

  function clear() {
    setQuery("");
    lastSubmitted.current = "";
    onClear?.();
  }

  return <div role="search" className="flex w-full max-w-3xl items-center gap-2">
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); submit(); } }}
        placeholder="Search names and supported file contents"
        aria-label="Search workspace"
        className="h-11 pr-10 pl-10"
      />
      {query && <Button type="button" variant="ghost" size="icon-sm" onClick={clear} aria-label="Clear search" className="absolute top-1/2 right-2 -translate-y-1/2"><X /></Button>}
    </div>
    <Button type="button" size="lg" aria-label="Search workspace" onClick={submit} disabled={!query.trim() || loading}>
      {loading ? <LoaderCircle data-icon="inline-start" className="motion-safe:animate-spin" /> : <Search data-icon="inline-start" />}
      <span className="hidden sm:inline">Search</span>
    </Button>
    <span className="sr-only" aria-live="polite">{loading ? "Searching…" : ""}</span>
  </div>;
}
