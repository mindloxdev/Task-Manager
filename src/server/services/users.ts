/** People: invitations, profiles, roles, deactivation, workload overview. */
import { randomBytes } from "node:crypto";
import { z } from "zod";

import { prisma } from "@/server/db";
import type { SessionUser } from "@/server/auth";
import { hashPassword, verifyPassword } from "@/server/password";
import { conflict, forbidden, notFound, validation } from "@/server/errors";
import { canChangeRole, canInviteUsers, canManageUser, isOwner } from "@/server/permissions";
import { recordActivity, recordAudit } from "@/server/services/activity";
import { notify } from "@/server/services/notifications";
import { ACTIVE_TASK_STATUSES, TASK_PRIORITY_WEIGHT, type TaskPriority, type TaskStatus } from "@/lib/enums";
import { taskHealth, workloadScore } from "@/lib/task-health";
import { colorForKey, ratioPct } from "@/lib/utils";
import type { changeRoleSchema, inviteUserSchema, updateUserSchema } from "@/lib/validation";

export type InviteUserInput = z.infer<typeof inviteUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ChangeRoleInput = z.infer<typeof changeRoleSchema>;

/**
 * Invite someone. The account is created in the INVITED state with no password
 * and a single-use token; it cannot sign in until the invite is accepted.
 */
export async function inviteUser(actor: SessionUser, input: InviteUserInput) {
  if (!canInviteUsers(actor)) throw forbidden("Only the company owner can invite people.");

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw conflict("Someone with that email address already has an account.");

  if (input.teamIds.length > 0) {
    const teams = await prisma.team.findMany({ where: { id: { in: input.teamIds } }, select: { id: true } });
    if (teams.length !== input.teamIds.length) throw validation("One of the chosen teams no longer exists.");
  }

  const token = randomBytes(24).toString("base64url");

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: input.email,
        name: input.name,
        jobTitle: input.jobTitle,
        role: input.role,
        status: "INVITED",
        timezone: input.timezone,
        weeklyHours: input.weeklyHours,
        avatarColor: colorForKey(input.email),
        inviteToken: token,
        invitedAt: new Date(),
        preferences: { create: {} },
        memberships: { create: input.teamIds.map((teamId) => ({ teamId, role: "MEMBER" })) },
      },
    });
    await recordActivity(
      {
        action: "USER_INVITED",
        summary: `${actor.name} invited ${created.name} as ${input.role.toLowerCase()}`,
        actorId: actor.id,
        meta: { userId: created.id, teamIds: input.teamIds },
      },
      tx,
    );
    await recordAudit(
      {
        actorId: actor.id,
        action: "USER_INVITED",
        entityType: "User",
        entityId: created.id,
        after: { email: created.email, role: created.role },
      },
      tx,
    );
    return created;
  });

  // The token is returned to the owner so they can pass on the link. No email
  // is claimed to have been sent unless a provider is configured.
  return { user, inviteToken: token, inviteUrl: `/invite/${token}` };
}

export async function acceptInvite(input: { token: string; name: string; password: string }) {
  const user = await prisma.user.findUnique({ where: { inviteToken: input.token } });
  if (!user) throw notFound("That invitation is not valid or has already been used.");
  if (user.status !== "INVITED") throw conflict("That invitation has already been accepted.");

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      name: input.name,
      passwordHash: await hashPassword(input.password),
      status: "ACTIVE",
      inviteToken: null,
      tokenVersion: { increment: 1 },
    },
  });
  await recordActivity({
    action: "USER_UPDATED",
    summary: `${updated.name} accepted their invitation`,
    actorId: updated.id,
  });
  return updated;
}

export async function updateProfile(actor: SessionUser, userId: string, input: UpdateUserInput) {
  if (!canManageUser(actor, userId)) throw forbidden("You can only change your own profile.");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound("That person does not exist.");

  return prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.jobTitle !== undefined ? { jobTitle: input.jobTitle } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      ...(input.weeklyHours !== undefined ? { weeklyHours: input.weeklyHours } : {}),
      ...(input.avatarColor !== undefined ? { avatarColor: input.avatarColor } : {}),
    },
  });
}

export async function changePassword(actor: SessionUser, input: { currentPassword: string; newPassword: string }) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
  const ok = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!ok) throw validation("That is not your current password.");

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(input.newPassword),
      // Invalidate every other session that was signed in with the old password.
      tokenVersion: { increment: 1 },
    },
  });
  await recordAudit({ actorId: actor.id, action: "PASSWORD_CHANGED", entityType: "User", entityId: actor.id });
}

