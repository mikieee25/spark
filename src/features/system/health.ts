export type ReadinessChecks = Readonly<{
  database: () => boolean;
  dataDirectory: () => boolean;
  filesRoot: () => boolean;
}>;

export type Readiness = Readonly<{
  ok: boolean;
  checks: Readonly<{
    database: boolean;
    dataDirectory: boolean;
    filesRoot: boolean;
  }>;
}>;

function safely(check: () => boolean): boolean {
  try {
    return check();
  } catch {
    return false;
  }
}

export function checkLiveness(): { ok: true } {
  return { ok: true };
}

export function checkReadiness(probes: ReadinessChecks): Readiness {
  const checks = {
    database: safely(probes.database),
    dataDirectory: safely(probes.dataDirectory),
    filesRoot: safely(probes.filesRoot),
  };
  return { ok: Object.values(checks).every(Boolean), checks };
}

export type AdminHealthReport = {
  ok: boolean;
  checks: {
    database: boolean;
    filesRoot: boolean;
    dataDirectory: boolean;
    settings: boolean;
    index: string;
  };
  freeSpaceBytes: number | null;
  failures: string[];
};
export function checkAdminHealth(input: {
  database: () => boolean;
  filesRoot: () => boolean;
  dataDirectory: () => boolean;
  settings: () => boolean;
  indexState: { status: string };
  freeSpaceBytes?: () => number;
}): AdminHealthReport {
  const checks = {
    database: safely(input.database),
    filesRoot: safely(input.filesRoot),
    dataDirectory: safely(input.dataDirectory),
    settings: safely(input.settings),
    index: ["idle", "running", "error"].includes(input.indexState.status)
      ? input.indexState.status
      : "error",
  };
  const failures = Object.entries(checks)
    .filter(([, value]) => value === false || value === "error")
    .map(([key]) => key.toUpperCase());
  return {
    ok: failures.length === 0,
    checks,
    freeSpaceBytes: input.freeSpaceBytes
      ? (() => {
          try {
            return input.freeSpaceBytes!();
          } catch {
            return null;
          }
        })()
      : null,
    failures,
  };
}
