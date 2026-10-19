"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import {
  authenticate,
  clearSessionCookie,
  createSessionToken,
  requireUser,
  setSessionCookie,
} from "@/server/auth";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { enforce } from "@/server/rate-limit";
import { fail, ok, type ActionResult } from "@/server/respond";
import { acceptInviteSchema, changePasswordSchema, loginSchema } from "@/lib/validation";
import { acceptInvite as acceptInviteService, changePassword as changePasswordService } from "@/server/services/users";
import { recordAudit } from "@/server/services/activity";

async function clientKey(suffix: string): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : headerList.get("x-real-ip") || "local";
  return `${suffix}:${ip}`;
}

export async function loginAction(input: { email: string; password: string }): Promise<ActionResult<{ role: string }>> {
  try {
    const parsed = loginSchema.parse(input);
    // Two limits: one per address so a single account cannot be hammered, and
    // one per credential pair so a shared NAT does not lock everyone out.
    enforce(await clientKey("login-ip"), 20, 5 * 60 * 1000);
    enforce(`login-email:${parsed.email}`, 8, 5 * 60 * 1000);

    const user = await authenticate(parsed.email, parsed.password);
    if (!user) {
      throw new AppError("UNAUTHENTICATED", "That email and password do not match an active account.");
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await setSessionCookie(await createSessionToken(user));
    await recordAudit({ actorId: user.id, action: "LOGIN", entityType: "User", entityId: user.id });

    revalidatePath("/", "layout");
    return ok({ role: user.role });
  } catch (error) {
    return fail(error);
  }
}

export async function logoutAction(): Promise<ActionResult<null>> {
  try {
    await clearSessionCookie();
    revalidatePath("/", "layout");
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function acceptInviteAction(input: {
  token: string;
  name: string;
  password: string;
}): Promise<ActionResult<{ email: string }>> {
  try {
    const parsed = acceptInviteSchema.parse(input);
    enforce(await clientKey("invite"), 10, 10 * 60 * 1000);

    const user = await acceptInviteService(parsed);
    await setSessionCookie(await createSessionToken(user));
    revalidatePath("/", "layout");
    return ok({ email: user.email });
  } catch (error) {
    return fail(error);
  }
}

export async function changePasswordAction(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    const parsed = changePasswordSchema.parse(input);
    enforce(`password:${actor.id}`, 5, 10 * 60 * 1000);

    await changePasswordService(actor, parsed);
    // The old session token no longer matches tokenVersion, so reissue one.
    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
    await setSessionCookie(await createSessionToken(refreshed));
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}
