/**
 * Submission and review.
 *
 * An assignee submits their own work with a completion summary. Once the
 * task's completion rule is satisfied, a review round opens and the task moves
 * to "Submitted for review" — or straight to "Completed" when the task does not
 * require review. A reviewer may then approve or send it back with feedback.
 *
 * Nobody approves their own submission: `canReviewTask` rejects the submitter
 * even when they would otherwise have review authority.
 */
import { z } from "zod";

import { prisma, type TxClient } from "@/server/db";
import type { SessionUser } from "@/server/auth";
import { conflict, forbidden, notFound } from "@/server/errors";
import { canReviewTask, isAssignee } from "@/server/permissions";
import { recordActivity } from "@/server/services/activity";
import { notify } from "@/server/services/notifications";
import { loadTaskScope, recomputeRollup, requireViewableTask } from "@/server/services/tasks";
import { isCompletionRuleSatisfied } from "@/lib/task-health";
import type { AssigneeStatus, CompletionRule } from "@/lib/enums";
import type { reviewDecisionSchema, submitForReviewSchema } from "@/lib/validation";

export type SubmitInput = z.infer<typeof submitForReviewSchema>;
export type ReviewInput = z.infer<typeof reviewDecisionSchema>;

/** People who can act on a pending review for this task. */
async function reviewerIds(taskId: string, excludeUserId: string): Promise<string[]> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      createdById: true,
      teamId: true,
      team: { select: { memberships: { where: { role: "LEAD" }, select: { userId: true } } } },
    },
  });
  if (!task) return [];
  const owners = await prisma.user.findMany({ where: { role: "OWNER", status: "ACTIVE" }, select: { id: true } });
  const ids = [task.createdById, ...(task.team?.memberships.map((m) => m.userId) ?? []), ...owners.map((o) => o.id)];
  return Array.from(new Set(ids)).filter((id) => id !== excludeUserId);
}

export async function submitForReview(actor: SessionUser, taskId: string, input: SubmitInput) {
  const scope = await requireViewableTask(actor, taskId);
  if (!isAssignee(actor, scope)) throw forbidden("Only an assignee can submit this task.");

  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, include: { assignees: true } });
  if (task.status === "DRAFT") throw conflict("This task has not been assigned yet.");
  if (task.status === "CANCELLED") throw conflict("That task was cancelled.");
  if (task.status === "COMPLETED") throw conflict("That task is already complete.");

  const row = task.assignees.find((a) => a.userId === actor.id);
  if (!row) throw forbidden("You are not assigned to this task.");
  if (row.status === "SUBMITTED") throw conflict("You already submitted your part of this task.");

  const now = new Date();

  const outcome = await prisma.$transaction(async (tx) => {
    await tx.taskAssignee.update({
      where: { id: row.id },
      data: {
        status: "SUBMITTED",
        progress: task.progressMode === "CHECKLIST" ? row.progress : 100,
        submittedAt: now,
        lastUpdateAt: now,
        acknowledgedAt: row.acknowledgedAt ?? now,
        startedAt: row.startedAt ?? now,
      },
    });

    await tx.progressUpdate.create({
      data: {
        taskId,
        userId: actor.id,
        kind: "SUBMISSION",
        progress: task.progressMode === "CHECKLIST" ? row.progress : 100,
        workCompleted: input.summary,
        linkUrl: input.linkUrl,
      },
    });

    if (input.linkUrl) {
      await tx.attachment.create({
        data: {
          taskId,
          uploaderId: actor.id,
          kind: "LINK",
          filename: "Deliverable",
          label: "Submitted deliverable",
          url: input.linkUrl,
        },
      });
    }

    await tx.task.update({ where: { id: taskId }, data: { lastProgressAt: now } });

    // Has the completion rule now been met by everyone it depends on?
    const assignees = await tx.taskAssignee.findMany({ where: { taskId } });
    const ruleMet = isCompletionRuleSatisfied(
      task.completionRule as CompletionRule,
      assignees.map((a) => ({
        isRequired: a.isRequired,
        isPrimary: a.isPrimary,
        status: a.status as AssigneeStatus,
        progress: a.progress,
      })),
      (status) => status === "SUBMITTED" || status === "COMPLETED",
    );

    let openedReview: { id: string; round: number } | null = null;

    if (ruleMet && task.reviewRequired) {
      const lastRound = await tx.taskReview.findFirst({ where: { taskId }, orderBy: { round: "desc" } });
      const round = (lastRound?.round ?? 0) + 1;
      const review = await tx.taskReview.create({
        data: { taskId, round, submittedById: actor.id, summary: input.summary, decision: "PENDING", submittedAt: now },
      });
      openedReview = { id: review.id, round };
      await tx.task.update({ where: { id: taskId }, data: { submittedAt: now } });
    }

    if (ruleMet && !task.reviewRequired) {
      await tx.taskAssignee.updateMany({
        where: { taskId, status: "SUBMITTED" },
        data: { status: "COMPLETED", completedAt: now },
      });
    }

    await recordActivity(
      {
        action: "SUBMITTED_FOR_REVIEW",
        summary: ruleMet
          ? `${actor.name} submitted ${task.code} for review`
          : `${actor.name} submitted their part of ${task.code}`,
        taskId,
        teamId: task.teamId,
        actorId: actor.id,
        meta: { summary: input.summary.slice(0, 200), ruleMet },
      },
      tx,
    );

    const rollup = await recomputeRollup(taskId, tx);
    return { ruleMet, openedReview, rollup };
  });

  if (outcome.ruleMet && task.reviewRequired) {
    await notify({
      userIds: await reviewerIds(taskId, actor.id),
      type: "SUBMITTED_FOR_REVIEW",
      title: `${task.code} is ready for review`,
      body: `${actor.name} submitted "${task.title}". ${input.summary.slice(0, 160)}`,
      taskId,
      actorId: actor.id,
      href: `/tasks/${taskId}`,
      email: { subject: `[${task.code}] Ready for review`, text: `${actor.name} submitted "${task.title}" for review.` },
    });
  } else if (outcome.ruleMet) {
    await notify({
      userIds: [task.createdById],
      type: "TASK_APPROVED",
      title: `${task.code} is complete`,
      body: `"${task.title}" needed no review and is now complete.`,
      taskId,
      actorId: actor.id,
      href: `/tasks/${taskId}`,
    });
  } else {
    await notify({
      userIds: [task.createdById],
      type: "PROGRESS_UPDATED",
      title: `${actor.name} submitted their part of ${task.code}`,
      body: `Still waiting on other assignees for "${task.title}".`,
      taskId,
      actorId: actor.id,
      href: `/tasks/${taskId}`,
    });
  }

  return outcome;
}

