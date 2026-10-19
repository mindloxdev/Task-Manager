/**
 * Fixed-window rate limiter.
 *
 * In-memory and therefore per-process: it protects a single instance against
 * brute force and accidental hammering. Behind several instances, point
 * `consume` at a shared store (Redis) instead — the call signature is designed
 * so only this file changes.
 */
import { AppError } from "@/server/errors";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

function sweep(now: number): void {
  // Drop expired buckets occasionally so the map cannot grow without bound.
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSeconds: number };

export function consume(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: Math.ceil(windowMs / 1000) };
  }

  existing.count += 1;
  const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
  if (existing.count > limit) return { allowed: false, remaining: 0, retryAfterSeconds };
  return { allowed: true, remaining: limit - existing.count, retryAfterSeconds };
}

/** Throws a 429 when the caller has run out of allowance. */
export function enforce(key: string, limit: number, windowMs: number): void {
  const result = consume(key, limit, windowMs);
  if (!result.allowed) {
    throw new AppError(
      "RATE_LIMITED",
      `Too many attempts. Try again in ${result.retryAfterSeconds} seconds.`,
      { retryAfterSeconds: result.retryAfterSeconds },
    );
  }
}

/** Test helper: forget every bucket. */
export function resetRateLimits(): void {
  buckets.clear();
}
