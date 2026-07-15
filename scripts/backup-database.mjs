import "dotenv/config";
import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const backupDirectory = resolve(process.cwd(), "backups");
await mkdir(backupDirectory, { recursive: true });
const timestamp = new Date()
  .toISOString()
  .replaceAll(":", "-")
  .replaceAll(".", "-");
const output = resolve(backupDirectory, `pace-lingo-${timestamp}.dump`);

const child = spawn(
  "pg_dump",
  [
    "--format=custom",
    "--no-owner",
    "--no-privileges",
    "--file",
    output,
    databaseUrl,
  ],
  { stdio: "inherit", shell: process.platform === "win32" },
);

const exitCode = await new Promise((resolveExit, reject) => {
  child.once("error", reject);
  child.once("exit", resolveExit);
});
if (exitCode !== 0) throw new Error(`pg_dump exited with code ${exitCode}`);
console.log(`Backup created: ${output}`);
