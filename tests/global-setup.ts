import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { testDatabaseUrl } from "./test-database-url";

/**
 * Brings the test database's tables in line with the live schema before the
 * suite runs; every test then wipes the rows it needs (see resetDatabase).
 *
 * `prisma db push` is used rather than `migrate deploy` so the test database
 * always matches schema.prisma exactly. It never drops data on its own: if a
 * schema change would, it stops, and the fix is to recreate the test database.
 * The Prisma CLI is invoked through Node directly rather than through `npx`,
 * which cannot be spawned without a shell on Windows.
 */
export default function globalSetup() {
  const root = process.cwd();
  const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
  if (!existsSync(prismaCli)) {
    throw new Error(`Could not find the Prisma CLI at ${prismaCli}. Run "npm install" first.`);
  }

  execFileSync(process.execPath, [prismaCli, "db", "push", "--skip-generate"], {
    cwd: root,
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
  });
}
