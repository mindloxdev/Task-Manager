/**
 * Progress reporting: updates, blockers, and manager-requested check-ins.
 *
 * Progress is never invented. In MANUAL mode the figure is the one the
 * assignee reported; in CHECKLIST mode it is counted from ticked subtasks and
 * the submitted number is ignored.
 */
import { z } from "zod";

import { prisma } from "@/server/db";
import type { SessionUser } from "@/server/auth";
import { conflict, forbidden, notFound, validation } from "@/server/errors";
import { canManageTask, canRequestUpdate, isAssignee } from "@/server/permissions";
import { recordActivity } from "@/server/services/activity";
import { notify } from "@/server/services/notifications";
import { loadTaskScope, recomputeRollup, requireViewableTask } from "@/server/services/tasks";
import { ratioPct } from "@/lib/utils";
import type { blockerSchema, progressUpdateSchema, requestUpdateSchema } from "@/lib/validation";
import type { AssigneeStatus } from "@/lib/enums";

export type ProgressUpdateInput = z.infer<typeof progressUpdateSchema>;
export type BlockerInput = z.infer<typeof blockerSchema>;
export type RequestUpdateInput = z.infer<typeof requestUpdateSchema>;

/** Everyone who should hear about movement on a task. */
async function watchers(taskId: string): Promise<string[]> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      createdById: true,
      primaryOwnerId: true,
      teamId: true,
      team: { select: { memberships: { where: { role: "LEAD" }, select: { userId: true } } } },
    },
  });
  if (!task) return [];
  return [
    task.createdById,
    ...(task.primaryOwnerId ? [task.primaryOwnerId] : []),
    ...(task.team?.memberships.map((m) => m.userId) ?? []),
  ];
}

async function checklistProgress(taskId: string): Promise<number | null> {
  const subtasks = await prisma.subtask.findMany({ where: { taskId }, select: { isDone: true } });
  if (subtasks.length === 0) return null;
  return ratioPct(subtasks.filter((s) => s.isDone).length, subtasks.length);
}

export async function postProgressUpdate(actor: SessionUser, taskId: string, input: ProgressUpdateInput) {
  const scope = await requireViewableTask(actor, taskId);
  if (!isAssignee(actor, scope)) throw forbidden("Only an assignee can report progress on this task.");

  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  if (task.status === "DRAFT") throw conflict("This task has not been assigned yet.");
  if (task.status === "CANCELLED") throw conflict("That task was cancelled.");
  if (task.status === "COMPLETED") throw conflict("That task is already complete.");

  const row = await prisma.taskAssignee.findUnique({ where: { taskId_userId: { taskId, userId: actor.id } } });
  if (!row) throw forbidden("You are not assigned to this task.");

  // In checklist mode the percentage comes from the checklist, not the form.
  const fromChecklist = task.progressMode === "CHECKLIST" ? await checklistProgress(taskId) : null;
  const progress = fromChecklist ?? input.progress;

  let updateRequestId: string | null = null;
  if (input.updateRequestId) {
    const request = await prisma.updateRequest.findUnique({ where: { id: input.updateRequestId } });
    if (!request || request.taskId !== taskId) throw notFound("That update request does not exist.");
    if (request.requestedOfId !== actor.id) throw forbidden("That update was requested from someone else.");
    if (request.respondedAt) throw conflict("You already answered that update request.");
    updateRequestId = request.id;
  }

  const now = new Date();
  const reportedBlocker = Boolean(input.blockers);

  const nextAssigneeStatus: AssigneeStatus = reportedBlocker
    ? "BLOCKED"
    : row.status === "ASSIGNED" || row.status === "ACKNOWLEDGED" || row.status === "BLOCKED"
      ? "IN_PROGRESS"
      : (row.status as AssigneeStatus);

  const update = await prisma.$transaction(async (tx) => {
    const created = await tx.progressUpdate.create({
      data: {
        taskId,
        userId: actor.id,
        kind: updateRequestId ? "RESPONSE" : reportedBlocker ? "BLOCKER" : "UPDATE",
        progress,
        workCompleted: input.workCompleted,
        workRemaining: input.workRemaining,
        blockers: input.blockers,
        helpNeeded: input.helpNeeded,
        expectedCompletion: input.expectedCompletion,
        linkUrl: input.linkUrl,
        updateRequestId,
      },
    });

    await tx.taskAssignee.update({
      where: { id: row.id },
      data: {
        progress,
        status: nextAssigneeStatus,
        acknowledgedAt: row.acknowledgedAt ?? now,
        startedAt: row.startedAt ?? now,
        lastUpdateAt: now,
      },
    });

    if (updateRequestId) {
      await tx.updateRequest.update({ where: { id: updateRequestId }, data: { respondedAt: now } });
    }

    await tx.task.update({ where: { id: taskId }, data: { lastProgressAt: now } });

    await recordActivity(
      {
        action: reportedBlocker ? "BLOCKER_REPORTED" : updateRequestId ? "UPDATE_PROVIDED" : "PROGRESS_UPDATED",
        summary: reportedBlocker
          ? `${actor.name} reported a blocker on ${task.code}`
          : `${actor.name} reported ${progress}% on ${task.code}`,
        taskId,
        teamId: task.teamId,
        actorId: actor.id,
        meta: { progress, blocker: reportedBlocker },
      },
      tx,
    );

    await recomputeRollup(taskId, tx);
    return created;
  });

  const recipients = await watchers(taskId);
  await notify({
    userIds: recipients,
    type: reportedBlocker ? "BLOCKER_REPORTED" : updateRequestId ? "UPDATE_PROVIDED" : "PROGRESS_UPDATED",
    title: reportedBlocker
      ? `Blocker on ${task.code}: ${task.title}`
      : `${actor.name} reported ${progress}% on ${task.code}`,
    body: reportedBlocker ? input.blockers : (input.workCompleted ?? `Progress is now ${progress}%.`),
    taskId,
    actorId: actor.id,
    href: `/tasks/${taskId}`,
    email: reportedBlocker
      ? { subject: `[${task.code}] Blocker reported`, text: `${actor.name} reported a blocker: ${input.blockers}` }
      : null,
  });

  return update;
}

