/**
 * Task service: creation, assignment, lifecycle transitions, listing.
 *
 * Two invariants hold throughout:
 *  1. A task is stored once. Assigning it to several people adds TaskAssignee
 *     rows — it never copies the task.
 *  2. The task-level status and percentage are rolled up from the assignees by
 *     `recomputeRollup`, which refuses to overwrite states only a manager may
 *     set (draft, completed, cancelled).
 */
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma, type TxClient } from "@/server/db";
import type { SessionUser } from "@/server/auth";
import { conflict, forbidden, notFound, validation } from "@/server/errors";
import {
  assertCanManageTask,
  assertCanViewTask,
  canCreateTaskForTeam,
  canManageTask,
  canViewTask,
  isAssignee,
  isOwner,
  type TaskScope,
} from "@/server/permissions";
import { recordActivity, recordAudit } from "@/server/services/activity";
import { notify } from "@/server/services/notifications";
import {
  ACTIVE_TASK_STATUSES,
  TASK_PRIORITY_WEIGHT,
  type AssigneeStatus,
  type CompletionRule,
  type ProgressMode,
  type TaskHealth,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/enums";
import { deriveTaskStatus, rollupProgress, taskHealth } from "@/lib/task-health";
import type { createTaskSchema, setAssigneesSchema, TaskFilter, updateTaskSchema } from "@/lib/validation";
import { uniq } from "@/lib/utils";

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type SetAssigneesInput = z.infer<typeof setAssigneesSchema>;

// ---------------------------------------------------------------------------
// Scope loading
// ---------------------------------------------------------------------------

export async function loadTaskScope(taskId: string, db: TxClient = prisma): Promise<TaskScope> {
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      teamId: true,
      createdById: true,
      primaryOwnerId: true,
      reviewRequired: true,
      assignees: { select: { userId: true } },
    },
  });
  if (!task) throw notFound("That task does not exist.");
  return {
    id: task.id,
    teamId: task.teamId,
    createdById: task.createdById,
    primaryOwnerId: task.primaryOwnerId,
    reviewRequired: task.reviewRequired,
    assigneeIds: task.assignees.map((a) => a.userId),
  };
}

/** Scope + the permission check, in one call. */
export async function requireViewableTask(user: SessionUser, taskId: string, db: TxClient = prisma): Promise<TaskScope> {
  const scope = await loadTaskScope(taskId, db);
  assertCanViewTask(user, scope);
  return scope;
}

export async function requireManageableTask(user: SessionUser, taskId: string, db: TxClient = prisma): Promise<TaskScope> {
  const scope = await loadTaskScope(taskId, db);
  assertCanManageTask(user, scope);
  return scope;
}

/**
 * Prisma filter restricting a query to the tasks a user may see. Owners get an
 * empty filter (everything); everyone else is limited to their own work, their
 * teams, and tasks they created or lead.
 */
export function taskVisibilityFilter(user: SessionUser): Prisma.TaskWhereInput {
  if (isOwner(user)) return {};
  const teamIds = user.teams.map((t) => t.teamId);
  return {
    OR: [
      { createdById: user.id },
      { primaryOwnerId: user.id },
      { assignees: { some: { userId: user.id } } },
      ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : []),
    ],
  };
}

// ---------------------------------------------------------------------------
// Task codes
// ---------------------------------------------------------------------------

