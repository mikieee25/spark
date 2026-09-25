import { z } from "zod";

export const environmentSchema = z.object({
  SPARK_ORIGIN: z.string().trim().min(1),
  SPARK_DATA_DIR: z.string().trim().min(1),
  SPARK_FILES_ROOT: z.string().trim().min(1),
  SPARK_SESSION_SECRET: z.string().min(32),
  SPARK_TRUST_PROXY: z.enum(["true", "false"]).default("false"),
  SPARK_TERMINAL_ENABLED: z.enum(["true", "false"]).default("false"),
  SPARK_PREVIEW_CONVERTER_URL: z.preprocess(
    (value) => (typeof value === "string" && !value.trim() ? undefined : value),
    z.string().trim().url().optional()
  ),
});

export type AppConfig = Readonly<{
  origin: URL;
  dataDirectory: string;
  filesRoot: string;
  databasePath: string;
  sessionSecret: string;
  trustProxy: boolean;
  terminalEnabled: boolean;
  previewConverterUrl: URL | null;
}>;
