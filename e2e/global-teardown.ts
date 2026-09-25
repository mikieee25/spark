import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

export default function globalTeardown(): void {
  const stateFile = path.resolve(".spark-e2e-state");
  if (!fs.existsSync(stateFile)) return;
  const target = path.resolve(fs.readFileSync(stateFile, "utf8").trim());
  const tempRoot = path.resolve(os.tmpdir()) + path.sep;
  if (
    !target.startsWith(tempRoot) ||
    !path.basename(target).startsWith("spark-e2e-")
  ) {
    throw new Error(`Refusing unsafe E2E cleanup target: ${target}`);
  }
  fs.rmSync(stateFile, { force: true });
  const cleanup = spawn(
    process.execPath,
    [path.resolve("scripts/cleanup-e2e.mjs"), target],
    {
      detached: true,
      stdio: "ignore",
    }
  );
  cleanup.unref();
}
