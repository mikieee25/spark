import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadLocalEnvironment } from "./load-local-env";

const key = "SPARK_TEST_LOCAL_ENV";
const originalValue = process.env[key];

afterEach(() => {
  if (originalValue === undefined) delete process.env[key];
  else process.env[key] = originalValue;
});

describe("loadLocalEnvironment", () => {
  it("loads .env.local when present without overwriting shell variables", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "spark-env-"));
    try {
      fs.writeFileSync(path.join(directory, ".env.local"), `${key}=from-file\n`);
      process.env[key] = "from-shell";

      loadLocalEnvironment(directory);

      expect(process.env[key]).toBe("from-shell");
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
