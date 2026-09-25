import { FileApiError } from "@/features/files/file-api";
import type { SearchResult } from "./search-repository";
import type { Favorite, RecentItem } from "./types";

export type SearchFilesInput = Readonly<{
  query: string;
  path?: string;
  kind?: "file" | "folder";
  limit?: number;
  cursor?: string;
  signal?: AbortSignal;
}>;
export type SearchFilesResponse = Readonly<{
  items: SearchResult[];
  nextCursor: string | null;
  index: Readonly<{ status: "pending" | "indexing" | "ready" | "error" }>;
}>;

export async function searchFiles(
  input: SearchFilesInput
): Promise<SearchFilesResponse> {
  const params = new URLSearchParams({ q: input.query });
  if (input.path) params.set("path", input.path);
  if (input.kind) params.set("kind", input.kind);
  if (input.limit !== undefined) params.set("limit", String(input.limit));
  if (input.cursor) params.set("cursor", input.cursor);
  const response = await fetch(`/api/search?${params}`, {
    signal: input.signal,
  });
  const body = (await response
    .json()
    .catch(() => ({}))) as SearchFilesResponse & { error?: string };
  if (!response.ok)
    throw new FileApiError(body.error ?? "SEARCH_ERROR", response.status);
  return body;
}

async function discoveryRequest<T>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok)
    throw new FileApiError(body.error ?? "DISCOVERY_ERROR", response.status);
  return body;
}

export async function listFavorites(signal?: AbortSignal): Promise<Favorite[]> {
  return (
    await discoveryRequest<{ items: Favorite[] }>("/api/discovery/favorites", {
      signal,
    })
  ).items;
}

export async function setFavorite(
  path: string,
  favorite: boolean
): Promise<void> {
  await discoveryRequest("/api/discovery/favorites", {
    method: "PUT",
    body: JSON.stringify({ path, favorite }),
  });
}

export async function listRecent(signal?: AbortSignal): Promise<RecentItem[]> {
  return (
    await discoveryRequest<{ items: RecentItem[] }>(
      "/api/discovery/recent?limit=12",
      { signal }
    )
  ).items;
}
