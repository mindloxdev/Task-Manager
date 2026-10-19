/**
 * Unit tests for the shared calculation module.
 *
 * These are the numbers every dashboard, table and report is built from, so
 * they are tested directly rather than only through the services.
 */
import { describe, expect, it } from "vitest";

import {
  AT_RISK_GAP_POINTS,
  countedAssignees,
  deriveTaskStatus,
  elapsedFraction,
  healthExplanation,
  isCompletionRuleSatisfied,
  isUpdateOverdue,
  rollupProgress,
  taskHealth,
  workloadScore,
} from "@/lib/task-health";
import { formatDate, formatDateTime, formatDueDistance, isOverdue, parseDateInput } from "@/lib/dates";
import { pct, ratioPct, slugify, truncate } from "@/lib/utils";
import { toCsv } from "@/server/services/reports";

const NOW = new Date("2026-06-15T12:00:00.000Z");
const hours = (n: number) => new Date(NOW.getTime() + n * 60 * 60 * 1000);
const days = (n: number) => hours(n * 24);

describe("taskHealth", () => {
  it("calls a finished task completed, whatever its deadline", () => {
    expect(taskHealth({ status: "COMPLETED", progress: 100, dueAt: days(-10) }, NOW)).toBe("COMPLETED");
    expect(taskHealth({ status: "CANCELLED", progress: 20, dueAt: days(-10) }, NOW)).toBe("COMPLETED");
  });

  it("puts blocked ahead of overdue, because the reason matters more than the date", () => {
    expect(taskHealth({ status: "BLOCKED", progress: 40, dueAt: days(-3) }, NOW)).toBe("BLOCKED");
  });

  it("calls a passed deadline overdue", () => {
    expect(taskHealth({ status: "IN_PROGRESS", progress: 90, dueAt: hours(-1) }, NOW)).toBe("OVERDUE");
  });

  it("calls work due within a day at risk while it is unfinished", () => {
    expect(taskHealth({ status: "IN_PROGRESS", progress: 80, dueAt: hours(10) }, NOW)).toBe("AT_RISK");
    // At 100% it is simply waiting, not at risk.
    expect(taskHealth({ status: "IN_PROGRESS", progress: 100, dueAt: hours(10) }, NOW)).toBe("ON_TRACK");
  });

  it("calls work at risk when reported progress lags the elapsed schedule", () => {
    // 80% of the window has gone, only 20% reported: a 60-point gap.
    const behind = { status: "IN_PROGRESS" as const, progress: 20, startDate: days(-8), dueAt: days(2) };
    expect(taskHealth(behind, NOW)).toBe("AT_RISK");

    // 80% elapsed and 70% reported: a 10-point gap, inside tolerance.
    const keepingUp = { status: "IN_PROGRESS" as const, progress: 70, startDate: days(-8), dueAt: days(2) };
    expect(taskHealth(keepingUp, NOW)).toBe("ON_TRACK");
  });

  it("does not blame the assignee for a task already submitted", () => {
    expect(taskHealth({ status: "SUBMITTED_FOR_REVIEW", progress: 100, dueAt: hours(4) }, NOW)).toBe("ON_TRACK");
  });

  it("calls untouched work not started", () => {
    expect(taskHealth({ status: "ASSIGNED", progress: 0, dueAt: days(20) }, NOW)).toBe("NOT_STARTED");
    expect(taskHealth({ status: "DRAFT", progress: 0, dueAt: null }, NOW)).toBe("NOT_STARTED");
  });

  it("measures the elapsed fraction of the planned window", () => {
    expect(elapsedFraction({ status: "IN_PROGRESS", progress: 0, startDate: days(-5), dueAt: days(5) }, NOW)).toBeCloseTo(
      0.5,
      3,
    );
    // No window to measure against.
    expect(elapsedFraction({ status: "IN_PROGRESS", progress: 0, dueAt: days(5) }, NOW)).toBeNull();
    expect(elapsedFraction({ status: "IN_PROGRESS", progress: 0, startDate: days(-5), dueAt: null }, NOW)).toBeNull();
  });

  it("explains its verdict in words a person can act on", () => {
    const behind = { status: "IN_PROGRESS" as const, progress: 20, startDate: days(-8), dueAt: days(2) };
    expect(healthExplanation(behind, NOW)).toContain(`gap over ${AT_RISK_GAP_POINTS} points`);
    expect(healthExplanation({ status: "BLOCKED", progress: 0, dueAt: days(1) }, NOW)).toContain("blocker");
  });
});

