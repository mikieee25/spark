import fs from "node:fs";
import process from "node:process";
import { performance } from "node:perf_hooks";

function readCookie() {
  const cookieFile = process.env.SPARK_PERF_COOKIE_FILE;
  if (!cookieFile)
    throw new Error(
      "Set SPARK_PERF_COOKIE_FILE to an ignored local cookie file."
    );
  const cookie = fs.readFileSync(cookieFile, "utf8").trim();
  if (!cookie) throw new Error("SPARK_PERF_COOKIE_FILE is empty.");
  return cookie;
}

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

function parseServerTiming(value) {
  return Object.fromEntries(
    [...value.matchAll(/([a-z]+);dur=([0-9.]+)/g)].map((match) => [
      match[1],
      Number(match[2]),
    ])
  );
}

async function browse(baseUrl, cookie, path) {
  const started = performance.now();
  const response = await fetch(
    `${baseUrl.replace(/\/$/, "")}/api/files?path=${encodeURIComponent(path)}`,
    {
      headers: { cookie },
      cache: "no-store",
    }
  );
  const elapsedMs = performance.now() - started;
  await response.arrayBuffer();
  return {
    path,
    status: response.status,
    elapsedMs,
    serverTiming: parseServerTiming(
      response.headers.get("server-timing") ?? ""
    ),
  };
}

function summarize(results) {
  const durations = results
    .map((result) => result.elapsedMs)
    .sort((left, right) => left - right);
  const at = (fraction) =>
    durations[
      Math.min(durations.length - 1, Math.ceil(durations.length * fraction) - 1)
    ] ?? null;
  const serverTotals = results
    .map((result) => result.serverTiming.total)
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  const serverAt = (fraction) =>
    serverTotals[
      Math.min(
        serverTotals.length - 1,
        Math.ceil(serverTotals.length * fraction) - 1
      )
    ] ?? null;
  return {
    requests: results.length,
    failures: results.filter(
      (result) => result.status < 200 || result.status >= 300
    ).length,
    p50Ms: at(0.5),
    p95Ms: at(0.95),
    maxMs: durations.at(-1) ?? null,
    serverTotalP50Ms: serverAt(0.5),
    serverTotalP95Ms: serverAt(0.95),
  };
}

async function readHealth(baseUrl, cookie) {
  const response = await fetch(
    `${baseUrl.replace(/\/$/, "")}/api/admin/health`,
    { headers: { cookie }, cache: "no-store" }
  );
  if (!response.ok) return { status: response.status };
  const body = await response.json();
  return {
    status: response.status,
    index: body.checks?.index ?? null,
    runtimePerformance: body.runtimePerformance ?? null,
  };
}

const baseUrl = option("--base-url");
const paths = option("--paths", "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
if (!baseUrl || !paths.length)
  throw new Error(
    "Usage: node scripts/benchmark-navigation.mjs --base-url <url> --paths <path,path>"
  );
const cookie = readCookie();
const warmup = await browse(baseUrl, cookie, paths[0]);
const sequential = [];
for (let index = 0; index < 20; index += 1)
  sequential.push(await browse(baseUrl, cookie, paths[index % paths.length]));
const concurrent = await Promise.all(
  Array.from({ length: 15 }, (_, index) =>
    browse(baseUrl, cookie, paths[index % paths.length])
  )
);
console.log(
  JSON.stringify(
    {
      health: await readHealth(baseUrl, cookie),
      warmup: {
        status: warmup.status,
        elapsedMs: warmup.elapsedMs,
        serverTiming: warmup.serverTiming,
      },
      sequential: summarize(sequential),
      concurrent: summarize(concurrent),
    },
    null,
    2
  )
);
