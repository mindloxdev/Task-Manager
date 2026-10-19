/**
 * Reports and analytics.
 *
 * Each metric states how it is calculated, and the UI prints the same wording
 * next to the number. Two deliberate choices:
 *
 *  - On-time completion is measured against the ORIGINAL deadline, so moving a
 *    deadline cannot turn a late delivery into an on-time one.
 *  - Per-person counts divide shared tasks by the number of required assignees
 *    and weight by priority, because a raw task count is not a measure of
 *    productivity. The UI says so wherever these appear.
 */
import type { Prisma } from "@prisma/client";

import { prisma } from "@/server/db";
import type { SessionUser } from "@/server/auth";
import { forbidden } from "@/server/errors";
import { canViewReports, isOwner } from "@/server/permissions";
import { taskVisibilityFilter } from "@/server/services/tasks";
import { ACTIVE_TASK_STATUSES, TASK_PRIORITY_WEIGHT, type TaskPriority, type TaskStatus } from "@/lib/enums";
import { taskHealth, workloadScore } from "@/lib/task-health";
import { DAY_MS } from "@/lib/dates";
import { average, ratioPct } from "@/lib/utils";

export type ReportRange = { from: Date; to: Date; teamId: string | null; projectId: string | null };

export type ReportData = {
  range: { from: Date; to: Date };
  headline: {
    assigned: number;
    completed: number;
    completionRate: number;
    onTime: number;
    late: number;
    onTimeRate: number;
    averageCompletionDays: number | null;
    averageCycleDays: number | null;
    overdueNow: number;
    awaitingReview: number;
    blockedNow: number;
    reopenedCount: number;
    updateCompliance: number;
  };
  methodology: Record<string, string>;
  byTeam: {
    teamId: string;
    teamName: string;
    color: string;
    assigned: number;
    completed: number;
    onTime: number;
    late: number;
    overdue: number;
    completionRate: number;
    averageCompletionDays: number | null;
    weightedLoad: number;
  }[];
  byEmployee: {
    userId: string;
    name: string;
    avatarColor: string;
    teams: string[];
    assignedShare: number;
    completedShare: number;
    onTimeRate: number;
    overdue: number;
    blocked: number;
    updatesPosted: number;
    updateComplianceRate: number;
    weightedLoad: number;
    estimatedHours: number;
  }[];
  completionTrend: { date: string; assigned: number; completed: number }[];
  statusMix: { status: TaskStatus; count: number }[];
  blockers: {
    taskId: string;
    code: string;
    title: string;
    reportedBy: string;
    reason: string;
    createdAt: Date;
    resolved: boolean;
  }[];
  reopened: { taskId: string; code: string; title: string; rounds: number; lastFeedback: string | null }[];
  lateCompletions: {
    taskId: string;
    code: string;
    title: string;
    assignees: string[];
    originalDueAt: Date | null;
    completedAt: Date | null;
    daysLate: number;
  }[];
};

/** Report scope: owners see the company, managers only the teams they lead. */
function reportWhere(user: SessionUser, range: ReportRange): Prisma.TaskWhereInput {
  const and: Prisma.TaskWhereInput[] = [taskVisibilityFilter(user), { archivedAt: null }];
  if (!isOwner(user)) and.push({ teamId: { in: user.ledTeamIds } });
  if (range.teamId) and.push({ teamId: range.teamId });
  if (range.projectId) and.push({ projectId: range.projectId });
  return { AND: and };
}

