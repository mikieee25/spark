import fs from "node:fs";
import process from "node:process";

function numberOrNull(value) {
  return Number.isFinite(value) ? Number(value.toFixed(1)) : null;
}

function headerValue(headers, name) {
  return (
    headers.find((header) => header.name.toLowerCase() === name.toLowerCase())
      ?.value ?? ""
  );
}

function serverTimingValue(header, metric) {
  const match = header.match(new RegExp(`${metric};dur=([0-9.]+)`));
  return match ? Number(match[1]) : null;
}

function percentile(values, percentileValue) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return numberOrNull(
    sorted[
      Math.min(
        sorted.length - 1,
        Math.ceil(sorted.length * percentileValue) - 1
      )
    ]
  );
}

export function analyzeHarDocument(document) {
  const entries = Array.isArray(document?.log?.entries)
    ? document.log.entries
    : [];
  const listings = entries.flatMap((entry) => {
    const url = new URL(entry.request.url);
    if (url.pathname !== "/api/files" || entry.request.method !== "GET")
      return [];
    const header = headerValue(entry.response.headers ?? [], "server-timing");
    const contentText = entry.response.content?.text;
    let itemCount = null;
    if (contentText) {
      try {
        const body = JSON.parse(contentText);
        itemCount = Array.isArray(body.entries) ? body.entries.length : null;
      } catch {
        // A HAR may contain compressed or truncated response text.
      }
    }
    return [
      {
        path: url.searchParams.get("path") ?? "",
        entries: itemCount,
        browserMs: numberOrNull(entry.time ?? 0),
        waitMs: numberOrNull(entry.timings?.wait ?? 0),
        receiveMs: numberOrNull(entry.timings?.receive ?? 0),
        serverPathMs: serverTimingValue(header, "path"),
        serverDirectoryMs: serverTimingValue(header, "directory"),
        serverReaddirMs: serverTimingValue(header, "readdir"),
        serverMetadataMs: serverTimingValue(header, "metadata"),
        serverSortMs: serverTimingValue(header, "sort"),
        serverTotalMs: serverTimingValue(header, "total"),
        serverListMs: serverTimingValue(header, "list"),
      },
    ];
  });
  const rscCount = entries.filter((entry) =>
    new URL(entry.request.url).searchParams.has("_rsc")
  ).length;
  const documents = entries.filter((entry) => {
    const url = new URL(entry.request.url);
    return (
      entry.request.method === "GET" &&
      url.pathname === "/files" &&
      !url.searchParams.has("_rsc")
    );
  });
  const browserDurations = entries
    .filter((entry) => entry.response.status > 0)
    .map((entry) => Number(entry.time))
    .filter((duration) => Number.isFinite(duration) && duration > 0);
  return {
    entryCount: entries.length,
    documentCount: documents.length,
    rscCount,
    listings,
    p50BrowserMs: percentile(browserDurations, 0.5),
    p95BrowserMs: percentile(browserDurations, 0.95),
  };
}

function main() {
  const paths = process.argv.slice(2);
  if (!paths.length) {
    console.error(
      "Usage: node scripts/analyze-navigation-har.mjs <file.har> [...]"
    );
    process.exitCode = 2;
    return;
  }
  for (const filePath of paths) {
    const report = analyzeHarDocument(
      JSON.parse(fs.readFileSync(filePath, "utf8"))
    );
    console.log(JSON.stringify({ file: filePath, ...report }, null, 2));
  }
}

if (process.argv[1]?.endsWith("analyze-navigation-har.mjs")) main();
