import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

function cacheKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function createArtifactCache(dataDirectory: string, namespace: string) {
  const directory = path.resolve(dataDirectory, namespace);
  return {
    async get(key: string, generate: () => Promise<Buffer>): Promise<Buffer> {
      const target = path.join(directory, `${cacheKey(key)}.bin`);
      try {
        return await readFile(target);
      } catch (error) {
        if (!(
          error instanceof Error &&
          "code" in error &&
          (error as NodeJS.ErrnoException).code === "ENOENT"
        ))
          throw error;
      }
      const buffer = await generate();
      await mkdir(directory, { recursive: true });
      const temporary = `${target}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, buffer, { flag: "wx" });
        await rename(temporary, target).catch((error: unknown) => {
          if (!(
            error instanceof Error &&
            "code" in error &&
            (error as NodeJS.ErrnoException).code === "EEXIST"
          ))
            throw error;
        });
      } finally {
        await rm(temporary, { force: true });
      }
      return buffer;
    },
  };
}
