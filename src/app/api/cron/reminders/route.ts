/**
 * Scheduled reminder endpoint.
 *
 * Point a scheduler at this route (Vercel Cron, GitHub Actions, systemd timer,
 * Windows Task Scheduler — anything that can make an HTTP request) and send
 * CRON_SECRET either as `Authorization: Bearer <secret>` or `x-cron-secret`.
 *
 * Hourly is a sensible cadence: the sweep is idempotent, so running it more
 * often costs nothing but a query, and running it less often only delays a
 * reminder. An owner may also trigger it by hand from Settings.
 */
import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/server/auth";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";
import { enforce } from "@/server/rate-limit";
import { jsonHandler } from "@/server/respond";
import { runReminderSweep } from "@/server/services/reminders";

async function authorise(request: NextRequest): Promise<void> {
  const secret = env.cronSecret;
  const header = request.headers.get("authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const provided = bearer ?? request.headers.get("x-cron-secret");

  if (secret && provided && provided === secret) return;

  // An authenticated owner may also run the sweep manually.
  const user = await getCurrentUser();
  if (user?.role === "OWNER") return;

  if (!secret) {
    throw new AppError(
      "FORBIDDEN",
      "CRON_SECRET is not configured, so this endpoint only accepts a signed-in owner.",
    );
  }
  throw new AppError("UNAUTHENTICATED", "A valid cron secret is required.");
}

export async function POST(request: NextRequest) {
  return jsonHandler(async () => {
    await authorise(request);
    enforce("cron:reminders", 12, 60 * 1000);
    return runReminderSweep();
  });
}

/** GET is accepted too, because some schedulers can only issue GET requests. */
export async function GET(request: NextRequest) {
  return POST(request);
}