export async function decideReview(actor: SessionUser, taskId: string, input: ReviewInput) {
  const scope = await loadTaskScope(taskId);
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, include: { assignees: true } });

  const pending = await prisma.taskReview.findFirst({
    where: { taskId, decision: "PENDING" },
    orderBy: { round: "desc" },
  });
  if (!pending) throw conflict("There is nothing waiting for review on this task.");

  if (!canReviewTask(actor, scope, pending.submittedById)) {
    if (pending.submittedById === actor.id) {
      throw forbidden("You cannot review work you submitted yourself. Ask another reviewer.");
    }
    throw forbidden("Only a team lead or the company owner can review this task.");
  }

  const now = new Date();
  const approved = input.decision === "APPROVED";

  await prisma.$transaction(async (tx) => {
    await tx.taskReview.update({
      where: { id: pending.id },
      data: { decision: input.decision, feedback: input.feedback, decidedById: actor.id, decidedAt: now },
    });

    if (approved) {
      await tx.taskAssignee.updateMany({
        where: { taskId },
        data: { status: "COMPLETED", completedAt: now },
      });
      await tx.task.update({
        where: { id: taskId },
        data: { status: "COMPLETED", reviewedAt: now, completedAt: now, progress: 100 },
      });
      await maybeScheduleRecurrence(taskId, tx);
    } else {
      // Only the people who submitted are sent back to work; others keep their state.
      await tx.taskAssignee.updateMany({
        where: { taskId, status: "SUBMITTED" },
        data: { status: "CHANGES_REQUESTED", submittedAt: null },
      });
      await tx.task.update({ where: { id: taskId }, data: { status: "CHANGES_REQUESTED", reviewedAt: now } });
    }

    await recordActivity(
      {
        action: approved ? "REVIEW_APPROVED" : "REVIEW_CHANGES_REQUESTED",
        summary: approved
          ? `${actor.name} approved ${task.code}`
          : `${actor.name} requested changes on ${task.code}`,
        taskId,
        teamId: task.teamId,
        actorId: actor.id,
        meta: { round: pending.round, feedback: input.feedback?.slice(0, 200) ?? null },
      },
      tx,
    );
  });

  await notify({
    userIds: [...task.assignees.map((a) => a.userId), pending.submittedById],
    type: approved ? "TASK_APPROVED" : "CHANGES_REQUESTED",
    title: approved ? `${task.code} approved` : `Changes requested on ${task.code}`,
    body: input.feedback ?? (approved ? `${actor.name} approved "${task.title}".` : `${actor.name} asked for changes.`),
    taskId,
    actorId: actor.id,
    href: `/tasks/${taskId}`,
    email: {
      subject: approved ? `[${task.code}] Approved` : `[${task.code}] Changes requested`,
      text: input.feedback ?? (approved ? "Your work was approved." : "Your work needs changes."),
    },
  });

  return prisma.task.findUniqueOrThrow({ where: { id: taskId } });
}

