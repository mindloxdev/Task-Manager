/**
 * Dashboard aggregation.
 *
 * Every figure is read through the viewer's own visibility filter, so a manager
 * sees their teams' numbers and an employee sees their own — the same component
 * tree renders all three roles.
 */
import { prisma } from "@/server/db";
import type { SessionUser } from "@/server/auth";
import { mapListItems, taskVisibilityFilter, type TaskListItem } from "@/server/services/tasks";
import { listAwaitingReview } from "@/server/services/reviews";
import { listOpenUpdateRequests } from "@/server/services/progress";
import { listPendingExtensions } from "@/server/services/extensions";
import { listActivity } from "@/server/services/activity";
import { ACTIVE_TASK_STATUSES, type TaskHealth, type TaskStatus } from "@/lib/enums";
import { isUpdateOverdue, taskHealth } from "@/lib/task-health";
import { dayRange, weekRange } from "@/lib/dates";
import { ratioPct } from "@/lib/utils";

const DASHBOARD_INCLUDE = {
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
};

export type DashboardSummary = {
  activeTasks: number;
  completedThisWeek: number;
  inProgress: number;
  overdue: number;
  blocked: number;
  awaitingReview: number;
  atRisk: number;
  silentAssignees: number;
  dueToday: number;
  openUpdateRequests: number;
  pendingExtensions: number;
};

export type DashboardData = {
  summary: DashboardSummary;
  byStatus: { status: TaskStatus; count: number }[];
  byHealth: { health: TaskHealth; count: number }[];
  byPriority: { priority: string; count: number; completed: number }[];
  completionTrend: { date: string; assigned: number; completed: number }[];
  deadlines: {
    today: TaskListItem[];
    tomorrow: TaskListItem[];
    thisWeek: TaskListItem[];
    later: TaskListItem[];
    overdue: TaskListItem[];
  };
  myAssignments: {
    assignedToMe: TaskListItem[];
    createdByMe: TaskListItem[];
    needsMyAction: TaskListItem[];
  };
  awaitingMyReview: {
    id: string;
    taskId: string;
    code: string;
    title: string;
    submittedByName: string;
    submittedAt: Date;
    summary: string | null;
    teamName: string | null;
  }[];
  openUpdateRequests: Awaited<ReturnType<typeof listOpenUpdateRequests>>;
  pendingExtensions: Awaited<ReturnType<typeof listPendingExtensions>>;
  silentAssignees: {
    userId: string;
    name: string;
    avatarColor: string;
    taskId: string;
    taskCode: string;
    taskTitle: string;
    lastUpdateAt: Date | null;
    requestedAt: Date | null;
  }[];
  activity: Awaited<ReturnType<typeof listActivity>>["items"];
  generatedAt: Date;
};