export async function reportBlocker(actor: SessionUser, taskId: string, input: BlockerInput) {
  const scope = await requireViewableTask(actor, taskId);
  if (!isAssignee(actor, scope)) throw forbidden("Only an assignee can report a blocker.");

  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  if (task.status === "CANCELLED" || task.status === "COMPLETED") throw conflict("That task is closed.");

  const row = await prisma.taskAssignee.findUnique({ where: { taskId_userId: { taskId, userId: actor.id } } });
  if (!row) throw forbidden("You are not assigned to this task.");

  const now = new Date();
  const progress = input.progress ?? row.progress;

  await prisma.$transaction(async (tx) => {
    await tx.progressUpdate.create({
      data: {
        taskId,
        userId: actor.id,
        kind: "BLOCKER",
        progress,
        blockers: input.reason,
        helpNeeded: input.helpNeeded,
      },
    });
    await tx.taskAssignee.update({
      where: { id: row.id },
      data: { status: "BLOCKED", progress, lastUpdateAt: now, acknowledgedAt: row.acknowledgedAt ?? now },
    });
    await tx.task.update({ where: { id: taskId }, data: { lastProgressAt: now, blockedAt: now } });
    await recordActivity(
      {
        action: "BLOCKER_REPORTED",
        summary: `${actor.name} is blocked on ${task.code}: ${input.reason.slice(0, 120)}`,
        taskId,
        teamId: task.teamId,
        actorId: actor.id,
      },
      tx,
    );
    await recomputeRollup(taskId, tx);
  });

  await notify({
    userIds: await watchers(taskId),
    type: "BLOCKER_REPORTED",
    title: `Blocker on ${task.code}: ${task.title}`,
    body: input.reason,
    taskId,
    actorId: actor.id,
    href: `/tasks/${taskId}`,
    email: { subject: `[${task.code}] Blocker reported`, text: `${actor.name} is blocked: ${input.reason}` },
  });
}

