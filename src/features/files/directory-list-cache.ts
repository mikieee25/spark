type CacheEntry<T> = Readonly<{ fingerprint: string; value: T; expiresAt: number }>;

export function createDirectoryListCache<T>(options: Readonly<{ ttlMs: number; maxEntries: number }>) {
  const entries = new Map<string, CacheEntry<T>>();
  const ttlMs = Math.max(1, options.ttlMs);
  const maxEntries = Math.max(1, options.maxEntries);
  function get(path: string, fingerprint: string): T | undefined {
    const entry = entries.get(path);
    if (!entry || entry.expiresAt <= Date.now() || entry.fingerprint !== fingerprint) {
      entries.delete(path);
      return undefined;
    }
    entries.delete(path);
    entries.set(path, entry);
    return entry.value;
  }
  function set(path: string, fingerprint: string, value: T): void {
    entries.delete(path);
    entries.set(path, { fingerprint, value, expiresAt: Date.now() + ttlMs });
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value as string);
  }
  function invalidate(path?: string): void {
    if (path === undefined) entries.clear();
    else entries.delete(path);
  }
  return { get, set, invalidate };
}
