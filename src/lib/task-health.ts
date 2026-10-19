/**
 * Task health and progress maths.
 *
 * Every number the dashboards show comes from this module, and each rule is
 * written out explicitly. Nothing here invents progress: a task's percentage
 * is either reported by its assignees or counted from its checklist.
 */
import { pct, ratioPct } from "@/lib/utils";
import type { AssigneeStatus, CompletionRule, ProgressMode, TaskHealth, TaskStatus, UpdateCadence } from "@/lib/enums";
import { UPDATE_CADENCE_HOURS } from "@/lib/enums";
import { HOUR_MS, toDate } from "@/lib/dates";

/** How far behind schedule a task must be before it is flagged "at risk". */
export const AT_RISK_GAP_POINTS = 25;

/** A deadline closer than this with unfinished work also counts as at risk. */
export const AT_RISK_WINDOW_HOURS = 24;

export type HealthInput = {
  status: TaskStatus;
  progress: number;
  startDate?: Date | string | null;
  dueAt?: Date | string | null;
};

/**
 * Fraction of the planned window that has elapsed, 0–1.
 * Returns null when the task has no window to measure against.
 */
export function elapsedFraction(input: HealthInput, now = new Date()): number | null {
  const due = toDate(input.dueAt);
  if (!due) return null;
  const start = toDate(input.startDate) ?? null;
  if (!start || start.getTime() >= due.getTime()) return null;
  const span = due.getTime() - start.getTime();
  const done = now.getTime() - start.getTime();
  return Math.min(1, Math.max(0, done / span));
}

export function taskHealth(input: HealthInput, now = new Date()): TaskHealth {
  if (input.status === "COMPLETED") return "COMPLETED";
  if (input.status === "CANCELLED") return "COMPLETED";
  if (input.status === "BLOCKED") return "BLOCKED";

  const due = toDate(input.dueAt);
  if (due && due.getTime() < now.getTime()) return "OVERDUE";

  // A submitted task is out of the assignee's hands — not at risk from their side.
  if (input.status === "SUBMITTED_FOR_REVIEW") return "ON_TRACK";

  if (due) {
    const hoursLeft = (due.getTime() - now.getTime()) / HOUR_MS;
    if (hoursLeft <= AT_RISK_WINDOW_HOURS && input.progress < 100) return "AT_RISK";
    const elapsed = elapsedFraction(input, now);
    if (elapsed !== null && elapsed * 100 - input.progress > AT_RISK_GAP_POINTS) return "AT_RISK";
  }

  if (input.status === "DRAFT" || input.status === "ASSIGNED") return "NOT_STARTED";
  return "ON_TRACK";
}

/** Plain-language explanation of the health verdict, shown in tooltips. */
export function healthExplanation(input: HealthInput, now = new Date()): string {
  const health = taskHealth(input, now);
  const due = toDate(input.dueAt);
  switch (health) {
    case "COMPLETED":
      return "Work is finished — no deadline pressure remains.";
    case "BLOCKED":
      return "An assignee reported a blocker, so progress has stopped.";
    case "OVERDUE":
      return due ? `The deadline passed on ${due.toISOString().slice(0, 16).replace("T", " ")} UTC.` : "The deadline has passed.";
    case "AT_RISK": {
      const elapsed = elapsedFraction(input, now);
      if (due && (due.getTime() - now.getTime()) / HOUR_MS <= AT_RISK_WINDOW_HOURS) {
        return `Less than ${AT_RISK_WINDOW_HOURS} hours remain and the task is at ${input.progress}%.`;
      }
      if (elapsed !== null) {
        return `${Math.round(elapsed * 100)}% of the planned time has passed but only ${input.progress}% of the work is reported done (gap over ${AT_RISK_GAP_POINTS} points).`;
      }
      return "The task is behind its planned schedule.";
    }
    case "NOT_STARTED":
      return "Nobody has started this task yet.";
    default:
      return "Reported progress is keeping pace with the schedule.";
  }
}

export type AssigneeProgressInput = {
  isRequired: boolean;
  isPrimary: boolean;
  status: AssigneeStatus;
  progress: number;
};

/**
 * Roll per-assignee reports up to one task percentage.
 *
 * CHECKLIST mode counts completed subtasks. Otherwise the figure is the mean of
 * the assignees whose work the completion rule actually requires, so one person
 * racing ahead cannot make a shared task look finished.
 */
