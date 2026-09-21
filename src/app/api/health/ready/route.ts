import fs from "node:fs";
import { NextResponse } from "next/server";
import { checkReadiness } from "@/features/system/health";
import { loadConfig } from "@/lib/config/load-config";
import { getDatabase } from "@/lib/db/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Response {
  try {
    const config = loadConfig();
    const mode = fs.constants.R_OK | fs.constants.W_OK;
    const result = checkReadiness({
      database: () => Boolean(getDatabase().prepare("SELECT 1 value").get()),
      dataDirectory: () => { fs.accessSync(config.dataDirectory, mode); return true; },
      filesRoot: () => { fs.accessSync(config.filesRoot, mode); return true; },
    });
    if (!result.ok) {
      console.error("SPARK readiness failed", {
        checks: result.checks,
        dataDirectory: config.dataDirectory,
        filesRoot: config.filesRoot,
        databasePath: config.databasePath,
      });
    }
    return NextResponse.json(result, {
      status: result.ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("SPARK readiness configuration failed", error);
    return NextResponse.json(
      { ok: false, checks: { database: false, dataDirectory: false, filesRoot: false } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
