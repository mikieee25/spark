import path from "node:path";
import { environmentSchema, type AppConfig } from "./schema";

function requireAbsolute(name: string, value: string): string {
  if (!path.isAbsolute(value)) {
    throw new Error(`${name} must be an absolute path`);
  }
  return path.resolve(value);
}

function isInsideOrSame(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function parseOrigin(value: string): URL {
  let origin: URL;
  try {
    origin = new URL(value);
  } catch {
    throw new Error("SPARK_ORIGIN must be a valid absolute URL");
  }

  if (
    !["http:", "https:"].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  ) {
    throw new Error("SPARK_ORIGIN must contain only an HTTP(S) origin");
  }

  return origin;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) {
    throw new Error(`Invalid SPARK configuration: ${parsed.error.message}`);
  }

  const dataDirectory = requireAbsolute("SPARK_DATA_DIR", parsed.data.SPARK_DATA_DIR);
  const filesRoot = requireAbsolute("SPARK_FILES_ROOT", parsed.data.SPARK_FILES_ROOT);

  if (isInsideOrSame(filesRoot, dataDirectory) || isInsideOrSame(dataDirectory, filesRoot)) {
    throw new Error("SPARK_DATA_DIR must remain outside SPARK_FILES_ROOT");
  }

  return Object.freeze({
    origin: parseOrigin(parsed.data.SPARK_ORIGIN),
    dataDirectory,
    filesRoot,
    databasePath: path.join(dataDirectory, "spark.db"),
    sessionSecret: parsed.data.SPARK_SESSION_SECRET,
    trustProxy: parsed.data.SPARK_TRUST_PROXY === "true",
    terminalEnabled: parsed.data.SPARK_TERMINAL_ENABLED === "true",
  });
}
