import readline from "node:readline/promises";
import { Writable } from "node:stream";
import { resetUserPassword } from "../src/features/admin/admin-user-service";
import { loadLocalEnvironment } from "../src/lib/config/load-local-env";
import { getDatabase } from "../src/lib/db/runtime";

loadLocalEnvironment();

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function secretPrompt(label: string): Promise<string> {
  process.stdout.write(label);
  let muted = true;
  const output = new Writable({
    write(_chunk, _encoding, callback) {
      if (!muted) process.stdout.write(_chunk);
      callback();
    },
  });
  const prompt = readline.createInterface({ input: process.stdin, output, terminal: true });
  const value = await prompt.question("");
  muted = false;
  prompt.close();
  process.stdout.write("\n");
  return value;
}

async function main(): Promise<void> {
  const username = option("--username")?.trim();
  if (!username) throw new Error("Usage: npm run admin:reset-password -- --username <name>");

  const database = getDatabase();
  const user = database.prepare(
    "SELECT id, username, role, disabled_at FROM users WHERE username = ? COLLATE NOCASE",
  ).get(username) as { id: string; username: string; role: "admin" | "user"; disabled_at: string | null } | undefined;
  if (!user) throw new Error(`Administrator not found: ${username}`);
  if (user.role !== "admin") throw new Error(`Account is not an administrator: ${user.username}`);
  if (user.disabled_at) throw new Error(`Administrator account is disabled: ${user.username}`);

  const temporaryPassword = await secretPrompt("Temporary password: ");
  const confirmation = await secretPrompt("Confirm temporary password: ");
  if (temporaryPassword !== confirmation) throw new Error("Passwords do not match");

  await resetUserPassword(database, { id: user.id, role: "admin" }, user.id, temporaryPassword);
  process.stdout.write(`Temporary password set for ${user.username}. Sign in with it once, then choose a new password.\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Administrator password reset failed"}\n`);
  process.exitCode = 1;
});