export async function getReport(user: SessionUser, range: ReportRange, now = new Date()): Promise<ReportData> {
  if (!canViewReports(user)) throw forbidden("Only the owner or a team lead can see reports.");

  const where = reportWhere(user, range);

  const tasks = await prisma.task.findMany({
    where,
    include: {
      team: { select: { id: true, name: true, color: true } },
      assignees: {
        include: { user: { select: { id: true, name: true, avatarColor: true } } },
      },
      reviews: { orderBy: { round: "asc" } },
      progressUpdates: {
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, name: true } } },
      },
      updateRequests: { select: { id: true, requestedOfId: true, respondedAt: true, createdAt: true } },
    },
  });

  const inRange = (date: Date | null | undefined) => Boolean(date && date >= range.from && date <= range.to);

  // "Assigned in range" and "completed in range" are independent windows: a
  // task assigned before the range can still be completed inside it.
  const assignedInRange = tasks.filter((t) => inRange(t.assignedAt));
  const completedInRange = tasks.filter((t) => t.status === "COMPLETED" && inRange(t.completedAt));

  const deadlineFor = (task: (typeof tasks)[number]) => task.originalDueAt ?? task.dueAt;
  const onTimeTasks = completedInRange.filter((t) => {
    const due = deadlineFor(t);
    return !due || (t.completedAt && t.completedAt <= due);
  });
  const lateTasks = completedInRange.filter((t) => {
    const due = deadlineFor(t);
    return Boolean(due && t.completedAt && t.completedAt > due);
  });

  const completionDays = completedInRange
    .map((t) => {
      const start = t.assignedAt ?? t.createdAt;
      return t.completedAt ? (t.completedAt.getTime() - start.getTime()) / DAY_MS : null;
    })
    .filter((value): value is number => value !== null);

  const cycleDays = completedInRange
    .map((t) => (t.startedAt && t.completedAt ? (t.completedAt.getTime() - t.startedAt.getTime()) / DAY_MS : null))
    .filter((value): value is number => value !== null);

  const liveTasks = tasks.filter((t) => ACTIVE_TASK_STATUSES.includes(t.status as TaskStatus));
  const overdueNow = liveTasks.filter(
    (t) =>
      taskHealth({ status: t.status as TaskStatus, progress: t.progress, startDate: t.startDate, dueAt: t.dueAt }, now) ===
      "OVERDUE",
  );

  const allRequests = tasks.flatMap((t) => t.updateRequests);
  const answeredRequests = allRequests.filter((r) => r.respondedAt !== null);

  // --- per team ----------------------------------------------------------
  const teamIds = Array.from(new Set(tasks.map((t) => t.teamId).filter((id): id is string => Boolean(id))));
  const byTeam = teamIds
    .map((teamId) => {
      const teamTasks = tasks.filter((t) => t.teamId === teamId);
      const team = teamTasks[0]?.team;
      const teamCompleted = teamTasks.filter((t) => t.status === "COMPLETED" && inRange(t.completedAt));
      const teamOnTime = teamCompleted.filter((t) => {
        const due = deadlineFor(t);
        return !due || (t.completedAt && t.completedAt <= due);
      });
      const days = teamCompleted
        .map((t) => (t.completedAt ? (t.completedAt.getTime() - (t.assignedAt ?? t.createdAt).getTime()) / DAY_MS : null))
        .filter((v): v is number => v !== null);
      const assignedCount = teamTasks.filter((t) => inRange(t.assignedAt)).length;
      return {
        teamId,
        teamName: team?.name ?? "Unassigned",
        color: team?.color ?? "#64748B",
        assigned: assignedCount,
        completed: teamCompleted.length,
        onTime: teamOnTime.length,
        late: teamCompleted.length - teamOnTime.length,
        overdue: overdueNow.filter((t) => t.teamId === teamId).length,
        completionRate: ratioPct(teamCompleted.length, Math.max(assignedCount, teamCompleted.length)),
        averageCompletionDays: days.length > 0 ? Math.round(average(days) * 10) / 10 : null,
        weightedLoad:
          Math.round(
            teamTasks
              .filter((t) => ACTIVE_TASK_STATUSES.includes(t.status as TaskStatus))
              .reduce((total, t) => total + (TASK_PRIORITY_WEIGHT[t.priority as TaskPriority] ?? 2), 0) * 10,
          ) / 10,
      };
    })
    .sort((a, b) => b.assigned - a.assigned);

  // --- per employee ------------------------------------------------------
  type EmployeeAccumulator = {
    userId: string;
    name: string;
    avatarColor: string;
    teams: Set<string>;
    assignedShare: number;
    completedShare: number;
    completedCount: number;
    onTimeCount: number;
    overdue: number;
    blocked: number;
    updatesPosted: number;
    requests: number;
    answered: number;
    load: { priorityWeight: number; requiredAssignees: number; estimateHours?: number | null }[];
  };

  const employees = new Map<string, EmployeeAccumulator>();
  const ensure = (user_: { id: string; name: string; avatarColor: string }): EmployeeAccumulator => {
    let row = employees.get(user_.id);
    if (!row) {
      row = {
        userId: user_.id,
        name: user_.name,
        avatarColor: user_.avatarColor,
        teams: new Set(),
        assignedShare: 0,
        completedShare: 0,
        completedCount: 0,
        onTimeCount: 0,
        overdue: 0,
        blocked: 0,
        updatesPosted: 0,
        requests: 0,
        answered: 0,
        load: [],
      };
      employees.set(user_.id, row);
    }
    return row;
  };

  for (const task of tasks) {
    const required = Math.max(1, task.assignees.filter((a) => a.isRequired).length);
    const health = taskHealth(
      { status: task.status as TaskStatus, progress: task.progress, startDate: task.startDate, dueAt: task.dueAt },
      now,
    );
    const due = deadlineFor(task);

    for (const assignee of task.assignees) {
      const row = ensure(assignee.user);
      if (task.team) row.teams.add(task.team.name);
      const share = assignee.isRequired ? 1 / required : 0;

      if (inRange(task.assignedAt)) row.assignedShare += share;
      if (task.status === "COMPLETED" && inRange(task.completedAt)) {
        row.completedShare += share;
        row.completedCount += 1;
        if (!due || (task.completedAt && task.completedAt <= due)) row.onTimeCount += 1;
      }
      if (ACTIVE_TASK_STATUSES.includes(task.status as TaskStatus)) {
        if (health === "OVERDUE") row.overdue += 1;
        if (assignee.status === "BLOCKED") row.blocked += 1;
        row.load.push({
          priorityWeight: TASK_PRIORITY_WEIGHT[task.priority as TaskPriority] ?? 2,
          requiredAssignees: required,
          estimateHours: task.estimateHours,
        });
      }
    }

    for (const update of task.progressUpdates) {
      if (!inRange(update.createdAt)) continue;
      const row = employees.get(update.userId);
      if (row) row.updatesPosted += 1;
    }

    for (const request of task.updateRequests) {
      const row = employees.get(request.requestedOfId);
      if (!row) continue;
      if (!inRange(request.createdAt)) continue;
      row.requests += 1;
      if (request.respondedAt) row.answered += 1;
    }
  }

  const byEmployee = Array.from(employees.values())
    .map((row) => {
      const load = workloadScore(row.load);
      return {
        userId: row.userId,
        name: row.name,
        avatarColor: row.avatarColor,
        teams: Array.from(row.teams),
        assignedShare: Math.round(row.assignedShare * 10) / 10,
        completedShare: Math.round(row.completedShare * 10) / 10,
        onTimeRate: ratioPct(row.onTimeCount, row.completedCount),
        overdue: row.overdue,
        blocked: row.blocked,
        updatesPosted: row.updatesPosted,
        updateComplianceRate: row.requests === 0 ? 100 : ratioPct(row.answered, row.requests),
        weightedLoad: load.weighted,
        estimatedHours: load.hours,
      };
    })
    .sort((a, b) => b.weightedLoad - a.weightedLoad);

  // --- trend -------------------------------------------------------------
  const days = Math.max(1, Math.min(120, Math.ceil((range.to.getTime() - range.from.getTime()) / DAY_MS)));
  const completionTrend: { date: string; assigned: number; completed: number }[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    const dayStart = new Date(range.from.getTime() + offset * DAY_MS);
    const dayEnd = new Date(dayStart.getTime() + DAY_MS - 1);
    completionTrend.push({
      date: dayStart.toISOString().slice(0, 10),
      assigned: tasks.filter((t) => t.assignedAt && t.assignedAt >= dayStart && t.assignedAt <= dayEnd).length,
      completed: tasks.filter((t) => t.completedAt && t.completedAt >= dayStart && t.completedAt <= dayEnd).length,
    });
  }

  const statusMixMap = new Map<TaskStatus, number>();
  for (const task of tasks) {
    statusMixMap.set(task.status as TaskStatus, (statusMixMap.get(task.status as TaskStatus) ?? 0) + 1);
  }

  const blockers = tasks
    .flatMap((task) =>
      task.progressUpdates
        .filter((update) => update.kind === "BLOCKER" && inRange(update.createdAt))
        .map((update) => ({
          taskId: task.id,
          code: task.code,
          title: task.title,
          reportedBy: update.user.name,
          reason: update.blockers ?? "",
          createdAt: update.createdAt,
          resolved: task.status !== "BLOCKED",
        })),
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const reopened = tasks
    .filter((task) => task.reviews.filter((r) => r.decision === "CHANGES_REQUESTED").length > 0)
    .map((task) => {
      const sentBack = task.reviews.filter((r) => r.decision === "CHANGES_REQUESTED");
      return {
        taskId: task.id,
        code: task.code,
        title: task.title,
        rounds: sentBack.length,
        lastFeedback: sentBack[sentBack.length - 1]?.feedback ?? null,
      };
    })
    .sort((a, b) => b.rounds - a.rounds);

  const lateCompletions = lateTasks
    .map((task) => {
      const due = deadlineFor(task);
      return {
        taskId: task.id,
        code: task.code,
        title: task.title,
        assignees: task.assignees.map((a) => a.user.name),
        originalDueAt: due,
        completedAt: task.completedAt,
        daysLate:
          due && task.completedAt ? Math.round(((task.completedAt.getTime() - due.getTime()) / DAY_MS) * 10) / 10 : 0,
      };
    })
    .sort((a, b) => b.daysLate - a.daysLate);

  return {
    range: { from: range.from, to: range.to },
    headline: {
      assigned: assignedInRange.length,
      completed: completedInRange.length,
      completionRate: ratioPct(completedInRange.length, Math.max(assignedInRange.length, completedInRange.length)),
      onTime: onTimeTasks.length,
      late: lateTasks.length,
      onTimeRate: ratioPct(onTimeTasks.length, completedInRange.length),
      averageCompletionDays: completionDays.length > 0 ? Math.round(average(completionDays) * 10) / 10 : null,
      averageCycleDays: cycleDays.length > 0 ? Math.round(average(cycleDays) * 10) / 10 : null,
      overdueNow: overdueNow.length,
      awaitingReview: tasks.filter((t) => t.status === "SUBMITTED_FOR_REVIEW").length,
      blockedNow: tasks.filter((t) => t.status === "BLOCKED").length,
      reopenedCount: reopened.length,
      updateCompliance: allRequests.length === 0 ? 100 : ratioPct(answeredRequests.length, allRequests.length),
    },
    methodology: {
      assigned: "Tasks whose assignment timestamp falls inside the selected range.",
      completed: "Tasks approved (or auto-completed where no review is required) inside the range.",
      completionRate:
        "Completed ÷ the larger of assigned and completed in the range. Using the larger denominator avoids rates above 100% when older work is finished.",
      onTime:
        "Completed on or before the ORIGINAL deadline. Deadline extensions do not turn a late delivery into an on-time one.",
      averageCompletionDays: "Mean days from assignment to completion, for tasks completed in the range.",
      averageCycleDays: "Mean days from the first 'in progress' timestamp to completion.",
      updateCompliance: "Share of manager update requests in the range that received a reply.",
      perPerson:
        "Shared tasks are split across the required assignees, and open work is weighted by priority (Low 1 → Urgent 4). These figures show load and responsiveness, not individual productivity: task size, complexity and collaboration are not comparable between people.",
    },
    byTeam,
    byEmployee,
    completionTrend,
    statusMix: Array.from(statusMixMap.entries()).map(([status, count]) => ({ status, count })),
    blockers: blockers.slice(0, 50),
    reopened: reopened.slice(0, 50),
    lateCompletions: lateCompletions.slice(0, 50),
  };
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  // Prefix formula-like values so spreadsheets treat them as text.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0) return columns ? `${columns.join(",")}\n` : "";
  const headers = columns ?? Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(headers.map((header) => csvCell(row[header])).join(","));
  return `${lines.join("\n")}\n`;
}