export async function changeRole(actor: SessionUser, userId: string, input: ChangeRoleInput) {
  if (!canChangeRole(actor, userId)) throw forbidden("Only the company owner can change someone else's role.");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound("That person does not exist.");
  if (user.role === input.role) throw conflict(`They are already ${input.role.toLowerCase()}.`);

  // The company must never be left without an owner.
  if (user.role === "OWNER" && input.role !== "OWNER") {
    const owners = await prisma.user.count({ where: { role: "OWNER", status: "ACTIVE" } });
    if (owners <= 1) throw conflict("There must be at least one active owner.");
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    // Role lives inside the session token, so existing sessions must be reissued.
    data: { role: input.role, tokenVersion: { increment: 1 } },
  });
  await recordAudit({
    actorId: actor.id,
    action: "ROLE_CHANGED",
    entityType: "User",
    entityId: userId,
    before: { role: user.role },
    after: { role: input.role },
  });
  await recordActivity({
    action: "USER_UPDATED",
    summary: `${actor.name} changed ${user.name}'s role to ${input.role.toLowerCase()}`,
    actorId: actor.id,
    meta: { userId },
  });
  return updated;
}

export async function deactivateUser(actor: SessionUser, userId: string) {
  if (!isOwner(actor)) throw forbidden("Only the company owner can deactivate an account.");
  if (actor.id === userId) throw forbidden("You cannot deactivate your own account.");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound("That person does not exist.");
  if (user.status === "DEACTIVATED") throw conflict("That account is already deactivated.");
  if (user.role === "OWNER") {
    const owners = await prisma.user.count({ where: { role: "OWNER", status: "ACTIVE" } });
    if (owners <= 1) throw conflict("There must be at least one active owner.");
  }

  const openTasks = await prisma.taskAssignee.count({
    where: { userId, task: { status: { in: ACTIVE_TASK_STATUSES }, archivedAt: null } },
  });

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      status: "DEACTIVATED",
      deactivatedAt: new Date(),
      // Signs them out everywhere immediately.
      tokenVersion: { increment: 1 },
    },
  });

  await recordActivity({
    action: "USER_DEACTIVATED",
    summary: `${actor.name} deactivated ${user.name}${openTasks > 0 ? ` (${openTasks} open tasks need reassigning)` : ""}`,
    actorId: actor.id,
    meta: { userId, openTasks },
  });
  await recordAudit({
    actorId: actor.id,
    action: "USER_DEACTIVATED",
    entityType: "User",
    entityId: userId,
    before: { status: user.status },
    after: { status: "DEACTIVATED", openTasks },
  });

  return { user: updated, openTasks };
}

export async function reactivateUser(actor: SessionUser, userId: string) {
  if (!isOwner(actor)) throw forbidden("Only the company owner can reactivate an account.");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound("That person does not exist.");
  if (user.status === "ACTIVE") throw conflict("That account is already active.");

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { status: user.passwordHash ? "ACTIVE" : "INVITED", deactivatedAt: null },
  });
  await recordActivity({
    action: "USER_REACTIVATED",
    summary: `${actor.name} reactivated ${user.name}`,
    actorId: actor.id,
    meta: { userId },
  });
  await notify({
    userIds: [userId],
    type: "TEAM_MEMBERSHIP",
    title: "Your account was reactivated",
    body: `${actor.name} restored your access.`,
    actorId: actor.id,
    href: "/dashboard",
  });
  return updated;
}

// ---------------------------------------------------------------------------
// Employee overview
// ---------------------------------------------------------------------------

export type EmployeeRow = {
  id: string;
  name: string;
  email: string;
  jobTitle: string | null;
  avatarColor: string;
  role: string;
  status: string;
  weeklyHours: number;
  teams: { id: string; name: string; color: string; role: string }[];
  assignedTasks: number;
  activeTasks: number;
  completedTasks: number;
  overdueTasks: number;
  blockedTasks: number;
  awaitingReview: number;
  pendingUpdateRequests: number;
  onTimeRate: number;
  latestUpdate: { createdAt: Date; progress: number; taskCode: string; excerpt: string | null } | null;
  workloadWeighted: number;
  workloadHours: number;
};

