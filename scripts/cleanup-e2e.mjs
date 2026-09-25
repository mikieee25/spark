import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const target = path.resolve(process.argv[2] || "");
const tempRoot = path.resolve(os.tmpdir()) + path.sep;
if (
  !target.startsWith(tempRoot) ||
  !path.basename(target).startsWith("spark-e2e-")
) {
  process.exit(2);
}

for (let attempt = 0; attempt < 40; attempt += 1) {
  try {
    fs.rmSync(target, { recursive: true, force: true });
    process.exit(0);
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
process.exit(1);