export function rollupProgress(params: {
  progressMode: ProgressMode;
  completionRule: CompletionRule;
  assignees: AssigneeProgressInput[];
  subtasks: { isDone: boolean }[];
  fallback: number;
}): number {
  if (params.progressMode === "CHECKLIST") {
    if (params.subtasks.length === 0) return params.fallback;
    return ratioPct(params.subtasks.filter((s) => s.isDone).length, params.subtasks.length);
  }

  const counted = countedAssignees(params.completionRule, params.assignees);
  if (counted.length === 0) return params.fallback;
  return pct(counted.reduce((total, a) => total + a.progress, 0) / counted.length);
}

/** The assignees whose completion the rule depends on. */
export function countedAssignees<T extends AssigneeProgressInput>(rule: CompletionRule, assignees: T[]): T[] {
  if (assignees.length === 0) return [];
  if (rule === "PRIMARY_ONLY") {
    const primary = assignees.filter((a) => a.isPrimary);
    return primary.length > 0 ? primary : assignees;
  }
  const required = assignees.filter((a) => a.isRequired);
  return required.length > 0 ? required : assignees;
}

/** True when the completion rule is satisfied by the assignees' own statuses. */
export function isCompletionRuleSatisfied(
  rule: CompletionRule,
  assignees: AssigneeProgressInput[],
  finished: (status: AssigneeStatus) => boolean,
): boolean {
  if (assignees.length === 0) return false;
  if (rule === "ANY_ONE") return assignees.some((a) => finished(a.status));
  return countedAssignees(rule, assignees).every((a) => finished(a.status));
}

/**
 * Derive the task status from its assignees.
 *
 * Returns null when the current status is one only a manager may change
 * (draft, completed, cancelled, changes requested) — those are never
 * overwritten by a rollup.
 */
export function deriveTaskStatus(params: {
  current: TaskStatus;
  reviewRequired: boolean;
  completionRule: CompletionRule;
  assignees: AssigneeProgressInput[];
}): TaskStatus | null {
  const { current, assignees, completionRule, reviewRequired } = params;
  if (current === "DRAFT" || current === "COMPLETED" || current === "CANCELLED") return null;
  if (assignees.length === 0) return null;

  const submittedOrDone = (status: AssigneeStatus) => status === "SUBMITTED" || status === "COMPLETED";

  if (isCompletionRuleSatisfied(completionRule, assignees, submittedOrDone)) {
    return reviewRequired ? "SUBMITTED_FOR_REVIEW" : "COMPLETED";
  }

  // Someone was sent back for changes: the task returns to that state until
  // they resubmit.
  if (assignees.some((a) => a.status === "CHANGES_REQUESTED")) return "CHANGES_REQUESTED";
  if (assignees.some((a) => a.status === "BLOCKED")) return "BLOCKED";
  if (assignees.some((a) => a.status === "IN_PROGRESS")) return "IN_PROGRESS";
  if (assignees.every((a) => a.status !== "ASSIGNED")) return "ACKNOWLEDGED";
  return "ASSIGNED";
}

/** Whether a progress update is overdue for the configured cadence. */
export function isUpdateOverdue(
  params: { updateCadence: UpdateCadence; lastProgressAt?: Date | string | null; assignedAt?: Date | string | null },
  now = new Date(),
): boolean {
  const limit = UPDATE_CADENCE_HOURS[params.updateCadence];
  if (!limit) return false;
  const since = toDate(params.lastProgressAt) ?? toDate(params.assignedAt);
  if (!since) return false;
  return (now.getTime() - since.getTime()) / HOUR_MS > limit;
}

/**
 * Workload score for one person, in "weighted open tasks".
 *
 * Priority weights are applied so ten low-priority chores do not read the same
 * as ten urgent ones, and shared tasks are divided by the number of required
 * assignees because the person only owns their share.
 */
export function workloadScore(
  items: { priorityWeight: number; requiredAssignees: number; estimateHours?: number | null }[],
): { weighted: number; hours: number } {
  let weighted = 0;
  let hours = 0;
  for (const item of items) {
    const share = 1 / Math.max(1, item.requiredAssignees);
    weighted += item.priorityWeight * share;
    hours += (item.estimateHours ?? 0) * share;
  }
  return { weighted: Math.round(weighted * 10) / 10, hours: Math.round(hours * 10) / 10 };
}
