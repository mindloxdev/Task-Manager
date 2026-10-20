import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

/**
 * The Postgres database the suite runs against: TEST_DATABASE_URL, from the
 * environment or from .env.test (deploy/setup-database.sh writes one).
 *
 * The suite wipes this database, so it refuses to run against the URL in
 * .env — the application's own data.
 */
export function testDatabaseUrl(): string {
  const root = process.cwd();
  const url = process.env.TEST_DATABASE_URL || readVar(path.join(root, ".env.test"), "TEST_DATABASE_URL");
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Put it in .env.test, e.g.\n" +
        "  TEST_DATABASE_URL=postgresql://user:password@127.0.0.1:5432/task_manager_test\n" +
        "It must be a throwaway database: the test suite deletes everything in it.",
    );
  }

  const appUrl = readVar(path.join(root, ".env"), "DATABASE_URL");
  if (appUrl && sameDatabase(appUrl, url)) {
    throw new Error("TEST_DATABASE_URL points at the application's database (DATABASE_URL in .env). Refusing to wipe it.");
  }
  return url;
}

function readVar(file: string, name: string): string | undefined {
  if (!existsSync(file)) return undefined;
  return parseEnv(readFileSync(file, "utf8"))[name] || undefined;
}

function sameDatabase(a: string, b: string): boolean {
  try {
    const x = new URL(a);
    const y = new URL(b);
    return x.hostname === y.hostname && (x.port || "5432") === (y.port || "5432") && x.pathname === y.pathname;
  } catch {
    return a === b;
  }
}