describe("rollupProgress", () => {
  const assignee = (progress: number, overrides: Record<string, unknown> = {}) => ({
    isRequired: true,
    isPrimary: false,
    status: "IN_PROGRESS" as const,
    progress,
    ...overrides,
  });

  it("averages the required assignees", () => {
    expect(
      rollupProgress({
        progressMode: "MANUAL",
        completionRule: "ALL_REQUIRED",
        assignees: [assignee(100), assignee(0)],
        subtasks: [],
        fallback: 0,
      }),
    ).toBe(50);
  });

  it("ignores optional collaborators in the average", () => {
    expect(
      rollupProgress({
        progressMode: "MANUAL",
        completionRule: "ALL_REQUIRED",
        assignees: [assignee(100), assignee(0, { isRequired: false })],
        subtasks: [],
        fallback: 0,
      }),
    ).toBe(100);
  });

  it("follows only the primary owner under PRIMARY_ONLY", () => {
    expect(
      rollupProgress({
        progressMode: "MANUAL",
        completionRule: "PRIMARY_ONLY",
        assignees: [assignee(30, { isPrimary: true }), assignee(90)],
        subtasks: [],
        fallback: 0,
      }),
    ).toBe(30);
  });

  it("counts ticked checklist items in checklist mode", () => {
    expect(
      rollupProgress({
        progressMode: "CHECKLIST",
        completionRule: "ALL_REQUIRED",
        assignees: [assignee(90)],
        subtasks: [{ isDone: true }, { isDone: true }, { isDone: false }],
        fallback: 0,
      }),
    ).toBe(67);
  });

  it("keeps the existing figure rather than inventing one when there is nothing to count", () => {
    expect(
      rollupProgress({
        progressMode: "CHECKLIST",
        completionRule: "ALL_REQUIRED",
        assignees: [],
        subtasks: [],
        fallback: 42,
      }),
    ).toBe(42);
    expect(
      rollupProgress({
        progressMode: "MANUAL",
        completionRule: "ALL_REQUIRED",
        assignees: [],
        subtasks: [],
        fallback: 17,
      }),
    ).toBe(17);
  });
});

describe("completion rules", () => {
  const rows = [
    { isRequired: true, isPrimary: true, status: "SUBMITTED" as const, progress: 100 },
    { isRequired: true, isPrimary: false, status: "IN_PROGRESS" as const, progress: 40 },
    { isRequired: false, isPrimary: false, status: "ASSIGNED" as const, progress: 0 },
  ];
  const finished = (status: string) => status === "SUBMITTED" || status === "COMPLETED";

  it("requires every required assignee under ALL_REQUIRED", () => {
    expect(isCompletionRuleSatisfied("ALL_REQUIRED", rows, finished)).toBe(false);
    const allDone = rows.map((row) => (row.isRequired ? { ...row, status: "SUBMITTED" as const } : row));
    expect(isCompletionRuleSatisfied("ALL_REQUIRED", allDone, finished)).toBe(true);
  });

  it("needs only one under ANY_ONE", () => {
    expect(isCompletionRuleSatisfied("ANY_ONE", rows, finished)).toBe(true);
  });

  it("needs only the primary owner under PRIMARY_ONLY", () => {
    expect(isCompletionRuleSatisfied("PRIMARY_ONLY", rows, finished)).toBe(true);
    expect(countedAssignees("PRIMARY_ONLY", rows)).toHaveLength(1);
  });

  it("is never satisfied by an empty task", () => {
    expect(isCompletionRuleSatisfied("ANY_ONE", [], finished)).toBe(false);
  });
});

