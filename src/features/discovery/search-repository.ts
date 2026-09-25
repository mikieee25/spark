import type Database from "better-sqlite3";
import { normalizeLogicalPath } from "@/features/files/path-policy";

export type SearchInput = Readonly<{
  query: string;
  pathPrefix?: string;
  kind?: "file" | "folder";
  limit?: number;
  cursor?: string;
}>;

export type SearchResult = Readonly<{
  logicalPath: string;
  name: string;
  kind: "file" | "folder";
  sizeBytes: number;
  modifiedAt: string;
  extension: string;
  mimeType: string;
}>;

const MAX_RESULTS = 100;

function encodeCursor(logicalPath: string): string {
  return Buffer.from(JSON.stringify({ logicalPath }), "utf8").toString(
    "base64url"
  );
}

function decodeCursor(cursor: string | undefined): string | undefined {
  if (!cursor) return undefined;
  try {
    const value = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8")
    ) as { logicalPath?: unknown };
    if (typeof value.logicalPath !== "string" || !value.logicalPath)
      throw new Error();
    return normalizeLogicalPath(value.logicalPath);
  } catch {
    throw new Error("INVALID_CURSOR");
  }
}

function normalizePathPrefix(
  pathPrefix: string | undefined
): string | undefined {
  if (pathPrefix === undefined) return undefined;
  try {
    return normalizeLogicalPath(pathPrefix);
  } catch {
    throw new Error("INVALID_PATH");
  }
}

function toFtsQuery(query: string): string {
  const tokens = (query.trim().match(/[\p{L}\p{N}_-]+/gu) ?? [])
    ?.map((token) => token.trim())
    .filter((token) => token && !/^(AND|OR|NOT|NEAR)$/iu.test(token));
  if (!tokens.length) throw new Error("INVALID_QUERY");
  return tokens.map((token) => `"${token.replaceAll('"', '""')}"`).join(" ");
}

export function searchFiles(
  database: Database.Database,
  input: SearchInput
): { items: SearchResult[]; nextCursor: string | null } {
  const query = toFtsQuery(input.query);
  const cursor = decodeCursor(input.cursor);
  const pathPrefix = normalizePathPrefix(input.pathPrefix);
  const limit = Math.max(
    1,
    Math.min(MAX_RESULTS, Math.floor(input.limit ?? 25))
  );
  const params: unknown[] = [query];
  const filters = ["e.logical_path = f.logical_path"];
  if (pathPrefix) {
    filters.push("(e.logical_path = ? OR e.logical_path LIKE ? ESCAPE '\\')");
    params.push(
      pathPrefix,
      `${pathPrefix.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}/%`
    );
  }
  if (input.kind) {
    filters.push("e.kind = ?");
    params.push(input.kind);
  }
  if (cursor) {
    filters.push("e.logical_path > ?");
    params.push(cursor);
  }
  params.push(limit + 1);
  const rows = database
    .prepare(
      `SELECT e.logical_path, e.name, e.kind, e.size_bytes, e.modified_at, e.extension, e.mime_type
    FROM file_index_fts f JOIN file_index_entries e ON ${filters[0]}
    WHERE file_index_fts MATCH ? AND ${filters.slice(1).join(" AND ") || "1 = 1"}
    ORDER BY e.logical_path ASC LIMIT ?`
    )
    .all(...params) as Array<Record<string, unknown>>;
  const items = rows.slice(0, limit).map((row) => ({
    logicalPath: row.logical_path as string,
    name: row.name as string,
    kind: row.kind as SearchResult["kind"],
    sizeBytes: row.size_bytes as number,
    modifiedAt: row.modified_at as string,
    extension: row.extension as string,
    mimeType: row.mime_type as string,
  }));
  return {
    items,
    nextCursor:
      rows.length > limit && items.length
        ? encodeCursor(items.at(-1)!.logicalPath)
        : null,
  };
}
