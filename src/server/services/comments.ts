/** Task discussion: comments and threaded replies. */
import { prisma } from "@/server/db";
import type { SessionUser } from "@/server/auth";
import { forbidden, notFound, validation } from "@/server/errors";
import { canComment, canManageTask, isOwner } from "@/server/permissions";
import { recordActivity } from "@/server/services/activity";
import { notify } from "@/server/services/notifications";
import { loadTaskScope, requireViewableTask } from "@/server/services/tasks";
import { truncate } from "@/lib/utils";

export async function addComment(
  actor: SessionUser,
  taskId: string,
  input: { body: string; parentId: string | null },
) {
  const scope = await requireViewableTask(actor, taskId);
  if (!canComment(actor, scope)) throw forbidden("You cannot comment on this task.");

  if (input.parentId) {
    const parent = await prisma.comment.findUnique({ where: { id: input.parentId } });
    if (!parent || parent.taskId !== taskId) throw notFound("That comment does not exist.");
    // One level of nesting keeps threads readable.
    if (parent.parentId) throw validation("Reply to the top comment of the thread instead.");
  }

  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { code: true, title: true, teamId: true, createdById: true, primaryOwnerId: true },
  });

  const comment = await prisma.$transaction(async (tx) => {
    const created = await tx.comment.create({
      data: { taskId, authorId: actor.id, body: input.body, parentId: input.parentId },
      include: { author: { select: { id: true, name: true, avatarColor: true } } },
    });
    await recordActivity(
      {
        action: "COMMENT_ADDED",
        summary: `${actor.name} commented on ${task.code}: ${truncate(input.body, 120)}`,
        taskId,
        teamId: task.teamId,
        actorId: actor.id,
      },
      tx,
    );
    return created;
  });

  // Everyone already in the conversation, plus the people accountable for it.
  const participants = await prisma.comment.findMany({
    where: { taskId },
    select: { authorId: true },
    distinct: ["authorId"],
  });

  await notify({
    userIds: [
      ...scope.assigneeIds,
      task.createdById,
      ...(task.primaryOwnerId ? [task.primaryOwnerId] : []),
      ...participants.map((p) => p.authorId),
    ],
    type: "COMMENT_ADDED",
    title: `${actor.name} commented on ${task.code}`,
    body: truncate(input.body, 200),
    taskId,
    actorId: actor.id,
    href: `/tasks/${taskId}`,
  });

  return comment;
}

export async function editComment(actor: SessionUser, commentId: string, body: string) {
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) throw notFound("That comment does not exist.");
  if (comment.authorId !== actor.id) throw forbidden("You can only edit your own comments.");
  return prisma.comment.update({
    where: { id: commentId },
    data: { body, editedAt: new Date() },
    include: { author: { select: { id: true, name: true, avatarColor: true } } },
  });
}

export async function deleteComment(actor: SessionUser, commentId: string) {
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) throw notFound("That comment does not exist.");
  const scope = await loadTaskScope(comment.taskId);
  const allowed = comment.authorId === actor.id || isOwner(actor) || canManageTask(actor, scope);
  if (!allowed) throw forbidden("You cannot delete that comment.");
  await prisma.comment.delete({ where: { id: commentId } });
}

export async function listComments(actor: SessionUser, taskId: string) {
  await requireViewableTask(actor, taskId);
  return prisma.comment.findMany({
    where: { taskId },
    include: { author: { select: { id: true, name: true, avatarColor: true } } },
    orderBy: { createdAt: "asc" },
  });
}
