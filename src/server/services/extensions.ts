/**
 * Deadline extension requests.
 *
 * An assignee asks for more time; a manager approves or rejects. Approving
 * moves the deadline through the same `changeDeadline` path as a manual edit,
 * so the deadline history and notifications stay consistent.
 */
import { z } from "zod";

import { prisma } from "@/server/db";
import type { SessionUser } from "@/server/auth";
import { conflict, forbidden, notFound, validation } from "@/server/errors";
import { canManageTask, isAssignee } from "@/server/permissions";
import { recordActivity } from "@/server/services/activity";
import { notify } from "@/server/services/notifications";
import { changeDeadline, loadTaskScope, requireViewableTask } from "@/server/services/tasks";
import type { extensionDecisionSchema, extensionRequestSchema } from "@/lib/validation";

export type ExtensionRequestInput = z.infer<typeof extensionRequestSchema>;
export type ExtensionDecisionInput = z.infer<typeof extensionDecisionSchema>;

export async function requestExtension(actor: SessionUser, taskId: string, input: ExtensionRequestInput) {
  const scope = await requireViewableTask(actor, taskId);
  if (!isAssignee(actor, scope)) throw forbidden("Only an assignee can ask for more time on this task.");

  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  if (task.status === "COMPLETED" || task.status === "CANCELLED") throw conflict("That task is closed.");
  if (task.dueAt && input.requestedDueAt <= task.dueAt) {
    throw validation("Ask for a date later than the current deadline.");
  }

  const open = await prisma.extensionRequest.findFirst({ where: { taskId, requestedById: actor.id, status: "PENDING" } });
  if (open) throw conflict("You already have an extension request pending on this task.");

  const request = await prisma.$transaction(async (tx) => {
    const created = await tx.extensionRequest.create({
      data: {
        taskId,
        requestedById: actor.id,
        currentDueAt: task.dueAt,
        requestedDueAt: input.requestedDueAt,
        reason: input.reason,
      },
    });
    await recordActivity(
      {
        action: "EXTENSION_REQUESTED",
        summary: `${actor.name} asked to move the ${task.code} deadline to ${input.requestedDueAt.toISOString().slice(0, 10)}`,
        taskId,
        teamId: task.teamId,
        actorId: actor.id,
        meta: { reason: input.reason },
      },
      tx,
    );
    return created;
  });

  const leads = await prisma.teamMembership.findMany({
    where: { teamId: task.teamId ?? "", role: "LEAD" },
    select: { userId: true },
  });

  await notify({
    userIds: [task.createdById, ...leads.map((l) => l.userId)],
    type: "EXTENSION_REQUESTED",
    title: `Extension requested on ${task.code}`,
    body: `${actor.name}: ${input.reason}`,
    taskId,
    actorId: actor.id,
    href: `/tasks/${taskId}`,
    email: { subject: `[${task.code}] Extension requested`, text: `${actor.name} asked for more time: ${input.reason}` },
  });

  return request;
}

export async function decideExtension(actor: SessionUser, requestId: string, input: ExtensionDecisionInput) {
  const request = await prisma.extensionRequest.findUnique({
    where: { id: requestId },
    include: { task: true, requestedBy: { select: { id: true, name: true } } },
  });
  if (!request) throw notFound("That extension request does not exist.");
  if (request.status !== "PENDING") throw conflict("That request has already been decided.");

  const scope = await loadTaskScope(request.taskId);
  if (!canManageTask(actor, scope)) throw forbidden("Only a team lead or the owner can decide an extension.");
  if (request.requestedById === actor.id) throw forbidden("You cannot approve your own extension request.");

  const approved = input.decision === "APPROVED";

  await prisma.extensionRequest.update({
    where: { id: requestId },
    data: {
      status: input.decision,
      decidedById: actor.id,
      decidedAt: new Date(),
      decisionNote: input.note,
    },
  });

  await recordActivity({
    action: "EXTENSION_DECIDED",
    summary: `${actor.name} ${approved ? "approved" : "rejected"} the extension on ${request.task.code}`,
    taskId: request.taskId,
    teamId: request.task.teamId,
    actorId: actor.id,
    meta: { decision: input.decision, note: input.note },
  });

  if (approved) {
    // Route through the normal deadline change so history and notices match.
    await changeDeadline(actor, request.taskId, {
      dueAt: request.requestedDueAt,
      reason: input.note ?? `Extension approved for ${request.requestedBy.name}`,
    });
  }

  await notify({
    userIds: [request.requestedById],
    type: "EXTENSION_DECIDED",
    title: `Extension ${approved ? "approved" : "rejected"} on ${request.task.code}`,
    body: input.note ?? (approved ? "Your new deadline is in place." : "The deadline stays as it is."),
    taskId: request.taskId,
    actorId: actor.id,
    href: `/tasks/${request.taskId}`,
    email: {
      subject: `[${request.task.code}] Extension ${approved ? "approved" : "rejected"}`,
      text: input.note ?? (approved ? "Your extension was approved." : "Your extension was rejected."),
    },
  });

  return prisma.extensionRequest.findUniqueOrThrow({ where: { id: requestId } });
}

/** Pending extension requests the actor is able to decide. */
export async function listPendingExtensions(user: SessionUser) {
  const requests = await prisma.extensionRequest.findMany({
    where: { status: "PENDING", task: { archivedAt: null } },
    include: {
      requestedBy: { select: { id: true, name: true, avatarColor: true } },
      task: {
        select: {
          id: true,
          code: true,
          title: true,
          dueAt: true,
          teamId: true,
          createdById: true,
          primaryOwnerId: true,
          reviewRequired: true,
          assignees: { select: { userId: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return requests.filter(
    (request) =>
      canManageTask(user, {
        id: request.task.id,
        teamId: request.task.teamId,
        createdById: request.task.createdById,
        primaryOwnerId: request.task.primaryOwnerId,
        reviewRequired: request.task.reviewRequired,
        assigneeIds: request.task.assignees.map((a) => a.userId),
      }) && request.requestedById !== user.id,
  );
}
