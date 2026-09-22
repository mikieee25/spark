import fs from "node:fs";
import path from "node:path";

export function loadLocalEnvironment(directory = process.cwd()): void {
  const environmentFile = path.join(directory, ".env.local");
  if (fs.existsSync(environmentFile)) process.loadEnvFile(environmentFile);
}