export type ExportKind = "tasks" | "employees" | "teams" | "progress" | "blockers" | "late";

export async function exportReportCsv(user: SessionUser, kind: ExportKind, range: ReportRange): Promise<string> {
  if (!canViewReports(user)) throw forbidden("Only the owner or a team lead can export reports.");
  const report = await getReport(user, range);

  switch (kind) {
    case "employees":
      return toCsv(
        report.byEmployee.map((row) => ({
          name: row.name,
          teams: row.teams.join(" / "),
          assigned_share: row.assignedShare,
          completed_share: row.completedShare,
          on_time_rate_pct: row.onTimeRate,
          overdue: row.overdue,
          blocked: row.blocked,
          updates_posted: row.updatesPosted,
          update_compliance_pct: row.updateComplianceRate,
          weighted_open_load: row.weightedLoad,
          estimated_hours: row.estimatedHours,
        })),
      );
    case "teams":
      return toCsv(
        report.byTeam.map((row) => ({
          team: row.teamName,
          assigned: row.assigned,
          completed: row.completed,
          on_time: row.onTime,
          late: row.late,
          overdue_now: row.overdue,
          completion_rate_pct: row.completionRate,
          avg_completion_days: row.averageCompletionDays,
          weighted_open_load: row.weightedLoad,
        })),
      );
    case "blockers":
      return toCsv(
        report.blockers.map((row) => ({
          task: row.code,
          title: row.title,
          reported_by: row.reportedBy,
          reported_at: row.createdAt,
          resolved: row.resolved,
          reason: row.reason,
        })),
      );
    case "late":
      return toCsv(
        report.lateCompletions.map((row) => ({
          task: row.code,
          title: row.title,
          assignees: row.assignees.join(" / "),
          original_deadline: row.originalDueAt,
          completed_at: row.completedAt,
          days_late: row.daysLate,
        })),
      );
    case "progress": {
      const updates = await prisma.progressUpdate.findMany({
        where: {
          createdAt: { gte: range.from, lte: range.to },
          task: reportWhere(user, range),
        },
        include: {
          user: { select: { name: true } },
          task: { select: { code: true, title: true, team: { select: { name: true } } } },
        },
        orderBy: { createdAt: "asc" },
      });
      return toCsv(
        updates.map((row) => ({
          task: row.task.code,
          title: row.task.title,
          team: row.task.team?.name ?? "",
          author: row.user.name,
          kind: row.kind,
          progress_pct: row.progress,
          posted_at: row.createdAt,
          work_completed: row.workCompleted ?? "",
          work_remaining: row.workRemaining ?? "",
          blockers: row.blockers ?? "",
          help_needed: row.helpNeeded ?? "",
          expected_completion: row.expectedCompletion ?? "",
        })),
      );
    }
    case "tasks":
    default: {
      const tasks = await prisma.task.findMany({
        where: reportWhere(user, range),
        include: {
          team: { select: { name: true } },
          project: { select: { key: true } },
          createdBy: { select: { name: true } },
          assignees: { include: { user: { select: { name: true } } } },
        },
        orderBy: { code: "asc" },
      });
      const now = new Date();
      return toCsv(
        tasks.map((task) => ({
          code: task.code,
          title: task.title,
          status: task.status,
          health: taskHealth(
            { status: task.status as TaskStatus, progress: task.progress, startDate: task.startDate, dueAt: task.dueAt },
            now,
          ),
          priority: task.priority,
          progress_pct: task.progress,
          team: task.team?.name ?? "",
          project: task.project?.key ?? "",
          assignment_type: task.assignmentType,
          assignees: task.assignees.map((a) => a.user.name).join(" / "),
          created_by: task.createdBy.name,
          start_date: task.startDate,
          original_deadline: task.originalDueAt,
          deadline: task.dueAt,
          assigned_at: task.assignedAt,
          completed_at: task.completedAt,
          estimate_hours: task.estimateHours ?? "",
        })),
      );
    }
  }
}