export async function clearBlocker(actor: SessionUser, taskId: string, note: string | null) {
  const scope = await requireViewableTask(actor, taskId);
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  const row = await prisma.taskAssignee.findUnique({ where: { taskId_userId: { taskId, userId: actor.id } } });

  // Either the blocked assignee clears their own blocker, or a manager resolves it.
  if (!row && !canManageTask(actor, scope)) throw forbidden("You are not assigned to this task.");
  if (row && row.status !== "BLOCKED") throw conflict("You are not currently blocked on this task.");

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    if (row) {
      await tx.progressUpdate.create({
        data: { taskId, userId: actor.id, kind: "UNBLOCKED", progress: row.progress, workCompleted: note },
      });
      await tx.taskAssignee.update({
        where: { id: row.id },
        data: { status: "IN_PROGRESS", lastUpdateAt: now, startedAt: row.startedAt ?? now },
      });
    } else {
      await tx.taskAssignee.updateMany({ where: { taskId, status: "BLOCKED" }, data: { status: "IN_PROGRESS" } });
    }
    await tx.task.update({ where: { id: taskId }, data: { lastProgressAt: now, blockedAt: null } });
    await recordActivity(
      {
        action: "BLOCKER_CLEARED",
        summary: `${actor.name} cleared the blocker on ${task.code}`,
        taskId,
        teamId: task.teamId,
        actorId: actor.id,
      },
      tx,
    );
    await recomputeRollup(taskId, tx);
  });

  await notify({
    userIds: await watchers(taskId),
    type: "PROGRESS_UPDATED",
    title: `Blocker cleared on ${task.code}`,
    body: note ?? `${actor.name} is working on "${task.title}" again.`,
    taskId,
    actorId: actor.id,
    href: `/tasks/${taskId}`,
  });
}

/** A manager asks named assignees for an update, and the reply is tracked. */
export async function requestUpdates(actor: SessionUser, taskId: string, input: RequestUpdateInput) {
  const scope = await loadTaskScope(taskId);
  if (!canRequestUpdate(actor, scope)) throw forbidden("Only a team lead or the owner can request an update.");

  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  const targets = input.userIds.filter((id) => scope.assigneeIds.includes(id));
  if (targets.length === 0) throw validation("Choose people who are assigned to this task.");

  const created: string[] = [];
  await prisma.$transaction(async (tx) => {
    for (const userId of targets) {
      const open = await tx.updateRequest.findFirst({ where: { taskId, requestedOfId: userId, respondedAt: null } });
      // One open request per person: asking again does not pile up reminders.
      if (open) continue;
      const request = await tx.updateRequest.create({
        data: { taskId, requestedById: actor.id, requestedOfId: userId, message: input.message, dueAt: input.dueAt },
      });
      created.push(request.id);
    }
    if (created.length > 0) {
      await recordActivity(
        {
          action: "UPDATE_REQUESTED",
          summary: `${actor.name} requested an update on ${task.code} from ${created.length} ${created.length === 1 ? "person" : "people"}`,
          taskId,
          teamId: task.teamId,
          actorId: actor.id,
        },
        tx,
      );
    }
  });

  if (created.length === 0) throw conflict("Those people already have an open update request on this task.");

  await notify({
    userIds: targets,
    type: "UPDATE_REQUESTED",
    title: `Update requested on ${task.code}`,
    body: input.message ?? `${actor.name} asked for a progress update on "${task.title}".`,
    taskId,
    actorId: actor.id,
    href: `/tasks/${taskId}`,
    email: { subject: `[${task.code}] Update requested`, text: `${actor.name} asked for a progress update.` },
  });

  return created.length;
}

/** Open update requests addressed to a person, newest first. */
export async function listOpenUpdateRequests(userId: string) {
  return prisma.updateRequest.findMany({
    where: { requestedOfId: userId, respondedAt: null },
    include: {
      task: { select: { id: true, code: true, title: true, dueAt: true, status: true } },
      requestedBy: { select: { id: true, name: true, avatarColor: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** Per-task progress timeline, oldest first — the chronological history. */
export async function getProgressTimeline(actor: SessionUser, taskId: string) {
  await requireViewableTask(actor, taskId);
  return prisma.progressUpdate.findMany({
    where: { taskId },
    include: { user: { select: { id: true, name: true, avatarColor: true } } },
    orderBy: { createdAt: "asc" },
  });
}
