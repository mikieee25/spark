import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../src/lib/config/load-config";
import { openDatabase } from "../src/lib/db/database";
import { migrate } from "../src/lib/db/migrations";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "spark-release-"));
let database: ReturnType<typeof openDatabase> | undefined;
try {
  const dataDirectory = path.join(root, "data");
  const filesRoot = path.join(root, "files");
  fs.mkdirSync(dataDirectory);
  fs.mkdirSync(filesRoot);
  const config = loadConfig({
    NODE_ENV: "test",
    SPARK_ORIGIN: "http://localhost:38173",
    SPARK_DATA_DIR: dataDirectory,
    SPARK_FILES_ROOT: filesRoot,
    SPARK_SESSION_SECRET: "release-verification-secret-0123456789",
    SPARK_TRUST_PROXY: "false",
  });
  assert.equal(config.terminalEnabled, false);
  console.log("PASS terminal disabled by default");
  database = openDatabase(config.databasePath);
  migrate(database);
  migrate(database);
  assert.equal(
    (
      database
        .prepare("SELECT max(version) version FROM schema_migrations")
        .get() as { version: number }
    ).version,
    7
  );
  console.log("PASS migration 7 idempotence");
  const compose = fs.readFileSync(path.resolve("compose.yaml"), "utf8");
  assert.match(compose, /38173/);
  assert.match(compose, /EPRED OneDrive Access/);
  console.log("PASS EPRED deployment defaults");
  const nextConfig = fs.readFileSync(path.resolve("next.config.mjs"), "utf8");
  assert.match(nextConfig, /X-Content-Type-Options/);
  console.log("PASS browser security headers");
} finally {
  database?.close();
  fs.rmSync(root, { recursive: true, force: true });
}