describe("deriveTaskStatus", () => {
  const row = (status: string, overrides: Record<string, unknown> = {}) => ({
    isRequired: true,
    isPrimary: false,
    status: status as "ASSIGNED",
    progress: 0,
    ...overrides,
  });

  it("never overwrites a state only a manager may set", () => {
    for (const current of ["DRAFT", "COMPLETED", "CANCELLED"] as const) {
      expect(
        deriveTaskStatus({ current, reviewRequired: true, completionRule: "ALL_REQUIRED", assignees: [row("IN_PROGRESS")] }),
      ).toBeNull();
    }
  });

  it("escalates blocked above in progress", () => {
    expect(
      deriveTaskStatus({
        current: "IN_PROGRESS",
        reviewRequired: true,
        completionRule: "ALL_REQUIRED",
        assignees: [row("IN_PROGRESS"), row("BLOCKED")],
      }),
    ).toBe("BLOCKED");
  });

  it("goes to review when the rule is met and review is required", () => {
    expect(
      deriveTaskStatus({
        current: "IN_PROGRESS",
        reviewRequired: true,
        completionRule: "ALL_REQUIRED",
        assignees: [row("SUBMITTED")],
      }),
    ).toBe("SUBMITTED_FOR_REVIEW");
  });

  it("completes directly when no review is required", () => {
    expect(
      deriveTaskStatus({
        current: "IN_PROGRESS",
        reviewRequired: false,
        completionRule: "ALL_REQUIRED",
        assignees: [row("SUBMITTED")],
      }),
    ).toBe("COMPLETED");
  });

  it("reports changes requested while somebody is reworking", () => {
    expect(
      deriveTaskStatus({
        current: "SUBMITTED_FOR_REVIEW",
        reviewRequired: true,
        completionRule: "ALL_REQUIRED",
        assignees: [row("CHANGES_REQUESTED")],
      }),
    ).toBe("CHANGES_REQUESTED");
  });

  it("falls back to acknowledged once everyone has seen it", () => {
    expect(
      deriveTaskStatus({
        current: "ASSIGNED",
        reviewRequired: true,
        completionRule: "ALL_REQUIRED",
        assignees: [row("ACKNOWLEDGED"), row("ACKNOWLEDGED")],
      }),
    ).toBe("ACKNOWLEDGED");
    expect(
      deriveTaskStatus({
        current: "ASSIGNED",
        reviewRequired: true,
        completionRule: "ALL_REQUIRED",
        assignees: [row("ACKNOWLEDGED"), row("ASSIGNED")],
      }),
    ).toBe("ASSIGNED");
  });
});

describe("workloadScore", () => {
  it("weights by priority and divides shared work", () => {
    const result = workloadScore([
      { priorityWeight: 4, requiredAssignees: 1, estimateHours: 8 },
      { priorityWeight: 2, requiredAssignees: 2, estimateHours: 10 },
    ]);
    expect(result.weighted).toBe(5); // 4 + (2 / 2)
    expect(result.hours).toBe(13); // 8 + (10 / 2)
  });

  it("is zero for an empty list", () => {
    expect(workloadScore([])).toEqual({ weighted: 0, hours: 0 });
  });

  it("treats a missing assignee count as one person", () => {
    expect(workloadScore([{ priorityWeight: 3, requiredAssignees: 0 }]).weighted).toBe(3);
  });
});

