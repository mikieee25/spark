import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createAdministrator } from "../src/features/auth/admin-service";
import { authenticate } from "../src/features/auth/auth-service";
import { resolveSession } from "../src/features/auth/session-repository";
import { checkReadiness } from "../src/features/system/health";
import { loadConfig } from "../src/lib/config/load-config";
import { openDatabase } from "../src/lib/db/database";
import { migrate } from "../src/lib/db/migrations";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "spark-verify-"));
const dataDirectory = path.join(root, "data");
const filesRoot = path.join(root, "files");
fs.mkdirSync(dataDirectory);
fs.mkdirSync(filesRoot);

function gate(name: string, condition: unknown): void {
  if (!condition) throw new Error(`Foundation gate failed: ${name}`);
  process.stdout.write(`PASS ${name}\n`);
}

try {
  const config = loadConfig({
    NODE_ENV: "test",
    SPARK_ORIGIN: "http://localhost:3000",
    SPARK_DATA_DIR: dataDirectory,
    SPARK_FILES_ROOT: filesRoot,
    SPARK_SESSION_SECRET: "verification-session-secret-0123456789",
    SPARK_TRUST_PROXY: "false",
  });
  gate("environment validation", config.databasePath.endsWith("spark.db"));

  const database = openDatabase(config.databasePath);
  migrate(database);
  gate(
    "empty-database migration",
    (database.prepare("SELECT count(*) count FROM sqlite_master WHERE type = 'table' AND name = 'users'").get() as { count: number }).count === 1,
  );
  migrate(database);
  gate("idempotent migration", (database.prepare("SELECT count(*) count FROM schema_migrations").get() as { count: number }).count === 1);

  const administrator = await createAdministrator(database, {
    username: "verifier", displayName: "Foundation Verifier", password: "verification-password",
  });
  gate("administrator creation", administrator.role === "admin");
  const auth = await authenticate(database, "VERIFIER", "verification-password", new Date());
  gate("authentication", auth.ok);
  if (!auth.ok) throw new Error("Foundation gate failed: authentication");
  gate("session persistence", resolveSession(database, auth.token, new Date())?.id === administrator.id);
  const readiness = checkReadiness({
    database: () => Boolean(database.prepare("SELECT 1 value").get()),
    dataDirectory: () => fs.statSync(dataDirectory).isDirectory(),
    filesRoot: () => fs.statSync(filesRoot).isDirectory(),
  });
  gate("readiness", readiness.ok);
  gate("protected shell", fs.readFileSync(path.resolve("src/app/(app)/layout.tsx"), "utf8").includes("redirect(\"/login\")"));
  database.close();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