export async function getDashboard(user: SessionUser, now = new Date()): Promise<DashboardData> {
  const visibility = taskVisibilityFilter(user);
  const base = { AND: [visibility, { archivedAt: null }] };

  // Every query below depends only on the viewer, so they all go out at once
  // rather than waterfalling: the page is as slow as the slowest, not the sum.
  const [tasks, awaitingReview, updateRequests, extensions, activity, silentRows] = await Promise.all([
    prisma.task.findMany({
      where: base,
      include: DASHBOARD_INCLUDE,
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }],
    }),
    listAwaitingReview(user),
    listOpenUpdateRequests(user.id),
    listPendingExtensions(user),
    listActivity({ viewer: { id: user.id, role: user.role, teamIds: user.teams.map((t) => t.teamId) }, limit: 18 }),
    prisma.taskAssignee.findMany({
      where: {
        task: { AND: [visibility, { archivedAt: null }, { status: { in: ACTIVE_TASK_STATUSES } }] },
        status: { in: ["ASSIGNED", "ACKNOWLEDGED", "IN_PROGRESS", "BLOCKED"] },
      },
      include: {
        user: { select: { id: true, name: true, avatarColor: true } },
        task: {
          select: {
            id: true,
            code: true,
            title: true,
            updateCadence: true,
            lastProgressAt: true,
            assignedAt: true,
            updateRequests: { where: { respondedAt: null }, select: { createdAt: true, requestedOfId: true } },
          },
        },
      },
    }),
  ]);

  const items = mapListItems(tasks, now);
  const rawById = new Map(tasks.map((task) => [task.id, task]));
  const live = items.filter((t) => ACTIVE_TASK_STATUSES.includes(t.status));
  const week = weekRange(now);
  const today = dayRange(now);
  const tomorrow = dayRange(new Date(now.getTime() + 24 * 60 * 60 * 1000));

  const byStatusMap = new Map<TaskStatus, number>();
  for (const item of items) byStatusMap.set(item.status, (byStatusMap.get(item.status) ?? 0) + 1);

  const byHealthMap = new Map<TaskHealth, number>();
  for (const item of live) byHealthMap.set(item.health, (byHealthMap.get(item.health) ?? 0) + 1);

  const priorities = ["URGENT", "HIGH", "NORMAL", "LOW"];
  const byPriority = priorities.map((priority) => ({
    priority,
    count: items.filter((t) => t.priority === priority && ACTIVE_TASK_STATUSES.includes(t.status)).length,
    completed: items.filter((t) => t.priority === priority && t.status === "COMPLETED").length,
  }));

  // 14-day assigned-vs-completed trend, counted from the stored timestamps.
  // The rows are already in memory from the query above, and bucketing them in
  // one pass avoids both a second round trip and a scan per day.
  const trendDays = 14;
  const buckets = new Map<string, { assigned: number; completed: number }>();
  for (let offset = trendDays - 1; offset >= 0; offset -= 1) {
    const day = new Date(now.getTime() - offset * 24 * 60 * 60 * 1000);
    buckets.set(dayRange(day).from.toISOString().slice(0, 10), { assigned: 0, completed: 0 });
  }
  const dayKey = (date: Date) => dayRange(date).from.toISOString().slice(0, 10);
  for (const task of tasks) {
    if (task.assignedAt) {
      const bucket = buckets.get(dayKey(task.assignedAt));
      if (bucket) bucket.assigned += 1;
    }
    if (task.completedAt) {
      const bucket = buckets.get(dayKey(task.completedAt));
      if (bucket) bucket.completed += 1;
    }
  }
  const completionTrend = Array.from(buckets.entries()).map(([date, counts]) => ({ date, ...counts }));

  const inWindow = (item: TaskListItem, from: Date, to: Date) =>
    item.dueAt !== null && item.dueAt >= from && item.dueAt <= to;

  const overdue = live.filter((t) => t.health === "OVERDUE");

  // Assignees who owe an update: either a cadence has lapsed, or a manager
  // asked and nobody has replied.
  const silentAssignees = silentRows
    .map((row) => {
      const pendingRequest = row.task.updateRequests.find((r) => r.requestedOfId === row.userId);
      const cadenceLapsed = isUpdateOverdue(
        {
          updateCadence: row.task.updateCadence as "NONE" | "DAILY" | "WEEKLY" | "ON_STATUS_CHANGE",
          lastProgressAt: row.lastUpdateAt ?? row.task.lastProgressAt,
          assignedAt: row.task.assignedAt,
        },
        now,
      );
      if (!pendingRequest && !cadenceLapsed) return null;
      return {
        userId: row.userId,
        name: row.user.name,
        avatarColor: row.user.avatarColor,
        taskId: row.task.id,
        taskCode: row.task.code,
        taskTitle: row.task.title,
        lastUpdateAt: row.lastUpdateAt,
        requestedAt: pendingRequest?.createdAt ?? null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => (a.lastUpdateAt?.getTime() ?? 0) - (b.lastUpdateAt?.getTime() ?? 0));

  return {
    summary: {
      activeTasks: live.length,
      completedThisWeek: tasks.filter((raw) => raw.completedAt && isWithin(raw.completedAt, week)).length,
      inProgress: items.filter((t) => t.status === "IN_PROGRESS").length,
      overdue: overdue.length,
      blocked: items.filter((t) => t.status === "BLOCKED").length,
      awaitingReview: items.filter((t) => t.status === "SUBMITTED_FOR_REVIEW").length,
      atRisk: live.filter((t) => t.health === "AT_RISK").length,
      silentAssignees: new Set(silentAssignees.map((s) => s.userId)).size,
      dueToday: live.filter((t) => inWindow(t, today.from, today.to)).length,
      openUpdateRequests: updateRequests.length,
      pendingExtensions: extensions.length,
    },
    byStatus: Array.from(byStatusMap.entries()).map(([status, count]) => ({ status, count })),
    byHealth: Array.from(byHealthMap.entries()).map(([health, count]) => ({ health, count })),
    byPriority,
    completionTrend,
    deadlines: {
      overdue: overdue.slice(0, 8),
      today: live.filter((t) => inWindow(t, today.from, today.to)).slice(0, 8),
      tomorrow: live.filter((t) => inWindow(t, tomorrow.from, tomorrow.to)).slice(0, 8),
      thisWeek: live
        .filter((t) => inWindow(t, new Date(tomorrow.to.getTime() + 1), week.to))
        .slice(0, 8),
      later: live.filter((t) => t.dueAt !== null && t.dueAt > week.to).slice(0, 8),
    },
    myAssignments: {
      assignedToMe: items.filter((t) => t.assignees.some((a) => a.userId === user.id)).slice(0, 10),
      createdByMe: items.filter((t) => rawById.get(t.id)?.createdById === user.id).slice(0, 10),
      needsMyAction: items
        .filter((t) => {
          const mine = t.assignees.find((a) => a.userId === user.id);
          if (mine && ["ASSIGNED", "CHANGES_REQUESTED", "BLOCKED"].includes(mine.status)) return true;
          return updateRequests.some((r) => r.task.id === t.id);
        })
        .slice(0, 10),
    },
    awaitingMyReview: awaitingReview.map((review) => ({
      id: review.id,
      taskId: review.task.id,
      code: review.task.code,
      title: review.task.title,
      submittedByName: review.submittedBy.name,
      submittedAt: review.submittedAt,
      summary: review.summary,
      teamName: review.task.team?.name ?? null,
    })),
    openUpdateRequests: updateRequests,
    pendingExtensions: extensions,
    silentAssignees: silentAssignees.slice(0, 12),
    activity: activity.items,
    generatedAt: now,
  };
}

function isWithin(date: Date, range: { from: Date; to: Date }): boolean {
  return date >= range.from && date <= range.to;
}

/** Personal workspace figures for the signed-in employee. */
export async function getMyWorkspace(user: SessionUser, now = new Date()) {
  const [assignments, teamTasks, updateRequests, myUpdates] = await Promise.all([
    prisma.task.findMany({
      where: { archivedAt: null, assignees: { some: { userId: user.id } } },
      include: DASHBOARD_INCLUDE,
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }],
    }),
    prisma.task.findMany({
      where: {
        archivedAt: null,
        teamId: { in: user.teams.map((t) => t.teamId) },
        assignees: { none: { userId: user.id } },
        status: { in: ACTIVE_TASK_STATUSES },
      },
      include: DASHBOARD_INCLUDE,
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }],
      take: 25,
    }),
    listOpenUpdateRequests(user.id),
    prisma.progressUpdate.findMany({
      where: { userId: user.id },
      include: { task: { select: { id: true, code: true, title: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const mine = mapListItems(assignments, now);
  const myStatus = (item: TaskListItem) => item.assignees.find((a) => a.userId === user.id)?.status;
  const live = mine.filter((t) => ACTIVE_TASK_STATUSES.includes(t.status));
  const today = dayRange(now);
  const week = weekRange(now);

  const completed = mine.filter((t) => t.status === "COMPLETED");
  const onTime = assignments.filter(
    (t) => t.status === "COMPLETED" && t.completedAt && (!(t.originalDueAt ?? t.dueAt) || t.completedAt <= (t.originalDueAt ?? t.dueAt)!),
  ).length;

  return {
    summary: {
      assigned: mine.length,
      active: live.length,
      dueToday: live.filter((t) => t.dueAt && t.dueAt >= today.from && t.dueAt <= today.to).length,
      dueThisWeek: live.filter((t) => t.dueAt && t.dueAt >= today.from && t.dueAt <= week.to).length,
      overdue: live.filter((t) => t.health === "OVERDUE").length,
      blocked: live.filter((t) => myStatus(t) === "BLOCKED").length,
      awaitingReview: live.filter((t) => myStatus(t) === "SUBMITTED").length,
      changesRequested: live.filter((t) => myStatus(t) === "CHANGES_REQUESTED").length,
      needsAcknowledgement: live.filter((t) => myStatus(t) === "ASSIGNED").length,
      completed: completed.length,
      onTimeRate: ratioPct(onTime, completed.length),
      openUpdateRequests: updateRequests.length,
    },
    needsAcknowledgement: live.filter((t) => myStatus(t) === "ASSIGNED"),
    changesRequested: live.filter((t) => myStatus(t) === "CHANGES_REQUESTED"),
    dueToday: live.filter((t) => t.dueAt && t.dueAt >= today.from && t.dueAt <= today.to),
    overdue: live.filter((t) => t.health === "OVERDUE"),
    blocked: live.filter((t) => myStatus(t) === "BLOCKED"),
    awaitingReview: live.filter((t) => myStatus(t) === "SUBMITTED"),
    upcoming: live
      .filter((t) => t.dueAt && t.dueAt > today.to)
      .slice(0, 12),
    active: live,
    teamTasks: mapListItems(teamTasks, now),
    updateRequests,
    myUpdates,
    generatedAt: now,
  };
}

/** Tasks in a date window for the calendar views. */
export async function getCalendarTasks(user: SessionUser, from: Date, to: Date) {
  const rows = await prisma.task.findMany({
    where: {
      AND: [taskVisibilityFilter(user), { archivedAt: null }, { dueAt: { gte: from, lte: to } }],
    },
    include: DASHBOARD_INCLUDE,
    orderBy: { dueAt: "asc" },
  });
  return mapListItems(rows);
}

/** Count of tasks by health for a status strip, used in several headers. */
export function summariseHealth(items: TaskListItem[]): Record<TaskHealth, number> {
  const out = {
    COMPLETED: 0,
    BLOCKED: 0,
    OVERDUE: 0,
    AT_RISK: 0,
    ON_TRACK: 0,
    NOT_STARTED: 0,
  } as Record<TaskHealth, number>;
  for (const item of items) out[item.health] += 1;
  return out;
}

export function statusCounts(items: TaskListItem[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) out[item.status] = (out[item.status] ?? 0) + 1;
  return out;
}

export function healthOf(item: { status: string; progress: number; startDate: Date | null; dueAt: Date | null }, now = new Date()) {
  return taskHealth({ status: item.status as TaskStatus, progress: item.progress, startDate: item.startDate, dueAt: item.dueAt }, now);
}
