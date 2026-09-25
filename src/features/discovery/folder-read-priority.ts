let activeFolderReads = 0;

export function beginFolderRead(): () => void {
  activeFolderReads += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeFolderReads = Math.max(0, activeFolderReads - 1);
  };
}

export function hasActiveFolderReads(): boolean {
  return activeFolderReads > 0;
}

export async function waitForFolderReadsToFinish(): Promise<void> {
  while (hasActiveFolderReads())
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
}

export async function waitForFolderReadQuietPeriod(
  quietMs: number
): Promise<void> {
  do {
    await waitForFolderReadsToFinish();
    await new Promise<void>((resolve) => setTimeout(resolve, quietMs));
  } while (hasActiveFolderReads());
}
