import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "./load-config";

const validEnvironment = (
  overrides: Partial<NodeJS.ProcessEnv> = {}
): NodeJS.ProcessEnv => ({
  NODE_ENV: "test",
  SPARK_ORIGIN: "http://localhost:3000",
  SPARK_DATA_DIR: path.resolve("spark-data"),
  SPARK_FILES_ROOT: path.resolve("spark-files"),
  SPARK_SESSION_SECRET: "0123456789abcdef0123456789abcdef",
  SPARK_TRUST_PROXY: "false",
  ...overrides,
});

describe("loadConfig", () => {
  it("derives the database path", () => {
    expect(loadConfig(validEnvironment()).databasePath).toBe(
      path.join(path.resolve("spark-data"), "spark.db")
    );
  });

  it("keeps the administrator terminal disabled by default", () => {
    expect(loadConfig(validEnvironment()).terminalEnabled).toBe(false);
    expect(
      loadConfig(validEnvironment({ SPARK_TERMINAL_ENABLED: "true" }))
        .terminalEnabled
    ).toBe(true);
  });

  it("keeps document conversion disabled unless configured", () => {
    expect(loadConfig(validEnvironment()).previewConverterUrl).toBeNull();
    expect(
      loadConfig(
        validEnvironment({
          SPARK_PREVIEW_CONVERTER_URL:
            "http://converter:3000/forms/libreoffice/convert",
        })
      ).previewConverterUrl?.href
    ).toBe("http://converter:3000/forms/libreoffice/convert");
  });

  it("rejects relative roots", () => {
    expect(() =>
      loadConfig(validEnvironment({ SPARK_FILES_ROOT: ".\\files" }))
    ).toThrow("SPARK_FILES_ROOT");
  });

  it("keeps private data outside managed files", () => {
    expect(() =>
      loadConfig(
        validEnvironment({
          SPARK_DATA_DIR: path.join(path.resolve("spark-files"), "private"),
        })
      )
    ).toThrow("outside SPARK_FILES_ROOT");
  });

  it.each([
    "http://user:password@localhost:3000",
    "http://localhost:3000/path",
    "http://localhost:3000?query=yes",
    "http://localhost:3000#fragment",
  ])("rejects an unsafe origin: %s", (origin) => {
    expect(() =>
      loadConfig(validEnvironment({ SPARK_ORIGIN: origin }))
    ).toThrow("SPARK_ORIGIN");
  });
});