describe("isUpdateOverdue", () => {
  it("is never overdue without a cadence", () => {
    expect(isUpdateOverdue({ updateCadence: "NONE", lastProgressAt: days(-30) }, NOW)).toBe(false);
    expect(isUpdateOverdue({ updateCadence: "ON_STATUS_CHANGE", lastProgressAt: days(-30) }, NOW)).toBe(false);
  });

  it("uses the daily and weekly windows", () => {
    expect(isUpdateOverdue({ updateCadence: "DAILY", lastProgressAt: hours(-30) }, NOW)).toBe(true);
    expect(isUpdateOverdue({ updateCadence: "DAILY", lastProgressAt: hours(-6) }, NOW)).toBe(false);
    expect(isUpdateOverdue({ updateCadence: "WEEKLY", lastProgressAt: days(-8) }, NOW)).toBe(true);
    expect(isUpdateOverdue({ updateCadence: "WEEKLY", lastProgressAt: days(-3) }, NOW)).toBe(false);
  });

  it("falls back to the assignment date when nothing has been reported", () => {
    expect(isUpdateOverdue({ updateCadence: "DAILY", lastProgressAt: null, assignedAt: hours(-40) }, NOW)).toBe(true);
    expect(isUpdateOverdue({ updateCadence: "DAILY", lastProgressAt: null, assignedAt: hours(-2) }, NOW)).toBe(false);
  });
});

describe("dates", () => {
  it("compares deadlines as absolute instants", () => {
    expect(isOverdue("2026-06-15T11:59:00.000Z", NOW)).toBe(true);
    expect(isOverdue("2026-06-15T12:01:00.000Z", NOW)).toBe(false);
    expect(isOverdue(null, NOW)).toBe(false);
  });

  it("describes the distance to a deadline in both directions", () => {
    expect(formatDueDistance(hours(5), NOW)).toBe("5 h left");
    expect(formatDueDistance(hours(-5), NOW)).toBe("5 h overdue");
    expect(formatDueDistance(days(4), NOW)).toBe("4 days left");
    expect(formatDueDistance(null, NOW)).toBe("No deadline");
  });

  it("shows one instant differently in two zones, without moving it", () => {
    const instant = new Date("2026-06-15T23:30:00.000Z");
    expect(formatDateTime(instant, "UTC")).toBe("15 Jun 2026, 23:30");
    expect(formatDateTime(instant, "Asia/Tokyo")).toBe("16 Jun 2026, 08:30");
    expect(formatDate(instant, "America/Los_Angeles")).toBe("15 Jun 2026");
  });

  it("reads date and datetime-local inputs as UTC", () => {
    expect(parseDateInput("2026-06-15")?.toISOString()).toBe("2026-06-15T00:00:00.000Z");
    expect(parseDateInput("2026-06-15T09:30")?.toISOString()).toBe("2026-06-15T09:30:00.000Z");
    expect(parseDateInput("")).toBeNull();
    expect(parseDateInput("not a date")).toBeNull();
  });
});

describe("number and string helpers", () => {
  it("clamps and rounds percentages", () => {
    expect(pct(50.4)).toBe(50);
    expect(pct(-10)).toBe(0);
    expect(pct(140)).toBe(100);
  });

  it("returns zero rather than NaN for an empty base", () => {
    expect(ratioPct(3, 0)).toBe(0);
    expect(ratioPct(1, 3)).toBe(33);
  });

  it("slugifies and truncates predictably", () => {
    expect(slugify("Customer Success & Support!")).toBe("customer-success-support");
    expect(truncate("abcdefghij", 5)).toBe("abcd…");
    expect(truncate("abc", 5)).toBe("abc");
  });
});

describe("CSV export", () => {
  it("quotes separators, newlines and quotes", () => {
    const csv = toCsv([{ a: 'say "hi"', b: "one,two", c: "line\nbreak" }]);
    expect(csv).toBe('a,b,c\n"say ""hi""","one,two","line\nbreak"\n');
  });

  it("neutralises values a spreadsheet would treat as a formula", () => {
    const csv = toCsv([{ title: "=SUM(A1:A9)" }]);
    expect(csv).toContain("'=SUM(A1:A9)");
  });

  it("writes a header row even with no data", () => {
    expect(toCsv([], ["code", "title"])).toBe("code,title\n");
  });
});
