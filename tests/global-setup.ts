import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

/**
 * Builds a fresh test database from the live schema before the suite runs.
 *
 * `prisma db push` is used rather than `migrate deploy` so the test database
 * always matches schema.prisma exactly. The Prisma CLI is invoked through Node
 * directly rather than through `npx`, which cannot be spawned without a shell
 * on Windows.
 */
export default function globalSetup() {
  const root = process.cwd();
  const dbPath = path.join(root, "prisma", "test.db");

  for (const file of [dbPath, `${dbPath}-journal`]) {
    if (existsSync(file)) rmSync(file, { force: true });
  }

  const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
  if (!existsSync(prismaCli)) {
    throw new Error(`Could not find the Prisma CLI at ${prismaCli}. Run "npm install" first.`);
  }

  execFileSync(process.execPath, [prismaCli, "db", "push", "--skip-generate", "--accept-data-loss"], {
    cwd: root,
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
  });
}
