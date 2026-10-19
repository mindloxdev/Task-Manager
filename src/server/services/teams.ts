/** Teams, memberships and projects. */
import { z } from "zod";

import { prisma } from "@/server/db";
import type { SessionUser } from "@/server/auth";
import { conflict, forbidden, notFound, validation } from "@/server/errors";
import {
  canCreateTeam,
  canManageMembership,
  canManageTeam,
  canViewTeam,
  isOwner,
} from "@/server/permissions";
import { recordActivity, recordAudit } from "@/server/services/activity";
import { notify } from "@/server/services/notifications";
import { ACTIVE_TASK_STATUSES, TASK_PRIORITY_WEIGHT, type TaskPriority, type TaskStatus } from "@/lib/enums";
import { taskHealth } from "@/lib/task-health";
import { ratioPct, slugify } from "@/lib/utils";
import type { createProjectSchema, createTeamSchema, membershipSchema, updateTeamSchema } from "@/lib/validation";

export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
export type MembershipInput = z.infer<typeof membershipSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || "team";
  let candidate = base;
  let suffix = 2;
  while (await prisma.team.findUnique({ where: { slug: candidate } })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export async function createTeam(actor: SessionUser, input: CreateTeamInput) {
  if (!canCreateTeam(actor)) throw forbidden("Only the company owner can create teams.");

  const memberIds = Array.from(new Set([...input.memberIds, ...input.leadIds]));
  if (memberIds.length > 0) {
    const found = await prisma.user.findMany({ where: { id: { in: memberIds } }, select: { id: true, status: true } });
    if (found.length !== memberIds.length) throw validation("One of the chosen people no longer exists.");
  }

  const team = await prisma.$transaction(async (tx) => {
    const created = await tx.team.create({
      data: {
        name: input.name,
        slug: await uniqueSlug(input.name),
        description: input.description,
        color: input.color,
        createdById: actor.id,
        memberships: {
          create: memberIds.map((userId) => ({
            userId,
            role: input.leadIds.includes(userId) ? "LEAD" : "MEMBER",
          })),
        },
      },
      include: { memberships: true },
    });
    await recordActivity(
      {
        action: "TEAM_CREATED",
        summary: `${actor.name} created the ${created.name} team`,
        teamId: created.id,
        actorId: actor.id,
        meta: { members: memberIds.length, leads: input.leadIds },
      },
      tx,
    );
    await recordAudit(
      { actorId: actor.id, action: "TEAM_CREATED", entityType: "Team", entityId: created.id, after: { name: created.name } },
      tx,
    );
    return created;
  });

  if (memberIds.length > 0) {
    await notify({
      userIds: memberIds,
      type: "TEAM_MEMBERSHIP",
      title: `You were added to ${team.name}`,
      body: `${actor.name} added you to the ${team.name} team.`,
      actorId: actor.id,
      href: `/teams/${team.id}`,
    });
  }

  return team;
}

export async function updateTeam(actor: SessionUser, teamId: string, input: UpdateTeamInput) {
  if (!canManageTeam(actor, teamId)) throw forbidden("Only the owner or a team lead can change this team.");
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) throw notFound("That team does not exist.");

  const updated = await prisma.team.update({
    where: { id: teamId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
    },
  });
  await recordActivity({
    action: "TEAM_UPDATED",
    summary: `${actor.name} updated the ${updated.name} team`,
    teamId,
    actorId: actor.id,
  });
  return updated;
}

export async function archiveTeam(actor: SessionUser, teamId: string) {
  if (!isOwner(actor)) throw forbidden("Only the company owner can archive a team.");
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) throw notFound("That team does not exist.");
  if (team.archivedAt) throw conflict("That team is already archived.");

  const openTasks = await prisma.task.count({
    where: { teamId, status: { in: ACTIVE_TASK_STATUSES }, archivedAt: null },
  });
  if (openTasks > 0) {
    throw conflict(
      `${team.name} still has ${openTasks} open ${openTasks === 1 ? "task" : "tasks"}. Reassign or close them before archiving.`,
    );
  }

  const archived = await prisma.team.update({ where: { id: teamId }, data: { archivedAt: new Date() } });
  await recordActivity({
    action: "TEAM_ARCHIVED",
    summary: `${actor.name} archived the ${team.name} team`,
    teamId,
    actorId: actor.id,
  });
  await recordAudit({ actorId: actor.id, action: "TEAM_ARCHIVED", entityType: "Team", entityId: teamId });
  return archived;
}

export async function restoreTeam(actor: SessionUser, teamId: string) {
  if (!isOwner(actor)) throw forbidden("Only the company owner can restore a team.");
  return prisma.team.update({ where: { id: teamId }, data: { archivedAt: null } });
}

