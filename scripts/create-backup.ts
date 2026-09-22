import { loadConfig } from "../src/lib/config/load-config";
import { createBackup } from "../src/features/system/backup";
import { loadLocalEnvironment } from "../src/lib/config/load-local-env";

loadLocalEnvironment();
const config = loadConfig();
const destinationRoot = process.argv[2] ?? "spark-backups";
console.log(await createBackup(config, destinationRoot));
