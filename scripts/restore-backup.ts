import { restoreBackup } from "../src/features/system/backup";

const [backupPath, targetDataDirectory, confirmation] = process.argv.slice(2);
if (!backupPath || !targetDataDirectory || confirmation !== "--confirm") {
  throw new Error("Usage: npm run backup:restore -- <backup-directory> <target-data-directory> --confirm");
}
await restoreBackup(backupPath, targetDataDirectory, true);
console.log(`Restored SPARK private data to ${targetDataDirectory}`);