export async function addMember(actor: SessionUser, teamId: string, input: MembershipInput) {
  if (!canManageMembership(actor, teamId)) throw forbidden("Only the owner or a team lead can change membership.");
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) throw notFound("That team does not exist.");
  if (team.archivedAt) throw validation("That team is archived.");

  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) throw notFound("That person does not exist.");
  if (user.status === "DEACTIVATED") throw validation("A deactivated account cannot join a team.");
  // Only the owner appoints leads, so a lead cannot promote themselves sideways.
  if (input.role === "LEAD" && !isOwner(actor)) throw forbidden("Only the company owner can appoint a team lead.");

  const existing = await prisma.teamMembership.findUnique({ where: { teamId_userId: { teamId, userId: user.id } } });
  if (existing) throw conflict(`${user.name} is already in this team.`);

  const membership = await prisma.teamMembership.create({ data: { teamId, userId: user.id, role: input.role } });
  await recordActivity({
    action: "MEMBER_ADDED",
    summary: `${actor.name} added ${user.name} to ${team.name}`,
    teamId,
    actorId: actor.id,
    meta: { userId: user.id, role: input.role },
  });
  await notify({
    userIds: [user.id],
    type: "TEAM_MEMBERSHIP",
    title: `You joined ${team.name}`,
    body: `${actor.name} added you to the ${team.name} team.`,
    actorId: actor.id,
    href: `/teams/${teamId}`,
  });
  return membership;
}

export async function setMemberRole(actor: SessionUser, teamId: string, userId: string, role: "LEAD" | "MEMBER") {
  if (!isOwner(actor)) throw forbidden("Only the company owner can change a team role.");
  const membership = await prisma.teamMembership.findUnique({ where: { teamId_userId: { teamId, userId } } });
  if (!membership) throw notFound("That person is not in this team.");
  const updated = await prisma.teamMembership.update({ where: { id: membership.id }, data: { role } });
  await recordAudit({
    actorId: actor.id,
    action: "TEAM_ROLE_CHANGED",
    entityType: "TeamMembership",
    entityId: membership.id,
    before: { role: membership.role },
    after: { role },
  });
  return updated;
}

export async function removeMember(actor: SessionUser, teamId: string, userId: string) {
  if (!canManageMembership(actor, teamId)) throw forbidden("Only the owner or a team lead can change membership.");
  const membership = await prisma.teamMembership.findUnique({
    where: { teamId_userId: { teamId, userId } },
    include: { user: { select: { name: true } }, team: { select: { name: true } } },
  });
  if (!membership) throw notFound("That person is not in this team.");
  if (membership.role === "LEAD" && !isOwner(actor)) throw forbidden("Only the company owner can remove a team lead.");

  // Someone with live work for this team cannot simply vanish from it.
  const openForTeam = await prisma.taskAssignee.count({
    where: {
      userId,
      task: { teamId, status: { in: ACTIVE_TASK_STATUSES }, archivedAt: null },
    },
  });
  if (openForTeam > 0) {
    throw conflict(
      `${membership.user.name} still has ${openForTeam} open ${openForTeam === 1 ? "task" : "tasks"} for this team. Reassign them first.`,
    );
  }

  await prisma.teamMembership.delete({ where: { id: membership.id } });
  await recordActivity({
    action: "MEMBER_REMOVED",
    summary: `${actor.name} removed ${membership.user.name} from ${membership.team.name}`,
    teamId,
    actorId: actor.id,
    meta: { userId },
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export type TeamSummary = {
  id: string;
  name: string;
  slug: string;
  color: string;
  description: string | null;
  archivedAt: Date | null;
  memberCount: number;
  leads: { id: string; name: string; avatarColor: string }[];
  activeTasks: number;
  completedTasks: number;
  overdueTasks: number;
  blockedTasks: number;
  awaitingReview: number;
  totalTasks: number;
  completionRate: number;
  weightedLoad: number;
};

/** Team table rows, scoped to what the viewer may see. */
export async function listTeamSummaries(user: SessionUser, options?: { includeArchived?: boolean }): Promise<TeamSummary[]> {
  const where = isOwner(user)
    ? options?.includeArchived
      ? {}
      : { archivedAt: null }
    : { id: { in: user.teams.map((t) => t.teamId) }, ...(options?.includeArchived ? {} : { archivedAt: null }) };

  const teams = await prisma.team.findMany({
    where,
    include: {
      memberships: { include: { user: { select: { id: true, name: true, avatarColor: true, status: true } } } },
      tasks: {
        where: { archivedAt: null },
        select: { id: true, status: true, dueAt: true, progress: true, startDate: true, priority: true },
      },
    },
    orderBy: [{ archivedAt: "asc" }, { name: "asc" }],
  });

  const now = new Date();
  return teams.map((team) => {
    const tasks = team.tasks;
    const completed = tasks.filter((t) => t.status === "COMPLETED").length;
    const active = tasks.filter((t) => ACTIVE_TASK_STATUSES.includes(t.status as TaskStatus)).length;
    const counted = tasks.filter((t) => t.status !== "CANCELLED" && t.status !== "DRAFT").length;
    return {
      id: team.id,
      name: team.name,
      slug: team.slug,
      color: team.color,
      description: team.description,
      archivedAt: team.archivedAt,
      memberCount: team.memberships.filter((m) => m.user.status === "ACTIVE").length,
      leads: team.memberships
        .filter((m) => m.role === "LEAD")
        .map((m) => ({ id: m.user.id, name: m.user.name, avatarColor: m.user.avatarColor })),
      activeTasks: active,
      completedTasks: completed,
      overdueTasks: tasks.filter(
        (t) =>
          taskHealth({ status: t.status as TaskStatus, progress: t.progress, startDate: t.startDate, dueAt: t.dueAt }, now) ===
          "OVERDUE",
      ).length,
      blockedTasks: tasks.filter((t) => t.status === "BLOCKED").length,
      awaitingReview: tasks.filter((t) => t.status === "SUBMITTED_FOR_REVIEW").length,
      totalTasks: tasks.length,
      completionRate: ratioPct(completed, counted),
      weightedLoad:
        Math.round(
          tasks
            .filter((t) => ACTIVE_TASK_STATUSES.includes(t.status as TaskStatus))
            .reduce((total, t) => total + (TASK_PRIORITY_WEIGHT[t.priority as TaskPriority] ?? 2), 0) * 10,
        ) / 10,
    };
  });
}

export async function getTeamDetail(user: SessionUser, teamId: string) {
  if (!canViewTeam(user, teamId)) throw forbidden("You do not have access to that team.");
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      memberships: {
        include: {
          user: {
            select: { id: true, name: true, email: true, jobTitle: true, avatarColor: true, status: true, role: true, weeklyHours: true },
          },
        },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      },
      projects: { where: { archivedAt: null }, orderBy: { name: "asc" } },
      createdBy: { select: { id: true, name: true } },
    },
  });
  if (!team) throw notFound("That team does not exist.");

  const memberIds = team.memberships.map((m) => m.userId);
  const workload = await prisma.taskAssignee.findMany({
    where: { userId: { in: memberIds }, task: { archivedAt: null, status: { in: ACTIVE_TASK_STATUSES } } },
    select: {
      userId: true,
      status: true,
      progress: true,
      task: { select: { priority: true, dueAt: true, status: true, startDate: true, progress: true, estimateHours: true } },
    },
  });

  return { team, workload };
}

