/**
 * Password hashing.
 *
 * Kept separate from `auth.ts` so that code which only needs to hash or verify
 * a password (and the tests that exercise it) does not pull in the Next.js
 * request-scoped cookie APIs.
 */
import bcrypt from "bcryptjs";

export const BCRYPT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string | null): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

/**
 * A real hash of a value nobody can log in with. Comparing against it when an
 * account does not exist makes a failed login cost the same either way, so the
 * endpoint cannot be used to probe which email addresses are registered.
 */
let decoyHash: Promise<string> | null = null;

export function getDecoyHash(): Promise<string> {
  decoyHash ??= hashPassword(`decoy:${Math.random()}`);
  return decoyHash;
}

export async function compareAgainstDecoy(plain: string): Promise<void> {
  await bcrypt.compare(plain, await getDecoyHash());
}
