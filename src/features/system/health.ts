export type ReadinessChecks = Readonly<{
  database: () => boolean;
  dataDirectory: () => boolean;
  filesRoot: () => boolean;
}>;

export type Readiness = Readonly<{
  ok: boolean;
  checks: Readonly<{ database: boolean; dataDirectory: boolean; filesRoot: boolean }>;
}>;

function safely(check: () => boolean): boolean {
  try { return check(); } catch { return false; }
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
