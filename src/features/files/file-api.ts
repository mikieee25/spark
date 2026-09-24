export type FileEntry = Readonly<{
  name: string;
  logicalPath: string;
  kind: "file" | "folder";
  sizeBytes: number;
  modifiedAt: string;
}>;

export type ConflictPolicy = "fail" | "replace" | "rename" | "skip";

export class FileApiError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code);
  }
}

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) throw new FileApiError(body.error ?? "FILESYSTEM_ERROR", response.status);
  return body;
}

export async function listFiles(path = "", signal?: AbortSignal): Promise<{ path: string; entries: FileEntry[] }> {
  return jsonRequest(`/api/files?path=${encodeURIComponent(path)}`, { signal });
}

export async function createFolder(path: string, signal?: AbortSignal): Promise<{ item: FileEntry }> {
  return jsonRequest("/api/files/folders", { method: "POST", body: JSON.stringify({ path }), signal });
}

export async function deleteFile(path: string): Promise<unknown> {
  return jsonRequest(`/api/files?path=${encodeURIComponent(path)}`, { method: "DELETE" });
}

export type BatchRecycleResult = Readonly<{
  succeeded: string[];
  failed: Array<{ path: string; error: string }>;
}>;

async function batchRequest(action: "download" | "recycle", paths: readonly string[]): Promise<Response> {
  const response = await fetch("/api/files/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, paths }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new FileApiError(body.error ?? "FILESYSTEM_ERROR", response.status);
  }
  return response;
}

export async function downloadSelection(paths: readonly string[]): Promise<Blob> {
  return (await batchRequest("download", paths)).blob();
}

export async function recycleSelection(paths: readonly string[]): Promise<BatchRecycleResult> {
  return await (await batchRequest("recycle", paths)).json() as BatchRecycleResult;
}

export async function moveFile(input: { source: string; destination: string; conflict?: ConflictPolicy }): Promise<unknown> {
  return jsonRequest("/api/files", { method: "PATCH", body: JSON.stringify(input) });
}

export async function uploadFile(input: { directory: string; file: File; conflict?: ConflictPolicy; signal?: AbortSignal }): Promise<unknown> {
  const form = new FormData();
  form.set("directory", input.directory);
  if (input.conflict) form.set("conflict", input.conflict);
  form.set("file", input.file);
  const response = await fetch("/api/files/uploads", { method: "POST", body: form, signal: input.signal });
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new FileApiError(body.error ?? "FILESYSTEM_ERROR", response.status);
  return body;
}

type FolderUploadConflict = Readonly<{ file: File; logicalPath: string }>;
type FolderUploadProgress = Readonly<{ completed: number; total: number; logicalPath: string }>;

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new FileApiError("UPLOAD_CANCELLED", 409);
}

function joinPath(...parts: string[]): string {
  return parts.filter(Boolean).join("/");
}

export async function uploadFolder(input: {
  directory: string;
  files: readonly File[];
  onProgress?: (progress: FolderUploadProgress) => void;
  onConflict?: (conflict: FolderUploadConflict) => Promise<ConflictPolicy | "cancel">;
  signal?: AbortSignal;
}): Promise<{ uploaded: number; skipped: number }> {
  const files = input.files.filter((file) => file.size >= 0);
  const directories = new Set<string>();
  const items = files.map((file) => {
    const relative = (file.webkitRelativePath || file.name).replaceAll("\\", "/");
    const segments = relative.split("/").filter(Boolean);
    const name = segments.pop();
    if (!name) throw new FileApiError("INVALID_UPLOAD", 400);
    for (let index = 1; index <= segments.length; index += 1) directories.add(joinPath(input.directory, ...segments.slice(0, index)));
    return { file, logicalPath: joinPath(input.directory, ...segments, name), directory: joinPath(input.directory, ...segments) };
  });
  for (const directory of [...directories].sort((left, right) => left.split("/").length - right.split("/").length)) {
    throwIfAborted(input.signal);
    try { await createFolder(directory, input.signal); }
    catch (error) {
      if (error instanceof FileApiError && error.code === "UPLOAD_CANCELLED") throw error;
      if (!(error instanceof FileApiError) || error.status !== 409) throw error;
    }
  }
  let uploaded = 0;
  let skipped = 0;
  for (const item of items) {
    throwIfAborted(input.signal);
    let conflict: ConflictPolicy | undefined;
    while (true) {
      try {
        const result = await uploadFile({ directory: item.directory, file: item.file, conflict, signal: input.signal });
        if ((result as { skipped?: boolean }).skipped) skipped += 1;
        else uploaded += 1;
        input.onProgress?.({ completed: uploaded + skipped, total: items.length, logicalPath: item.logicalPath });
        break;
      } catch (error) {
        if (input.signal?.aborted) throw new FileApiError("UPLOAD_CANCELLED", 409);
        if (!(error instanceof FileApiError) || error.status !== 409 || !input.onConflict) throw error;
        const choice = await input.onConflict({ file: item.file, logicalPath: item.logicalPath });
        if (choice === "cancel") throw new FileApiError("UPLOAD_CANCELLED", 409);
        conflict = choice;
      }
    }
  }
  return { uploaded, skipped };
}

export function downloadUrl(path: string): string {
  return `/api/files/download?path=${encodeURIComponent(path)}`;
}
