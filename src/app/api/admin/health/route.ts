import fs from "node:fs";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/features/auth/request-auth";
import { getDatabase } from "@/lib/db/runtime";
import { loadConfig } from "@/lib/config/load-config";
import { getIndexState } from "@/features/discovery/discovery-repository";
import { getRetentionDays } from "@/features/admin/settings-repository";
import { checkAdminHealth } from "@/features/system/health";
import { getRuntimePerformanceSnapshot } from "@/features/system/runtime-performance";
export const runtime = "nodejs";
export async function GET(): Promise<Response> { const headers = { "Cache-Control": "private, no-store" }; const user = await getCurrentUser(); if (!user || user.role !== "admin") return NextResponse.json({ error: "ADMIN_REQUIRED" }, { status: 403, headers }); const config = loadConfig(); const mode = fs.constants.R_OK | fs.constants.W_OK; const report = checkAdminHealth({ database: () => Boolean(getDatabase().prepare("SELECT 1").get()), filesRoot: () => { fs.accessSync(config.filesRoot, mode); return true; }, dataDirectory: () => { fs.accessSync(config.dataDirectory, mode); return true; }, settings: () => { getRetentionDays(getDatabase()); return true; }, indexState: getIndexState(getDatabase()) }); return NextResponse.json({ ...report, runtimePerformance: getRuntimePerformanceSnapshot() }, { headers }); }