/** People the actor may assign work to. */
export async function listAssignableUsers(user: SessionUser) {
  if (isOwner(user)) {
    return prisma.user.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, email: true, jobTitle: true, avatarColor: true, role: true },
      orderBy: { name: "asc" },
    });
  }
  const teamIds = user.ledTeamIds.length > 0 ? user.ledTeamIds : user.teams.map((t) => t.teamId);
  return prisma.user.findMany({
    where: { status: "ACTIVE", memberships: { some: { teamId: { in: teamIds } } } },
    select: { id: true, name: true, email: true, jobTitle: true, avatarColor: true, role: true },
    orderBy: { name: "asc" },
  });
}

/** Teams the actor may create tasks for. */
export async function listTaskTargetTeams(user: SessionUser) {
  const where = isOwner(user) ? { archivedAt: null } : { archivedAt: null, id: { in: user.ledTeamIds } };
  return prisma.team.findMany({
    where,
    select: {
      id: true,
      name: true,
      color: true,
      memberships: {
        where: { user: { status: "ACTIVE" } },
        select: { userId: true, role: true, user: { select: { id: true, name: true, avatarColor: true, jobTitle: true } } },
      },
    },
    orderBy: { name: "asc" },
  });
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function createProject(actor: SessionUser, input: CreateProjectInput) {
  if (!isOwner(actor) && !(input.teamId && actor.ledTeamIds.includes(input.teamId))) {
    throw forbidden("Only the owner or the lead of the owning team can create a project.");
  }
  const existing = await prisma.project.findUnique({ where: { key: input.key } });
  if (existing) throw conflict(`The project key ${input.key} is already in use.`);
  return prisma.project.create({
    data: {
      name: input.name,
      key: input.key,
      description: input.description,
      color: input.color,
      teamId: input.teamId,
    },
  });
}

export async function listProjects(user: SessionUser) {
  const where = isOwner(user)
    ? { archivedAt: null }
    : { archivedAt: null, OR: [{ teamId: { in: user.teams.map((t) => t.teamId) } }, { teamId: null }] };
  return prisma.project.findMany({
    where,
    include: {
      team: { select: { id: true, name: true, color: true } },
      _count: { select: { tasks: true } },
    },
    orderBy: { name: "asc" },
  });
}

export async function archiveProject(actor: SessionUser, projectId: string) {
  if (!isOwner(actor)) throw forbidden("Only the company owner can archive a project.");
  return prisma.project.update({ where: { id: projectId }, data: { archivedAt: new Date() } });
}
