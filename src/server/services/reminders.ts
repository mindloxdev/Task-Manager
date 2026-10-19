/**
 * Scheduled reminder sweep.
 *
 * Runs from `/api/cron/reminders` (protect it with CRON_SECRET and point a
 * scheduler at it — see README). The sweep is idempotent: every notification it
 * creates carries a dedupe key built from the task, the deadline and the
 * reminder window, so running it twice an hour, or twice in the same minute,
 * notifies nobody twice.
 */
import { prisma } from "@/server/db";
import { notify } from "@/server/services/notifications";
import { recordActivity } from "@/server/services/activity";
import { ACTIVE_TASK_STATUSES, type UpdateCadence } from "@/lib/enums";
import { HOUR_MS } from "@/lib/dates";
import { isUpdateOverdue } from "@/lib/task-health";

export type SweepResult = {
  ranAt: Date;
  deadlineReminders: number;
  overdueNotices: number;
  updateNudges: number;
  tasksScanned: number;
};

const DEFAULT_OFFSETS = [2, 24, 48];

/**
 * Reminder windows in hours, ascending.
 *
 * Ascending order matters: the sweep fires the *tightest* window a task has
 * crossed, so a task due in 20 hours sends the 24-hour reminder rather than the
 * 48-hour one, and sends the 2-hour reminder later as the deadline closes in.
 */
function parseOffsets(value: string | null | undefined): number[] {
  if (!value) return DEFAULT_OFFSETS;
  const parsed = value
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((hours) => Number.isFinite(hours) && hours > 0 && hours <= 720);
  return parsed.length > 0 ? parsed.sort((a, b) => a - b) : DEFAULT_OFFSETS;
}

/**
 * One pass over the open tasks.
 *
 * `now` is injectable so the behaviour is testable without waiting for a clock.
 */
export async function runReminderSweep(now = new Date()): Promise<SweepResult> {
  const companyOffsets = parseOffsets((await prisma.setting.findUnique({ where: { key: "reminderOffsets" } }))?.value);

  const tasks = await prisma.task.findMany({
    where: {
      archivedAt: null,
      status: { in: ACTIVE_TASK_STATUSES },
      dueAt: { not: null },
    },
    include: {
      assignees: { include: { user: { select: { id: true, preferences: { select: { reminderOffsets: true } } } } } },
      updateRequests: { where: { respondedAt: null }, select: { requestedOfId: true } },
    },
  });

  const result: SweepResult = {
    ranAt: now,
    deadlineReminders: 0,
    overdueNotices: 0,
    updateNudges: 0,
    tasksScanned: tasks.length,
  };

  for (const task of tasks) {
    if (!task.dueAt) continue;
    const hoursLeft = (task.dueAt.getTime() - now.getTime()) / HOUR_MS;

    // --- deadline approaching ------------------------------------------
    if (hoursLeft > 0) {
      for (const assignee of task.assignees) {
        const offsets = assignee.user.preferences?.reminderOffsets
          ? parseOffsets(assignee.user.preferences.reminderOffsets)
          : companyOffsets;
        // Offsets are ascending, so the first match is the tightest window the
        // task has crossed — exactly one reminder per window, per deadline.
        const due = offsets.find((offset) => hoursLeft <= offset);
        if (due === undefined) continue;
        const outcome = await notify({
          userIds: [assignee.userId],
          type: "DEADLINE_APPROACHING",
          title: `${task.code} is due in ${Math.max(1, Math.round(hoursLeft))} h`,
          body: `"${task.title}" is at ${task.progress}% with ${Math.max(1, Math.round(hoursLeft))} hours left.`,
          taskId: task.id,
          href: `/tasks/${task.id}`,
          dedupe: `deadline:${task.id}:${task.dueAt.toISOString()}:${due}`,
          email: { subject: `[${task.code}] Deadline approaching`, text: `"${task.title}" is due soon.` },
        });
        result.deadlineReminders += outcome.created;
      }
    }

    // --- overdue --------------------------------------------------------
    if (hoursLeft <= 0) {
      const recipients = [...task.assignees.map((a) => a.userId), task.createdById];
      const outcome = await notify({
        userIds: recipients,
        type: "TASK_OVERDUE",
        title: `${task.code} is overdue`,
        body: `"${task.title}" passed its deadline at ${task.progress}% complete.`,
        taskId: task.id,
        href: `/tasks/${task.id}`,
        dedupe: `overdue:${task.id}:${task.dueAt.toISOString()}`,
        email: { subject: `[${task.code}] Overdue`, text: `"${task.title}" is past its deadline.` },
      });
      result.overdueNotices += outcome.created;
      if (outcome.created > 0) {
        await recordActivity({
          action: "TASK_BECAME_OVERDUE",
          summary: `${task.code} passed its deadline at ${task.progress}%`,
          taskId: task.id,
          teamId: task.teamId,
          actorId: null,
          meta: { dueAt: task.dueAt },
        });
      }
    }

    // --- update cadence lapsed ------------------------------------------
    const cadence = task.updateCadence as UpdateCadence;
    if (cadence === "DAILY" || cadence === "WEEKLY") {
      for (const assignee of task.assignees) {
        if (assignee.status === "SUBMITTED" || assignee.status === "COMPLETED") continue;
        const lapsed = isUpdateOverdue(
          {
            updateCadence: cadence,
            lastProgressAt: assignee.lastUpdateAt ?? task.lastProgressAt,
            assignedAt: task.assignedAt,
          },
          now,
        );
        if (!lapsed) continue;
        // One nudge per cadence window, keyed by the window the clock is in.
        const windowHours = cadence === "DAILY" ? 24 : 24 * 7;
        const windowIndex = Math.floor(now.getTime() / (windowHours * HOUR_MS));
        const outcome = await notify({
          userIds: [assignee.userId],
          type: "UPDATE_REQUESTED",
          title: `Progress update due on ${task.code}`,
          body: `This task expects a ${cadence.toLowerCase()} update. Your last one was ${
            assignee.lastUpdateAt ? assignee.lastUpdateAt.toISOString().slice(0, 10) : "never posted"
          }.`,
          taskId: task.id,
          href: `/tasks/${task.id}`,
          dedupe: `cadence:${task.id}:${cadence}:${windowIndex}`,
        });
        result.updateNudges += outcome.created;
      }
    }
  }

  await prisma.setting.upsert({
    where: { key: "lastReminderSweep" },
    create: { key: "lastReminderSweep", value: now.toISOString() },
    update: { value: now.toISOString() },
  });

  return result;
}

export async function getLastSweep(): Promise<Date | null> {
  const setting = await prisma.setting.findUnique({ where: { key: "lastReminderSweep" } });
  if (!setting) return null;
  const date = new Date(setting.value);
  return Number.isNaN(date.getTime()) ? null : date;
}
