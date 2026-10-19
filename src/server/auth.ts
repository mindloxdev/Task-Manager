/**
 * Authentication: password hashing, signed session cookies, current user.
 *
 * Sessions are stateless JWTs in an httpOnly, SameSite=Lax cookie, signed with
 * AUTH_SECRET. Each token carries the user's `tokenVersion`; bumping that
 * column (on deactivation or a password change) invalidates every token that
 * was already handed out.
 */
import "server-only";

import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "@prisma/client";

import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { forbidden, unauthenticated } from "@/server/errors";
import { compareAgainstDecoy, hashPassword, verifyPassword } from "@/server/password";
import type { UserRole } from "@/lib/enums";

export const SESSION_COOKIE = "cadence_session";

export { hashPassword, verifyPassword };

export type SessionClaims = {
  sub: string;
  role: UserRole;
  tv: number;
};

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.authSecret);
}

export async function createSessionToken(user: Pick<User, "id" | "role" | "tokenVersion">): Promise<string> {
  const ttl = env.sessionTtlHours;
  return new SignJWT({ role: user.role as UserRole, tv: user.tokenVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setIssuer("cadence")
    .setAudience("cadence-app")
    .setExpirationTime(`${ttl}h`)
    .sign(secretKey());
}

export async function readSessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: "cadence",
      audience: "cadence-app",
    });
    if (!payload.sub) return null;
    return {
      sub: payload.sub,
      role: payload.role as UserRole,
      tv: typeof payload.tv === "number" ? payload.tv : 0,
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProduction,
    path: "/",
    maxAge: env.sessionTtlHours * 60 * 60,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  jobTitle: string | null;
  role: UserRole;
  status: string;
  timezone: string;
  avatarColor: string;
  /** Teams the user belongs to, with the role they hold there. */
  teams: { teamId: string; teamName: string; role: string }[];
  /** Teams the user leads — the scope a manager may act within. */
  ledTeamIds: string[];
};

/**
 * Resolve the signed-in user from the session cookie.
 *
 * The role, status and team memberships are always re-read from the database:
 * nothing the browser sends is trusted for authorisation.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const claims = await readSessionToken(token);
  if (!claims) return null;

  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    include: { memberships: { include: { team: { select: { id: true, name: true, archivedAt: true } } } } },
  });
  if (!user) return null;
  if (user.tokenVersion !== claims.tv) return null;
  if (user.status !== "ACTIVE") return null;

  return toSessionUser(user);
}

type UserWithMemberships = User & {
  memberships: { teamId: string; role: string; team: { id: string; name: string; archivedAt: Date | null } }[];
};

export function toSessionUser(user: UserWithMemberships): SessionUser {
  const teams = user.memberships
    .filter((m) => !m.team.archivedAt)
    .map((m) => ({ teamId: m.teamId, teamName: m.team.name, role: m.role }));
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    jobTitle: user.jobTitle,
    role: user.role as UserRole,
    status: user.status,
    timezone: user.timezone,
    avatarColor: user.avatarColor,
    teams,
    ledTeamIds: teams.filter((t) => t.role === "LEAD").map((t) => t.teamId),
  };
}

/** Load the current user for the given id — used by API routes and tests. */
export async function loadSessionUser(userId: string): Promise<SessionUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { memberships: { include: { team: { select: { id: true, name: true, archivedAt: true } } } } },
  });
  if (!user) throw unauthenticated("Your account no longer exists.");
  if (user.status !== "ACTIVE") throw forbidden("This account is not active.");
  return toSessionUser(user);
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw unauthenticated();
  return user;
}

export async function requireRole(...roles: UserRole[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw forbidden();
  return user;
}

/**
 * Authenticate an email/password pair. Returns null for any failure so the
 * caller cannot distinguish "no such user" from "wrong password".
 */
export async function authenticate(email: string, password: string): Promise<User | null> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user || user.status !== "ACTIVE" || !user.passwordHash) {
    await compareAgainstDecoy(password);
    return null;
  }
  const ok = await verifyPassword(password, user.passwordHash);
  return ok ? user : null;
}