/**
 * The employee table. Owners see everyone; managers see the people in the
 * teams they lead; employees see only themselves.
 */
export async function listEmployees(user: SessionUser, options?: { includeInactive?: boolean }): Promise<EmployeeRow[]> {
  const scopeWhere =
    user.role === "OWNER"
      ? {}
      : user.role === "MANAGER"
        ? { OR: [{ memberships: { some: { teamId: { in: user.ledTeamIds } } } }, { id: user.id }] }
        : { id: user.id };

  const users = await prisma.user.findMany({
    where: {
      AND: [scopeWhere, options?.includeInactive ? {} : { status: { not: "DEACTIVATED" } }],
    },
    include: {
      memberships: { include: { team: { select: { id: true, name: true, color: true } } } },
      assignments: {
        include: {
          task: {
            select: {
              id: true,
              code: true,
              status: true,
              priority: true,
              dueAt: true,
              startDate: true,
              progress: true,
              estimateHours: true,
              completedAt: true,
              originalDueAt: true,
              archivedAt: true,
              assignees: { where: { isRequired: true }, select: { id: true } },
            },
          },
        },
      },
      updateRequestsGot: { where: { respondedAt: null }, select: { id: true } },
      progressUpdates: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { task: { select: { code: true } } },
      },
    },
    orderBy: { name: "asc" },
  });

  const now = new Date();

  return users.map((row) => {
    const live = row.assignments.filter((a) => !a.task.archivedAt);
    const active = live.filter((a) => ACTIVE_TASK_STATUSES.includes(a.task.status as TaskStatus));
    const completed = live.filter((a) => a.task.status === "COMPLETED");
    const onTime = completed.filter((a) => {
      const due = a.task.originalDueAt ?? a.task.dueAt;
      return !due || !a.task.completedAt || a.task.completedAt <= due;
    }).length;

    const load = workloadScore(
      active.map((a) => ({
        priorityWeight: TASK_PRIORITY_WEIGHT[a.task.priority as TaskPriority] ?? 2,
        requiredAssignees: Math.max(1, a.task.assignees.length),
        estimateHours: a.task.estimateHours,
      })),
    );

    const latest = row.progressUpdates[0];

    return {
      id: row.id,
      name: row.name,
      email: row.email,
      jobTitle: row.jobTitle,
      avatarColor: row.avatarColor,
      role: row.role,
      status: row.status,
      weeklyHours: row.weeklyHours,
      teams: row.memberships.map((m) => ({ ...m.team, role: m.role })),
      assignedTasks: live.length,
      activeTasks: active.length,
      completedTasks: completed.length,
      overdueTasks: active.filter(
        (a) =>
          taskHealth(
            { status: a.task.status as TaskStatus, progress: a.task.progress, startDate: a.task.startDate, dueAt: a.task.dueAt },
            now,
          ) === "OVERDUE",
      ).length,
      blockedTasks: active.filter((a) => a.status === "BLOCKED").length,
      awaitingReview: active.filter((a) => a.status === "SUBMITTED").length,
      pendingUpdateRequests: row.updateRequestsGot.length,
      onTimeRate: ratioPct(onTime, completed.length),
      latestUpdate: latest
        ? {
            createdAt: latest.createdAt,
            progress: latest.progress,
            taskCode: latest.task.code,
            excerpt: latest.workCompleted ?? latest.blockers ?? null,
          }
        : null,
      workloadWeighted: load.weighted,
      workloadHours: load.hours,
    };
  });
}

export async function getUserProfile(user: SessionUser, userId: string) {
  const canSee =
    isOwner(user) ||
    user.id === userId ||
    (user.role === "MANAGER" &&
      (await prisma.teamMembership.count({ where: { userId, teamId: { in: user.ledTeamIds } } })) > 0);
  if (!canSee) throw forbidden("You do not have access to that profile.");

  const profile = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: { include: { team: { select: { id: true, name: true, color: true } } } },
      preferences: true,
    },
  });
  if (!profile) throw notFound("That person does not exist.");

  const { passwordHash: _passwordHash, inviteToken: _inviteToken, ...safe } = profile;
  return safe;
}

export async function listAuditLog(user: SessionUser, limit = 100) {
  if (!isOwner(user)) throw forbidden("Only the company owner can read the audit history.");
  return prisma.auditLog.findMany({
    include: { actor: { select: { id: true, name: true, avatarColor: true } } },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 500),
  });
}