/**
 * When a completed task repeats, open the next occurrence rather than
 * resurrecting the finished one, so history stays intact.
 */
async function maybeScheduleRecurrence(taskId: string, tx: TxClient): Promise<void> {
  const task = await tx.task.findUnique({ where: { id: taskId }, include: { assignees: true, subtasks: true } });
  if (!task || task.recurrence === "NONE") return;

  const step = task.recurrence === "DAILY" ? 1 : task.recurrence === "WEEKLY" ? 7 : 30;
  const shift = (date: Date | null) => (date ? new Date(date.getTime() + step * 24 * 60 * 60 * 1000) : null);

  const counter = await tx.counter.upsert({
    where: { key: "taskCode" },
    create: { key: "taskCode", value: 1 },
    update: { value: { increment: 1 } },
  });
  const prefix = (await tx.setting.findUnique({ where: { key: "taskCodePrefix" } }))?.value || "CAD";

  const next = await tx.task.create({
    data: {
      code: `${prefix}-${String(counter.value).padStart(3, "0")}`,
      title: task.title,
      description: task.description,
      instruction: task.instruction,
      priority: task.priority,
      status: "ASSIGNED",
      assignmentType: task.assignmentType,
      completionRule: task.completionRule,
      progressMode: task.progressMode,
      updateCadence: task.updateCadence,
      recurrence: task.recurrence,
      reviewRequired: task.reviewRequired,
      estimateHours: task.estimateHours,
      category: task.category,
      startDate: shift(task.startDate),
      dueAt: shift(task.dueAt),
      originalDueAt: shift(task.dueAt),
      teamId: task.teamId,
      projectId: task.projectId,
      createdById: task.createdById,
      primaryOwnerId: task.primaryOwnerId,
      assignedAt: new Date(),
      recurrenceParentId: task.id,
      assignees: {
        create: task.assignees.map((a) => ({
          userId: a.userId,
          isRequired: a.isRequired,
          isPrimary: a.isPrimary,
          viaTeam: a.viaTeam,
        })),
      },
      subtasks: {
        create: task.subtasks.map((s) => ({ title: s.title, position: s.position })),
      },
    },
  });

  await recordActivity(
    {
      action: "TASK_CREATED",
      summary: `${next.code} opened automatically because ${task.code} repeats ${task.recurrence.toLowerCase()}`,
      taskId: next.id,
      teamId: next.teamId,
      actorId: null,
      meta: { recurrenceParentId: task.id },
    },
    tx,
  );
}

/** Tasks waiting on this person's review decision. */
export async function listAwaitingReview(user: SessionUser) {
  const reviews = await prisma.taskReview.findMany({
    where: {
      decision: "PENDING",
      task: { archivedAt: null, status: "SUBMITTED_FOR_REVIEW" },
    },
    include: {
      submittedBy: { select: { id: true, name: true, avatarColor: true } },
      task: {
        include: {
          team: { select: { id: true, name: true, color: true } },
          assignees: { select: { userId: true } },
        },
      },
    },
    orderBy: { submittedAt: "asc" },
  });

  return reviews.filter((review) =>
    canReviewTask(
      user,
      {
        id: review.task.id,
        teamId: review.task.teamId,
        createdById: review.task.createdById,
        primaryOwnerId: review.task.primaryOwnerId,
        reviewRequired: review.task.reviewRequired,
        assigneeIds: review.task.assignees.map((a) => a.userId),
      },
      review.submittedById,
    ),
  );
}

export async function getReviewHistory(actor: SessionUser, taskId: string) {
  await requireViewableTask(actor, taskId);
  const reviews = await prisma.taskReview.findMany({
    where: { taskId },
    include: {
      submittedBy: { select: { id: true, name: true, avatarColor: true } },
      decidedBy: { select: { id: true, name: true, avatarColor: true } },
    },
    orderBy: { round: "asc" },
  });
  if (reviews.length === 0) throw notFound("This task has no review history yet.");
  return reviews;
}
