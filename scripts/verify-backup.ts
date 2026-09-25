import { verifyBackup } from "../src/features/system/backup";

const backupPath = process.argv[2];
if (!backupPath)
  throw new Error("Usage: npm run backup:verify -- <backup-directory>");
const result = await verifyBackup(backupPath);
console.log(JSON.stringify(result));
if (!result.valid) process.exitCode = 1;