async function nextTaskCode(db: TxClient): Promise<string> {
  const prefixSetting = await db.setting.findUnique({ where: { key: "taskCodePrefix" } });
  const prefix = prefixSetting?.value || "CAD";
  const counter = await db.counter.upsert({
    where: { key: "taskCode" },
    create: { key: "taskCode", value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${prefix}-${String(counter.value).padStart(3, "0")}`;
}

// ---------------------------------------------------------------------------
// Assignment resolution
// ---------------------------------------------------------------------------

type ResolvedAssignee = { userId: string; isRequired: boolean; isPrimary: boolean; viaTeam: boolean };

/**
 * Work out exactly who is accountable, rejecting anyone who cannot receive
 * work. Duplicates collapse to a single row, so one person is never assigned
 * the same task twice.
 */
async function resolveAssignees(
  db: TxClient,
  params: {
    assignmentType: "INDIVIDUAL" | "MULTIPLE" | "TEAM";
    teamId: string | null;
    requiredIds: string[];
    optionalIds: string[];
    primaryOwnerId: string | null;
  },
): Promise<{ assignees: ResolvedAssignee[]; primaryOwnerId: string | null }> {
  const explicitRequired = uniq(params.requiredIds);
  const explicitOptional = uniq(params.optionalIds).filter((id) => !explicitRequired.includes(id));

  // The shape invariants are also checked by the Zod schema at the request
  // boundary; they are repeated here so the service cannot be misused by a
  // caller that skipped validation.
  if (params.assignmentType === "INDIVIDUAL" && explicitRequired.length > 1) {
    throw validation("An individual task has exactly one accountable person. Switch to several people, or a team.");
  }
  if (params.assignmentType === "INDIVIDUAL" && explicitOptional.length > 0) {
    throw validation("An individual task cannot have optional collaborators. Switch to several people.");
  }

  let teamMemberIds: string[] = [];
  if (params.assignmentType === "TEAM") {
    if (!params.teamId) throw validation("Choose the team this task is assigned to.");
    const team = await db.team.findUnique({
      where: { id: params.teamId },
      include: { memberships: { include: { user: { select: { id: true, status: true } } } } },
    });
    if (!team) throw notFound("That team does not exist.");
    if (team.archivedAt) throw validation("That team is archived and cannot receive new work.");
    // Only active people are eligible; deactivated accounts never get new work.
    teamMemberIds = team.memberships.filter((m) => m.user.status === "ACTIVE").map((m) => m.userId);
    if (teamMemberIds.length === 0) {
      throw validation("That team has no active members to assign the task to.");
    }
  }

  const allIds = uniq([...explicitRequired, ...explicitOptional, ...teamMemberIds]);
  if (allIds.length === 0) return { assignees: [], primaryOwnerId: null };

  const users = await db.user.findMany({
    where: { id: { in: allIds } },
    select: { id: true, name: true, status: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  for (const id of [...explicitRequired, ...explicitOptional]) {
    const user = byId.get(id);
    if (!user) throw validation("One of the chosen people no longer exists.");
    if (user.status !== "ACTIVE") {
      throw validation(`${user.name} is not an active employee and cannot be assigned new work.`);
    }
  }

  let primaryOwnerId = params.primaryOwnerId;
  if (primaryOwnerId) {
    const owner = byId.get(primaryOwnerId);
    if (!owner) throw validation("The primary owner must be one of the assignees.");
    if (owner.status !== "ACTIVE") throw validation("The primary owner must be an active employee.");
  }

  const requiredSet = new Set<string>(explicitRequired);
  if (params.assignmentType === "TEAM") {
    for (const id of teamMemberIds) requiredSet.add(id);
  }
  for (const id of explicitOptional) requiredSet.delete(id);

  // An individual task has exactly one accountable person, who is also primary.
  if (params.assignmentType === "INDIVIDUAL") {
    const only = explicitRequired[0] ?? null;
    if (only) primaryOwnerId = only;
  }

  const assignees: ResolvedAssignee[] = uniq([...requiredSet, ...explicitOptional]).map((userId) => ({
    userId,
    isRequired: requiredSet.has(userId),
    isPrimary: primaryOwnerId === userId,
    viaTeam: teamMemberIds.includes(userId) && !explicitRequired.includes(userId) && !explicitOptional.includes(userId),
  }));

  if (primaryOwnerId && !assignees.some((a) => a.userId === primaryOwnerId)) {
    throw validation("The primary owner must be one of the assignees.");
  }

  return { assignees, primaryOwnerId };
}

// ---------------------------------------------------------------------------
// Rollup
// ---------------------------------------------------------------------------

export type RollupResult = { status: TaskStatus; progress: number; changed: boolean };

/**
 * Recalculate the task's status and percentage from its assignees and
 * checklist, then persist any change.
 */
export async function recomputeRollup(taskId: string, db: TxClient = prisma): Promise<RollupResult> {
  const task = await db.task.findUnique({
    where: { id: taskId },
    include: { assignees: true, subtasks: { select: { isDone: true } } },
  });
  if (!task) throw notFound("That task does not exist.");

  const assignees = task.assignees.map((a) => ({
    isRequired: a.isRequired,
    isPrimary: a.isPrimary,
    status: a.status as AssigneeStatus,
    progress: a.progress,
  }));

  const progress = rollupProgress({
    progressMode: task.progressMode as ProgressMode,
    completionRule: task.completionRule as CompletionRule,
    assignees,
    subtasks: task.subtasks,
    fallback: task.progress,
  });

  const derived = deriveTaskStatus({
    current: task.status as TaskStatus,
    reviewRequired: task.reviewRequired,
    completionRule: task.completionRule as CompletionRule,
    assignees,
  });

  const nextStatus = derived ?? (task.status as TaskStatus);
  const now = new Date();
  const data: Prisma.TaskUpdateInput = {};

  if (progress !== task.progress) data.progress = progress;
  if (nextStatus !== task.status) {
    data.status = nextStatus;
    if (nextStatus === "ACKNOWLEDGED" && !task.acknowledgedAt) data.acknowledgedAt = now;
    if (nextStatus === "IN_PROGRESS" && !task.startedAt) data.startedAt = now;
    if (nextStatus === "BLOCKED") data.blockedAt = now;
    if (nextStatus === "SUBMITTED_FOR_REVIEW") data.submittedAt = now;
    if (nextStatus === "COMPLETED") data.completedAt = now;
  }

  const changed = Object.keys(data).length > 0;
  if (changed) await db.task.update({ where: { id: taskId }, data });

  return { status: nextStatus, progress, changed };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createTask(actor: SessionUser, input: CreateTaskInput) {
  if (!canCreateTaskForTeam(actor, input.teamId)) {
    throw forbidden("You can only create tasks for a team you lead.");
  }

  if (input.projectId) {
    const project = await prisma.project.findUnique({ where: { id: input.projectId } });
    if (!project) throw validation("That project does not exist.");
  }

  const created = await prisma.$transaction(async (tx) => {
    const { assignees, primaryOwnerId } = await resolveAssignees(tx, {
      assignmentType: input.assignmentType,
      teamId: input.teamId,
      requiredIds: input.assigneeIds,
      optionalIds: input.optionalAssigneeIds,
      primaryOwnerId: input.primaryOwnerId,
    });

    if (!input.asDraft && assignees.length === 0) {
      throw validation("Choose at least one person, or save the task as a draft.");
    }

    const code = await nextTaskCode(tx);
    const now = new Date();
    const isDraft = input.asDraft || assignees.length === 0;

    const task = await tx.task.create({
      data: {
        code,
        title: input.title,
        description: input.description,
        instruction: input.instruction,
        priority: input.priority,
        status: isDraft ? "DRAFT" : "ASSIGNED",
        assignmentType: input.assignmentType,
        completionRule: input.assignmentType === "INDIVIDUAL" ? "ALL_REQUIRED" : input.completionRule,
        progressMode: input.progressMode,
        updateCadence: input.updateCadence,
        recurrence: input.recurrence,
        reviewRequired: input.reviewRequired,
        estimateHours: input.estimateHours,
        category: input.category,
        startDate: input.startDate,
        dueAt: input.dueAt,
        originalDueAt: input.dueAt,
        teamId: input.teamId,
        projectId: input.projectId,
        createdById: actor.id,
        primaryOwnerId,
        assignedAt: isDraft ? null : now,
        assignees: { create: assignees },
        subtasks: {
          create: input.subtasks.map((subtask, index) => ({
            title: subtask.title,
            isDone: subtask.isDone,
            position: index,
            ...(subtask.isDone ? { completedById: actor.id, completedAt: now } : {}),
          })),
        },
        attachments: {
          create: input.links.map((link) => ({
            uploaderId: actor.id,
            kind: "LINK",
            filename: link.label ?? link.url,
            label: link.label,
            url: link.url,
          })),
        },
      },
      include: { assignees: true },
    });

    await recordActivity(
      {
        action: "TASK_CREATED",
        summary: `${actor.name} created ${task.code} — ${task.title}`,
        taskId: task.id,
        teamId: task.teamId,
        actorId: actor.id,
        meta: { priority: task.priority, assignmentType: task.assignmentType },
      },
      tx,
    );

    if (!isDraft) {
      await recordActivity(
        {
          action: "TASK_ASSIGNED",
          summary: `${actor.name} assigned ${task.code} to ${describeAssignment(input.assignmentType, task.assignees.length)}`,
          taskId: task.id,
          teamId: task.teamId,
          actorId: actor.id,
          meta: { assigneeIds: task.assignees.map((a) => a.userId) },
        },
        tx,
      );
    }

    if (task.progressMode === "CHECKLIST") {
      await recomputeRollup(task.id, tx);
    }

    return task;
  });

  if (created.status !== "DRAFT") {
    await notify({
      userIds: created.assignees.map((a) => a.userId),
      type: "TASK_ASSIGNED",
      title: `New task: ${created.title}`,
      body: `${actor.name} assigned you ${created.code}.`,
      taskId: created.id,
      actorId: actor.id,
      href: `/tasks/${created.id}`,
      email: { subject: `[${created.code}] You have a new task`, text: `${actor.name} assigned you "${created.title}".` },
    });
  }

  return created;
}

function describeAssignment(assignmentType: string, count: number): string {
  if (assignmentType === "TEAM") return `the whole team (${count} ${count === 1 ? "person" : "people"})`;
  if (assignmentType === "MULTIPLE") return `${count} people`;
  return "one person";
}

/** Publish a draft: assign it and notify everyone involved. */
export async function publishTask(actor: SessionUser, taskId: string) {
  const scope = await requireManageableTask(actor, taskId);
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, include: { assignees: true } });
  if (task.status !== "DRAFT") throw conflict("Only a draft can be assigned.");
  if (task.assignees.length === 0) throw validation("Add at least one assignee before assigning this task.");

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id: taskId }, data: { status: "ASSIGNED", assignedAt: now } });
    await recordActivity(
      {
        action: "TASK_ASSIGNED",
        summary: `${actor.name} assigned ${task.code} to ${describeAssignment(task.assignmentType, task.assignees.length)}`,
        taskId,
        teamId: task.teamId,
        actorId: actor.id,
      },
      tx,
    );
  });

  await notify({
    userIds: task.assignees.map((a) => a.userId),
    type: "TASK_ASSIGNED",
    title: `New task: ${task.title}`,
    body: `${actor.name} assigned you ${task.code}.`,
    taskId,
    actorId: actor.id,
    href: `/tasks/${taskId}`,
    email: { subject: `[${task.code}] You have a new task`, text: `${actor.name} assigned you "${task.title}".` },
  });

  void scope;
  return prisma.task.findUniqueOrThrow({ where: { id: taskId } });
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateTask(actor: SessionUser, taskId: string, input: UpdateTaskInput) {
  await requireManageableTask(actor, taskId);
  const before = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, include: { assignees: true } });

  if (before.status === "CANCELLED") throw conflict("A cancelled task cannot be edited. Restore it first.");

  if (input.primaryOwnerId !== undefined && input.primaryOwnerId !== null) {
    if (!before.assignees.some((a) => a.userId === input.primaryOwnerId)) {
      throw validation("The primary owner must be one of the assignees.");
    }
  }
  if (input.projectId) {
    const project = await prisma.project.findUnique({ where: { id: input.projectId } });
    if (!project) throw validation("That project does not exist.");
  }
  if (input.startDate !== undefined && input.startDate && before.dueAt && input.startDate > before.dueAt) {
    throw validation("The start date must be before the deadline.");
  }

  const data: Prisma.TaskUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.instruction !== undefined) data.instruction = input.instruction;
  if (input.priority !== undefined) data.priority = input.priority;
  if (input.completionRule !== undefined) data.completionRule = input.completionRule;
  if (input.progressMode !== undefined) data.progressMode = input.progressMode;
  if (input.updateCadence !== undefined) data.updateCadence = input.updateCadence;
  if (input.recurrence !== undefined) data.recurrence = input.recurrence;
  if (input.reviewRequired !== undefined) data.reviewRequired = input.reviewRequired;
  if (input.startDate !== undefined) data.startDate = input.startDate;
  if (input.estimateHours !== undefined) data.estimateHours = input.estimateHours;
  if (input.category !== undefined) data.category = input.category;
  if (input.projectId !== undefined) {
    data.project = input.projectId ? { connect: { id: input.projectId } } : { disconnect: true };
  }
  if (input.primaryOwnerId !== undefined) {
    data.primaryOwner = input.primaryOwnerId ? { connect: { id: input.primaryOwnerId } } : { disconnect: true };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const task = await tx.task.update({ where: { id: taskId }, data });

    if (input.primaryOwnerId !== undefined) {
      await tx.taskAssignee.updateMany({ where: { taskId }, data: { isPrimary: false } });
      if (input.primaryOwnerId) {
        await tx.taskAssignee.updateMany({ where: { taskId, userId: input.primaryOwnerId }, data: { isPrimary: true } });
      }
    }

    const changedFields = Object.keys(data);
    await recordActivity(
      {
        action: "TASK_UPDATED",
        summary: `${actor.name} updated ${task.code} (${changedFields.join(", ")})`,
        taskId,
        teamId: task.teamId,
        actorId: actor.id,
        meta: { fields: changedFields },
      },
      tx,
    );

    await recomputeRollup(taskId, tx);
    return task;
  });

  if (input.priority !== undefined && input.priority !== before.priority) {
    await notify({
      userIds: before.assignees.map((a) => a.userId),
      type: "TASK_ASSIGNED",
      title: `Priority changed to ${input.priority.toLowerCase()} on ${before.code}`,
      body: `${actor.name} changed the priority of "${before.title}".`,
      taskId,
      actorId: actor.id,
      href: `/tasks/${taskId}`,
    });
  }

  return updated;
}

/**
 * Change a deadline. The original deadline is preserved on the task, every
 * change is appended to the deadline history, and assignees are notified.
 */
export async function changeDeadline(
  actor: SessionUser,
  taskId: string,
  input: { dueAt: Date | null; reason: string | null },
) {
  await requireManageableTask(actor, taskId);
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, include: { assignees: true } });

  if (task.dueAt?.getTime() === input.dueAt?.getTime()) {
    throw validation("That is already the deadline.");
  }
  if (input.dueAt && task.startDate && input.dueAt < task.startDate) {
    throw validation("The deadline must be after the start date.");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.task.update({
      where: { id: taskId },
      data: {
        dueAt: input.dueAt,
        // The first deadline the task ever had is kept for reporting.
        originalDueAt: task.originalDueAt ?? task.dueAt ?? input.dueAt,
      },
    });
    await tx.deadlineChange.create({
      data: {
        taskId,
        fromDueAt: task.dueAt,
        toDueAt: input.dueAt,
        reason: input.reason,
        changedById: actor.id,
      },
    });
    await recordActivity(
      {
        action: "DEADLINE_CHANGED",
        summary: `${actor.name} moved the ${task.code} deadline to ${input.dueAt ? input.dueAt.toISOString().slice(0, 16).replace("T", " ") : "none"}`,
        taskId,
        teamId: task.teamId,
        actorId: actor.id,
        meta: { from: task.dueAt, to: input.dueAt, reason: input.reason },
      },
      tx,
    );
    return next;
  });

  await notify({
    userIds: [...task.assignees.map((a) => a.userId), task.createdById],
    type: "DEADLINE_CHANGED",
    title: `Deadline changed on ${task.code}`,
    body: input.reason
      ? `${actor.name}: ${input.reason}`
      : `${actor.name} changed the deadline for "${task.title}".`,
    taskId,
    actorId: actor.id,
    href: `/tasks/${taskId}`,
    email: { subject: `[${task.code}] Deadline changed`, text: `The deadline for "${task.title}" changed.` },
  });

  return updated;
}

export async function setAssignees(actor: SessionUser, taskId: string, input: SetAssigneesInput) {
  await requireManageableTask(actor, taskId);
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, include: { assignees: true } });
  if (task.status === "CANCELLED") throw conflict("A cancelled task cannot be reassigned.");

  const result = await prisma.$transaction(async (tx) => {
    const { assignees, primaryOwnerId } = await resolveAssignees(tx, {
      assignmentType: task.assignmentType as "INDIVIDUAL" | "MULTIPLE" | "TEAM",
      teamId: task.teamId,
      requiredIds: input.assigneeIds,
      optionalIds: input.optionalAssigneeIds,
      primaryOwnerId: input.primaryOwnerId,
    });
    if (assignees.length === 0) throw validation("A task needs at least one assignee.");

    const existing = new Map(task.assignees.map((a) => [a.userId, a]));
    const nextIds = new Set(assignees.map((a) => a.userId));

    const removed = task.assignees.filter((a) => !nextIds.has(a.userId));
    if (removed.length > 0) {
      await tx.taskAssignee.deleteMany({ where: { taskId, userId: { in: removed.map((a) => a.userId) } } });
    }

    const added: string[] = [];
    for (const assignee of assignees) {
      const current = existing.get(assignee.userId);
      if (current) {
        await tx.taskAssignee.update({
          where: { id: current.id },
          data: { isRequired: assignee.isRequired, isPrimary: assignee.isPrimary, viaTeam: assignee.viaTeam },
        });
      } else {
        await tx.taskAssignee.create({ data: { taskId, ...assignee } });
        added.push(assignee.userId);
      }
    }

    await tx.task.update({
      where: { id: taskId },
      data: {
        primaryOwnerId,
        ...(task.status === "DRAFT" ? {} : { assignedAt: task.assignedAt ?? new Date() }),
      },
    });

    if (added.length > 0) {
      await recordActivity(
        {
          action: "ASSIGNEE_ADDED",
          summary: `${actor.name} added ${added.length} ${added.length === 1 ? "person" : "people"} to ${task.code}`,
          taskId,
          teamId: task.teamId,
          actorId: actor.id,
          meta: { added },
        },
        tx,
      );
    }
    if (removed.length > 0) {
      await recordActivity(
        {
          action: "ASSIGNEE_REMOVED",
          summary: `${actor.name} removed ${removed.length} ${removed.length === 1 ? "person" : "people"} from ${task.code}`,
          taskId,
          teamId: task.teamId,
          actorId: actor.id,
          meta: { removed: removed.map((a) => a.userId) },
        },
        tx,
      );
    }

    await recomputeRollup(taskId, tx);
    return { added, removed: removed.map((a) => a.userId) };
  });

  if (result.added.length > 0 && task.status !== "DRAFT") {
    await notify({
      userIds: result.added,
      type: "TASK_ASSIGNED",
      title: `New task: ${task.title}`,
      body: `${actor.name} assigned you ${task.code}.`,
      taskId,
      actorId: actor.id,
      href: `/tasks/${taskId}`,
    });
  }

  return result;
}

/** Move a task to another team, keeping an audit record of the transfer. */
export async function transferTask(
  actor: SessionUser,
  taskId: string,
  input: { teamId: string; reason: string | null; keepAssignees: boolean },
) {
  await requireManageableTask(actor, taskId);
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, include: { assignees: true, team: true } });

  const target = await prisma.team.findUnique({
    where: { id: input.teamId },
    include: { memberships: { include: { user: { select: { id: true, status: true } } } } },
  });
  if (!target) throw notFound("That team does not exist.");
  if (target.archivedAt) throw validation("That team is archived.");
  if (target.id === task.teamId) throw validation("The task is already with that team.");
  if (!isOwner(actor) && !actor.ledTeamIds.includes(target.id)) {
    throw forbidden("You can only transfer tasks into a team you lead.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id: taskId }, data: { teamId: target.id } });

    if (!input.keepAssignees) {
      await tx.taskAssignee.deleteMany({ where: { taskId } });
      if (task.assignmentType === "TEAM") {
        const eligible = target.memberships.filter((m) => m.user.status === "ACTIVE");
        if (eligible.length === 0) throw validation("The receiving team has no active members.");
        await tx.taskAssignee.createMany({
          data: eligible.map((m) => ({ taskId, userId: m.userId, isRequired: true, viaTeam: true })),
        });
      }
      await tx.task.update({ where: { id: taskId }, data: { primaryOwnerId: null } });
    }

    await recordActivity(
      {
        action: "TASK_TRANSFERRED",
        summary: `${actor.name} transferred ${task.code} from ${task.team?.name ?? "no team"} to ${target.name}`,
        taskId,
        teamId: target.id,
        actorId: actor.id,
        meta: { from: task.teamId, to: target.id, reason: input.reason, keptAssignees: input.keepAssignees },
      },
      tx,
    );
    await recordAudit(
      {
        actorId: actor.id,
        action: "TASK_TRANSFERRED",
        entityType: "Task",
        entityId: taskId,
        before: { teamId: task.teamId },
        after: { teamId: target.id, reason: input.reason },
      },
      tx,
    );

    await recomputeRollup(taskId, tx);
  });

  return prisma.task.findUniqueOrThrow({ where: { id: taskId } });
}

export async function cancelTask(actor: SessionUser, taskId: string, note: string | null) {
  await requireManageableTask(actor, taskId);
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, include: { assignees: true } });
  if (task.status === "CANCELLED") throw conflict("That task is already cancelled.");
  if (task.status === "COMPLETED") throw conflict("A completed task cannot be cancelled.");

  await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id: taskId }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    await recordActivity(
      {
        action: "TASK_CANCELLED",
        summary: `${actor.name} cancelled ${task.code}${note ? `: ${note}` : ""}`,
        taskId,
        teamId: task.teamId,
        actorId: actor.id,
      },
      tx,
    );
    await recordAudit(
      { actorId: actor.id, action: "TASK_CANCELLED", entityType: "Task", entityId: taskId, before: { status: task.status } },
      tx,
    );
  });

  await notify({
    userIds: task.assignees.map((a) => a.userId),
    type: "TASK_CANCELLED",
    title: `${task.code} was cancelled`,
    body: note ?? `${actor.name} cancelled "${task.title}".`,
    taskId,
    actorId: actor.id,
    href: `/tasks/${taskId}`,
  });
}

export async function restoreTask(actor: SessionUser, taskId: string) {
  await requireManageableTask(actor, taskId);
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  if (task.status !== "CANCELLED") throw conflict("Only a cancelled task can be restored.");

  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: taskId },
      data: { status: task.assignedAt ? "ASSIGNED" : "DRAFT", cancelledAt: null },
    });
    await recordActivity(
      { action: "TASK_UPDATED", summary: `${actor.name} restored ${task.code}`, taskId, teamId: task.teamId, actorId: actor.id },
      tx,
    );
    await recomputeRollup(taskId, tx);
  });
}

export async function archiveTask(actor: SessionUser, taskId: string) {
  const scope = await loadTaskScope(taskId);
  if (!canManageTask(actor, scope)) throw forbidden("Only a team lead or the owner can archive a task.");
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  if (task.archivedAt) throw conflict("That task is already archived.");

  await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id: taskId }, data: { archivedAt: new Date() } });
    await recordActivity(
      { action: "TASK_ARCHIVED", summary: `${actor.name} archived ${task.code}`, taskId, teamId: task.teamId, actorId: actor.id },
      tx,
    );
    await recordAudit({ actorId: actor.id, action: "TASK_ARCHIVED", entityType: "Task", entityId: taskId }, tx);
  });
}

export async function unarchiveTask(actor: SessionUser, taskId: string) {
  const scope = await loadTaskScope(taskId);
  if (!canManageTask(actor, scope)) throw forbidden("Only a team lead or the owner can restore a task.");
  await prisma.task.update({ where: { id: taskId }, data: { archivedAt: null } });
}

/** Hard delete. Owner only, and audited before the rows disappear. */
export async function deleteTask(actor: SessionUser, taskId: string) {
  if (!isOwner(actor)) throw forbidden("Only the company owner can delete a task permanently.");
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, include: { assignees: true } });
  await recordAudit({
    actorId: actor.id,
    action: "TASK_DELETED",
    entityType: "Task",
    entityId: taskId,
    before: { code: task.code, title: task.title, status: task.status, assignees: task.assignees.map((a) => a.userId) },
  });
  await prisma.task.delete({ where: { id: taskId } });
}

// ---------------------------------------------------------------------------
// Assignee transitions
// ---------------------------------------------------------------------------

async function requireAssigneeRow(taskId: string, userId: string, db: TxClient = prisma) {
  const row = await db.taskAssignee.findUnique({ where: { taskId_userId: { taskId, userId } } });
  if (!row) throw forbidden("You are not assigned to this task.");
  return row;
}

export async function acknowledgeTask(actor: SessionUser, taskId: string) {
  const scope = await requireViewableTask(actor, taskId);
  if (!isAssignee(actor, scope)) throw forbidden("Only an assignee can acknowledge a task.");
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  if (task.status === "DRAFT") throw conflict("This task has not been assigned yet.");
  if (task.status === "CANCELLED") throw conflict("That task was cancelled.");

  const row = await requireAssigneeRow(taskId, actor.id);
  if (row.acknowledgedAt) throw conflict("You already acknowledged this task.");

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.taskAssignee.update({
      where: { id: row.id },
      data: { status: "ACKNOWLEDGED", acknowledgedAt: now, lastUpdateAt: now },
    });
    await recordActivity(
      {
        action: "TASK_ACKNOWLEDGED",
        summary: `${actor.name} acknowledged ${task.code}`,
        taskId,
        teamId: task.teamId,
        actorId: actor.id,
      },
      tx,
    );
    await recomputeRollup(taskId, tx);
  });

  await notify({
    userIds: [task.createdById, ...(task.primaryOwnerId ? [task.primaryOwnerId] : [])],
    type: "TASK_ACKNOWLEDGED",
    title: `${actor.name} acknowledged ${task.code}`,
    body: `"${task.title}" has been acknowledged.`,
    taskId,
    actorId: actor.id,
    href: `/tasks/${taskId}`,
  });
}

export async function startTask(actor: SessionUser, taskId: string) {
  const scope = await requireViewableTask(actor, taskId);
  if (!isAssignee(actor, scope)) throw forbidden("Only an assignee can start a task.");
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  if (task.status === "DRAFT") throw conflict("This task has not been assigned yet.");
  if (task.status === "CANCELLED" || task.status === "COMPLETED") throw conflict("That task is closed.");

  const row = await requireAssigneeRow(taskId, actor.id);
  if (row.status === "IN_PROGRESS") throw conflict("You already started this task.");

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.taskAssignee.update({
      where: { id: row.id },
      data: {
        status: "IN_PROGRESS",
        acknowledgedAt: row.acknowledgedAt ?? now,
        startedAt: row.startedAt ?? now,
        lastUpdateAt: now,
      },
    });
    await recordActivity(
      { action: "TASK_STARTED", summary: `${actor.name} started ${task.code}`, taskId, teamId: task.teamId, actorId: actor.id },
      tx,
    );
    await recomputeRollup(taskId, tx);
  });

  await notify({
    userIds: [task.createdById],
    type: "TASK_STARTED",
    title: `${actor.name} started ${task.code}`,
    body: `Work has begun on "${task.title}".`,
    taskId,
    actorId: actor.id,
    href: `/tasks/${taskId}`,
  });
}

// ---------------------------------------------------------------------------
// Subtasks
// ---------------------------------------------------------------------------

export async function addSubtask(actor: SessionUser, taskId: string, title: string) {
  const scope = await requireViewableTask(actor, taskId);
  if (!isAssignee(actor, scope) && !canManageTask(actor, scope)) {
    throw forbidden("Only an assignee or a team lead can change the checklist.");
  }
  const last = await prisma.subtask.findFirst({ where: { taskId }, orderBy: { position: "desc" } });
  const subtask = await prisma.subtask.create({
    data: { taskId, title, position: (last?.position ?? -1) + 1 },
  });
  await recomputeRollup(taskId);
  return subtask;
}

export async function toggleSubtask(actor: SessionUser, subtaskId: string, isDone: boolean) {
  const subtask = await prisma.subtask.findUnique({ where: { id: subtaskId }, include: { task: true } });
  if (!subtask) throw notFound("That checklist item does not exist.");
  const scope = await loadTaskScope(subtask.taskId);
  if (!canViewTask(actor, scope)) throw forbidden("You do not have access to this task.");
  if (!isAssignee(actor, scope) && !canManageTask(actor, scope)) {
    throw forbidden("Only an assignee or a team lead can tick off checklist items.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.subtask.update({
      where: { id: subtaskId },
      data: {
        isDone,
        completedById: isDone ? actor.id : null,
        completedAt: isDone ? new Date() : null,
      },
    });
    await recordActivity(
      {
        action: "SUBTASK_TOGGLED",
        summary: `${actor.name} ${isDone ? "completed" : "reopened"} “${subtask.title}” on ${subtask.task.code}`,
        taskId: subtask.taskId,
        teamId: subtask.task.teamId,
        actorId: actor.id,
      },
      tx,
    );
    await recomputeRollup(subtask.taskId, tx);
  });

  return prisma.subtask.findUniqueOrThrow({ where: { id: subtaskId } });
}

export async function deleteSubtask(actor: SessionUser, subtaskId: string) {
  const subtask = await prisma.subtask.findUnique({ where: { id: subtaskId } });
  if (!subtask) throw notFound("That checklist item does not exist.");
  const scope = await loadTaskScope(subtask.taskId);
  if (!canManageTask(actor, scope) && !isAssignee(actor, scope)) {
    throw forbidden("Only an assignee or a team lead can change the checklist.");
  }
  await prisma.subtask.delete({ where: { id: subtaskId } });
  await recomputeRollup(subtask.taskId);
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

export type TaskListItem = {
  id: string;
  code: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  progress: number;
  dueAt: Date | null;
  startDate: Date | null;
  updatedAt: Date;
  lastProgressAt: Date | null;
  reviewRequired: boolean;
  assignmentType: string;
  health: TaskHealth;
  commentCount: number;
  updateCount: number;
  openUpdateRequests: number;
  team: { id: string; name: string; color: string } | null;
  project: { id: string; name: string; color: string; key: string } | null;
  assignees: {
    userId: string;
    name: string;
    avatarColor: string;
    status: AssigneeStatus;
    progress: number;
    isPrimary: boolean;
    isRequired: boolean;
  }[];
  latestUpdate: { id: string; createdAt: Date; progress: number; authorName: string; excerpt: string | null } | null;
};

const SORT_FIELDS: Record<TaskFilter["sort"], keyof Prisma.TaskOrderByWithRelationInput> = {
  dueAt: "dueAt",
  priority: "priority",
  progress: "progress",
  updatedAt: "updatedAt",
  createdAt: "createdAt",
  title: "title",
  status: "status",
};

/** Build the Prisma filter for a list request (visibility included). */
export function buildTaskWhere(user: SessionUser, filter: TaskFilter): Prisma.TaskWhereInput {
  const and: Prisma.TaskWhereInput[] = [taskVisibilityFilter(user)];

  if (!filter.includeArchived) and.push({ archivedAt: null });
  if (filter.q) {
    and.push({
      OR: [
        // Postgres compares text case-sensitively; search should not.
        { title: { contains: filter.q, mode: "insensitive" } },
        { description: { contains: filter.q, mode: "insensitive" } },
        { code: { contains: filter.q.toUpperCase() } },
      ],
    });
  }
  if (filter.status.length > 0) and.push({ status: { in: filter.status } });
  if (filter.priority.length > 0) and.push({ priority: { in: filter.priority } });
  if (filter.teamId.length > 0) and.push({ teamId: { in: filter.teamId } });
  if (filter.projectId.length > 0) and.push({ projectId: { in: filter.projectId } });
  if (filter.assigneeId.length > 0) and.push({ assignees: { some: { userId: { in: filter.assigneeId } } } });
  if (filter.dueFrom) and.push({ dueAt: { gte: filter.dueFrom } });
  if (filter.dueTo) and.push({ dueAt: { lte: filter.dueTo } });

  switch (filter.scope) {
    case "ASSIGNED_TO_ME":
      and.push({ assignees: { some: { userId: user.id } } });
      break;
    case "CREATED_BY_ME":
      and.push({ createdById: user.id });
      break;
    case "MY_TEAMS":
      and.push({ teamId: { in: user.teams.map((t) => t.teamId) } });
      break;
    case "NEEDS_MY_ACTION":
      and.push({
        OR: [
          {
            assignees: { some: { userId: user.id, status: { in: ["ASSIGNED", "CHANGES_REQUESTED", "BLOCKED"] } } },
          },
          { updateRequests: { some: { requestedOfId: user.id, respondedAt: null } } },
          ...(user.role === "OWNER" || user.role === "MANAGER"
            ? [{ status: "SUBMITTED_FOR_REVIEW" as const, NOT: { reviews: { some: { decision: "PENDING", submittedById: user.id } } } }]
            : []),
        ],
      });
      break;
    case "AWAITING_REVIEW":
      and.push({ status: "SUBMITTED_FOR_REVIEW" });
      break;
    default:
      break;
  }

  return { AND: and };
}

const LIST_INCLUDE = {
  team: { select: { id: true, name: true, color: true } },
  project: { select: { id: true, name: true, color: true, key: true } },
  assignees: {
    include: { user: { select: { id: true, name: true, avatarColor: true } } },
    orderBy: [{ isPrimary: "desc" as const }, { createdAt: "asc" as const }],
  },
  _count: { select: { comments: true, progressUpdates: true } },
  updateRequests: { where: { respondedAt: null }, select: { id: true } },
  progressUpdates: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    include: { user: { select: { name: true } } },
  },
} satisfies Prisma.TaskInclude;

type TaskRow = Prisma.TaskGetPayload<{ include: typeof LIST_INCLUDE }>;

function toListItem(row: TaskRow, now: Date): TaskListItem {
  const latest = row.progressUpdates[0];
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    progress: row.progress,
    dueAt: row.dueAt,
    startDate: row.startDate,
    updatedAt: row.updatedAt,
    lastProgressAt: row.lastProgressAt,
    reviewRequired: row.reviewRequired,
    assignmentType: row.assignmentType,
    health: taskHealth(
      { status: row.status as TaskStatus, progress: row.progress, startDate: row.startDate, dueAt: row.dueAt },
      now,
    ),
    commentCount: row._count.comments,
    updateCount: row._count.progressUpdates,
    openUpdateRequests: row.updateRequests.length,
    team: row.team,
    project: row.project,
    assignees: row.assignees.map((a) => ({
      userId: a.userId,
      name: a.user.name,
      avatarColor: a.user.avatarColor,
      status: a.status as AssigneeStatus,
      progress: a.progress,
      isPrimary: a.isPrimary,
      isRequired: a.isRequired,
    })),
    latestUpdate: latest
      ? {
          id: latest.id,
          createdAt: latest.createdAt,
          progress: latest.progress,
          authorName: latest.user.name,
          excerpt: latest.workCompleted ?? latest.blockers ?? latest.workRemaining ?? null,
        }
      : null,
  };
}

/**
 * Paginated task list.
 *
 * Filtering, sorting and pagination all happen on the server. Health is a
 * derived value, so when it is used as a filter the matching ids are resolved
 * first and the page is then taken from that set — the counts stay accurate.
 */
export async function listTasks(
  user: SessionUser,
  filter: TaskFilter,
  now = new Date(),
): Promise<{ items: TaskListItem[]; total: number; page: number; pageSize: number; pageCount: number }> {
  const where = buildTaskWhere(user, filter);
  const orderBy: Prisma.TaskOrderByWithRelationInput[] =
    filter.sort === "dueAt"
      ? [
          // Open work first: a finished task's deadline is history, and burying
          // live work underneath it is the opposite of useful. Within each
          // group the deadline decides, and tasks with no deadline sort last.
          { completedAt: { sort: "asc", nulls: "first" } },
          { cancelledAt: { sort: "asc", nulls: "first" } },
          { dueAt: { sort: filter.dir, nulls: "last" } },
          { priority: "desc" },
        ]
      : [{ [SORT_FIELDS[filter.sort]]: filter.dir }, { dueAt: { sort: "asc", nulls: "last" } }];

  const skip = (filter.page - 1) * filter.pageSize;

  if (filter.health.length === 0) {
    const [rows, total] = await Promise.all([
      prisma.task.findMany({ where, include: LIST_INCLUDE, orderBy, skip, take: filter.pageSize }),
      prisma.task.count({ where }),
    ]);
    return {
      items: rows.map((row) => toListItem(row, now)),
      total,
      page: filter.page,
      pageSize: filter.pageSize,
      pageCount: Math.max(1, Math.ceil(total / filter.pageSize)),
    };
  }

  const candidates = await prisma.task.findMany({
    where,
    select: { id: true, status: true, progress: true, startDate: true, dueAt: true },
    orderBy,
  });
  const wanted = new Set(filter.health);
  const matching = candidates.filter((task) =>
    wanted.has(
      taskHealth(
        { status: task.status as TaskStatus, progress: task.progress, startDate: task.startDate, dueAt: task.dueAt },
        now,
      ),
    ),
  );
  const pageIds = matching.slice(skip, skip + filter.pageSize).map((t) => t.id);
  const rows =
    pageIds.length === 0
      ? []
      : await prisma.task.findMany({ where: { id: { in: pageIds } }, include: LIST_INCLUDE, orderBy });

  return {
    items: rows.map((row) => toListItem(row, now)),
    total: matching.length,
    page: filter.page,
    pageSize: filter.pageSize,
    pageCount: Math.max(1, Math.ceil(matching.length / filter.pageSize)),
  };
}

/** Lightweight list used by dashboards and the calendar. */
export async function listTasksRaw(user: SessionUser, where: Prisma.TaskWhereInput, take = 500) {
  return prisma.task.findMany({
    where: { AND: [taskVisibilityFilter(user), { archivedAt: null }, where] },
    include: LIST_INCLUDE,
    orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }],
    take,
  });
}

export function mapListItems(rows: TaskRow[], now = new Date()): TaskListItem[] {
  return rows.map((row) => toListItem(row, now));
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

export async function getTaskDetail(user: SessionUser, taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      team: { select: { id: true, name: true, color: true } },
      project: { select: { id: true, name: true, key: true, color: true } },
      createdBy: { select: { id: true, name: true, avatarColor: true, jobTitle: true } },
      primaryOwner: { select: { id: true, name: true, avatarColor: true } },
      assignees: {
        include: { user: { select: { id: true, name: true, avatarColor: true, jobTitle: true, email: true } } },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      },
      subtasks: { orderBy: { position: "asc" }, include: { completedBy: { select: { id: true, name: true } } } },
      progressUpdates: {
        orderBy: { createdAt: "desc" },
        include: { user: { select: { id: true, name: true, avatarColor: true } } },
      },
      comments: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true, avatarColor: true } } },
      },
      attachments: {
        orderBy: { createdAt: "desc" },
        include: { uploader: { select: { id: true, name: true } } },
      },
      reviews: {
        orderBy: { round: "desc" },
        include: {
          submittedBy: { select: { id: true, name: true, avatarColor: true } },
          decidedBy: { select: { id: true, name: true, avatarColor: true } },
        },
      },
      updateRequests: {
        orderBy: { createdAt: "desc" },
        include: {
          requestedBy: { select: { id: true, name: true } },
          requestedOf: { select: { id: true, name: true } },
        },
      },
      extensions: {
        orderBy: { createdAt: "desc" },
        include: {
          requestedBy: { select: { id: true, name: true } },
          decidedBy: { select: { id: true, name: true } },
        },
      },
      deadlineChanges: {
        orderBy: { createdAt: "desc" },
        include: { changedBy: { select: { id: true, name: true } } },
      },
      activity: {
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { actor: { select: { id: true, name: true, avatarColor: true } } },
      },
    },
  });
  if (!task) throw notFound("That task does not exist.");

  const scope: TaskScope = {
    id: task.id,
    teamId: task.teamId,
    createdById: task.createdById,
    primaryOwnerId: task.primaryOwnerId,
    reviewRequired: task.reviewRequired,
    assigneeIds: task.assignees.map((a) => a.userId),
  };
  assertCanViewTask(user, scope);

  return { task, scope };
}

export type TaskDetail = Awaited<ReturnType<typeof getTaskDetail>>["task"];

// ---------------------------------------------------------------------------
// Shared helpers for dashboards and reports
// ---------------------------------------------------------------------------

export const ACTIVE_STATUS_FILTER: Prisma.TaskWhereInput = { status: { in: ACTIVE_TASK_STATUSES } };

export function priorityWeight(priority: string): number {
  return TASK_PRIORITY_WEIGHT[priority as TaskPriority] ?? 2;
}
