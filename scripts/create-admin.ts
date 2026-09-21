import readline from "node:readline/promises";
import { Writable } from "node:stream";
import { createAdministrator } from "../src/features/auth/admin-service";
import { getDatabase } from "../src/lib/db/runtime";

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
  const username = option("--username");
  const displayName = option("--display-name");
  if (!username || !displayName) {
    throw new Error("Usage: npm run admin:create -- --username <name> --display-name <name>");
  }
  const password = await secretPrompt("Password: ");
  const confirmation = await secretPrompt("Confirm password: ");
  if (password !== confirmation) throw new Error("Passwords do not match");

  const user = await createAdministrator(getDatabase(), { username, displayName, password });
  process.stdout.write(`Created administrator ${user.username}.\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Administrator creation failed"}\n`);
  process.exitCode = 1;
});
