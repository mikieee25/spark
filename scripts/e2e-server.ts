import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createAdministrator } from "../src/features/auth/admin-service";
import { openDatabase } from "../src/lib/db/database";
import { migrate } from "../src/lib/db/migrations";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "spark-e2e-"));
fs.writeFileSync(path.resolve(".spark-e2e-state"), root, "utf8");
const dataDirectory = path.join(root, "data");
const filesRoot = path.join(root, "files");
fs.mkdirSync(dataDirectory);
fs.mkdirSync(filesRoot);

const database = openDatabase(path.join(dataDirectory, "spark.db"));
migrate(database);
await createAdministrator(database, {
  username: "e2e-admin",
  displayName: "E2E Administrator",
  password: "e2e-correct-password",
});
database.close();

const port = process.env.PORT || "3199";
const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "-H", "127.0.0.1", "-p", port],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      SPARK_ORIGIN: `http://127.0.0.1:${port}`,
      SPARK_DATA_DIR: dataDirectory,
      SPARK_FILES_ROOT: filesRoot,
      SPARK_SESSION_SECRET: "e2e-only-session-secret-0123456789",
      SPARK_TRUST_PROXY: "false",
    },
  },
);

function stop(): void {
  if (!child.killed) child.kill("SIGTERM");
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => {
  fs.rmSync(root, { recursive: true, force: true });
  process.exit(code ?? 0);
});
