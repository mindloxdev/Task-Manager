/**
 * The end-to-end workflows the specification asks for, in order:
 *
 *  1. Owner creates a team and invites an employee
 *  2. Owner assigns a task to an individual
 *  3. Owner assigns a task to a team
 *  4. An employee acknowledges and starts a task
 *  5. An employee updates task progress
 *  6. An employee reports a blocker
 *  7. An employee submits work for review
 *  8. A manager requests changes
 *  9. An employee resubmits
 * 10. A manager approves
 * 11. The system identifies overdue tasks
 * 12. Unauthorised users cannot access or modify restricted tasks
 * 13. Notifications are created for the correct users
 * 14. Progress and analytics calculations are correct
 *
 * Each test drives the real service layer against a real database.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { acceptInvite, inviteUser, listEmployees } from "@/server/services/users";
import { addMember, createTeam as createTeamService, listTeamSummaries } from "@/server/services/teams";
import {
  acknowledgeTask,
  cancelTask,
  changeDeadline,
  createTask,
  getTaskDetail,
  listTasks,
  recomputeRollup,
  setAssignees,
  startTask,
  toggleSubtask,
  updateTask,
} from "@/server/services/tasks";
import { postProgressUpdate, reportBlocker, requestUpdates } from "@/server/services/progress";
import { decideReview, listAwaitingReview, submitForReview } from "@/server/services/reviews";
import { runReminderSweep } from "@/server/services/reminders";
import { getReport } from "@/server/services/reports";
import { getDashboard } from "@/server/services/dashboard";
import { taskFilterSchema } from "@/lib/validation";
import {
  assigneeRow,
  daysFromNow,
  hoursFromNow,
  notificationsFor,
  seedCompany,
  session,
  taskInput,
  taskRow,
  type Company,
} from "./helpers";

let co: Company;

beforeEach(async () => {
  co = await seedCompany();
});

// ---------------------------------------------------------------------------
describe("1. Owner creates a team and invites an employee", () => {
  it("creates the team with a lead and notifies the members", async () => {
    const team = await createTeamService(co.owner, {
      name: "Research",
      description: "User research and discovery.",
      color: "#0F766E",
      leadIds: [co.manager.id],
      memberIds: [co.employee.id],
    });

    const stored = await prisma.team.findUniqueOrThrow({
      where: { id: team.id },
      include: { memberships: true },
    });
    expect(stored.name).toBe("Research");
    expect(stored.memberships).toHaveLength(2);
    expect(stored.memberships.find((m) => m.userId === co.manager.id)?.role).toBe("LEAD");

    const notices = await notificationsFor(co.employee.id, "TEAM_MEMBERSHIP");
    expect(notices).toHaveLength(1);
  });

  it("invites an employee who cannot sign in until they accept", async () => {
    const result = await inviteUser(co.owner, {
      email: "new.person@test.local",
      name: "Nina New",
      jobTitle: "Analyst",
      role: "EMPLOYEE",
      teamIds: [co.teamId],
      weeklyHours: 40,
      timezone: "UTC",
    });

    expect(result.inviteToken).toBeTruthy();
    expect(result.user.status).toBe("INVITED");
    expect(result.user.passwordHash).toBeNull();

    const accepted = await acceptInvite({
      token: result.inviteToken,
      name: "Nina New",
      password: "a-very-good-password-1",
    });
    expect(accepted.status).toBe("ACTIVE");
    expect(accepted.passwordHash).toBeTruthy();
    expect(accepted.inviteToken).toBeNull();

    // The token is single use.
    await expect(
      acceptInvite({ token: result.inviteToken, name: "Nina New", password: "another-password-1" }),
    ).rejects.toThrow(AppError);
  });

  it("refuses to invite someone twice with the same address", async () => {
    await expect(
      inviteUser(co.owner, {
        email: co.employee.email,
        name: "Duplicate",
        jobTitle: null,
        role: "EMPLOYEE",
        teamIds: [],
        weeklyHours: 40,
        timezone: "UTC",
      }),
    ).rejects.toThrow(/already has an account/i);
  });

  it("will not let a manager invite people", async () => {
    await expect(
      inviteUser(co.manager, {
        email: "sneaky@test.local",
        name: "Sneaky",
        jobTitle: null,
        role: "OWNER",
        teamIds: [],
        weeklyHours: 40,
        timezone: "UTC",
      }),
    ).rejects.toThrow(/only the company owner/i);
  });
});

// ---------------------------------------------------------------------------
describe("2. Owner assigns a task to an individual", () => {
  it("creates one task record with one accountable assignee", async () => {
    const task = await createTask(
      co.owner,
      taskInput({
        title: "Write the quarterly summary",
        teamId: co.teamId,
        assignmentType: "INDIVIDUAL",
        assigneeIds: [co.employee.id],
        dueAt: daysFromNow(5),
      }),
    );

    expect(task.status).toBe("ASSIGNED");
    expect(task.code).toMatch(/^TST-\d{3}$/);
    expect(task.assignedAt).not.toBeNull();
    expect(task.originalDueAt?.getTime()).toBe(task.dueAt?.getTime());

    const stored = await taskRow(task.id);
    expect(stored.assignees).toHaveLength(1);
    expect(stored.assignees[0].userId).toBe(co.employee.id);
    expect(stored.assignees[0].isPrimary).toBe(true);
    expect(stored.assignees[0].status).toBe("ASSIGNED");

    // One task row, never one per person.
    expect(await prisma.task.count()).toBe(1);
  });

  it("notifies the assignee and nobody else", async () => {
    await createTask(
      co.owner,
      taskInput({ teamId: co.teamId, assigneeIds: [co.employee.id], dueAt: daysFromNow(3) }),
    );

    expect(await notificationsFor(co.employee.id, "TASK_ASSIGNED")).toHaveLength(1);
    expect(await notificationsFor(co.employee2.id, "TASK_ASSIGNED")).toHaveLength(0);
    // The actor is never notified about their own action.
    expect(await notificationsFor(co.owner.id, "TASK_ASSIGNED")).toHaveLength(0);
  });

  it("rejects an individual task with two assignees", async () => {
    await expect(
      createTask(
        co.owner,
        taskInput({
          teamId: co.teamId,
          assignmentType: "INDIVIDUAL",
          assigneeIds: [co.employee.id, co.employee2.id],
        }),
      ),
    ).rejects.toThrow();
  });

  it("refuses to assign work to a deactivated account", async () => {
    await prisma.user.update({ where: { id: co.employee.id }, data: { status: "DEACTIVATED" } });
    await expect(
      createTask(co.owner, taskInput({ teamId: co.teamId, assigneeIds: [co.employee.id] })),
    ).rejects.toThrow(/not an active employee/i);
  });

  it("collapses a duplicated assignee into a single assignment", async () => {
    const task = await createTask(
      co.owner,
      taskInput({
        teamId: co.teamId,
        assignmentType: "MULTIPLE",
        assigneeIds: [co.employee.id, co.employee.id, co.employee2.id],
      }),
    );
    const stored = await taskRow(task.id);
    expect(stored.assignees).toHaveLength(2);
  });

  it("saves a draft without notifying anyone", async () => {
    const task = await createTask(
      co.owner,
      taskInput({ teamId: co.teamId, assigneeIds: [co.employee.id], asDraft: true }),
    );
    expect(task.status).toBe("DRAFT");
    expect(task.assignedAt).toBeNull();
    expect(await notificationsFor(co.employee.id, "TASK_ASSIGNED")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe("3. Owner assigns a task to a team", () => {
  it("gives every active member their own assignment row on one task", async () => {
    const task = await createTask(
      co.owner,
      taskInput({
        title: "Quarterly dependency upgrade",
        teamId: co.teamId,
        assignmentType: "TEAM",
        assigneeIds: [],
        primaryOwnerId: co.employee.id,
        dueAt: daysFromNow(7),
      }),
    );

    const stored = await taskRow(task.id);
    // Manager (lead) plus both employees.
    expect(stored.assignees).toHaveLength(3);
    expect(stored.assignees.every((a) => a.viaTeam || a.userId === co.employee.id)).toBe(true);
    expect(stored.primaryOwnerId).toBe(co.employee.id);
    expect(await prisma.task.count()).toBe(1);

    for (const assignee of stored.assignees) {
      if (assignee.userId === co.owner.id) continue;
      expect(await notificationsFor(assignee.userId, "TASK_ASSIGNED")).toHaveLength(1);
    }
  });

  it("does not complete a shared task when only one member finishes", async () => {
    const task = await createTask(
      co.owner,
      taskInput({
        teamId: co.teamId,
        assignmentType: "MULTIPLE",
        assigneeIds: [co.employee.id, co.employee2.id],
        completionRule: "ALL_REQUIRED",
        dueAt: daysFromNow(4),
      }),
    );

    await submitForReview(co.employee, task.id, { summary: "My half is done.", linkUrl: null });

    const stored = await taskRow(task.id);
    expect(stored.status).not.toBe("SUBMITTED_FOR_REVIEW");
    expect(stored.status).not.toBe("COMPLETED");
    expect(stored.reviews).toHaveLength(0);
    expect((await assigneeRow(task.id, co.employee.id)).status).toBe("SUBMITTED");
    expect((await assigneeRow(task.id, co.employee2.id)).status).toBe("ASSIGNED");

    // Once the second person submits, the review round opens.
    await submitForReview(co.employee2, task.id, { summary: "And my half.", linkUrl: null });
    const after = await taskRow(task.id);
    expect(after.status).toBe("SUBMITTED_FOR_REVIEW");
    expect(after.reviews).toHaveLength(1);
  });

  it("honours the ANY_ONE completion rule", async () => {
    const task = await createTask(
      co.owner,
      taskInput({
        teamId: co.teamId,
        assignmentType: "MULTIPLE",
        assigneeIds: [co.employee.id, co.employee2.id],
        completionRule: "ANY_ONE",
        reviewRequired: false,
      }),
    );

    await submitForReview(co.employee, task.id, { summary: "Picked this one up.", linkUrl: null });
    const stored = await taskRow(task.id);
    expect(stored.status).toBe("COMPLETED");
    expect(stored.completedAt).not.toBeNull();
  });

  it("refuses a team assignment when the team has no active members", async () => {
    const emptyTeamId = await (async () => {
      const team = await prisma.team.create({ data: { name: "Empty", slug: "empty" } });
      return team.id;
    })();

    await expect(
      createTask(co.owner, taskInput({ teamId: emptyTeamId, assignmentType: "TEAM", assigneeIds: [] })),
    ).rejects.toThrow(/no active members/i);
  });
});

// ---------------------------------------------------------------------------
describe("4. An employee acknowledges and starts a task", () => {
  it("records both transitions with timestamps and rolls the task up", async () => {
    const task = await createTask(
      co.owner,
      taskInput({ teamId: co.teamId, assigneeIds: [co.employee.id], dueAt: daysFromNow(6) }),
    );

    await acknowledgeTask(co.employee, task.id);
    let stored = await taskRow(task.id);
    expect(stored.status).toBe("ACKNOWLEDGED");
    expect(stored.acknowledgedAt).not.toBeNull();
    expect((await assigneeRow(task.id, co.employee.id)).acknowledgedAt).not.toBeNull();

    await startTask(co.employee, task.id);
    stored = await taskRow(task.id);
    expect(stored.status).toBe("IN_PROGRESS");
    expect(stored.startedAt).not.toBeNull();

    const activity = await prisma.activityLog.findMany({ where: { taskId: task.id }, orderBy: { createdAt: "asc" } });
    expect(activity.map((row) => row.action)).toEqual(
      expect.arrayContaining(["TASK_CREATED", "TASK_ASSIGNED", "TASK_ACKNOWLEDGED", "TASK_STARTED"]),
    );
  });

  it("will not let the same person acknowledge twice", async () => {
    const task = await createTask(co.owner, taskInput({ teamId: co.teamId, assigneeIds: [co.employee.id] }));
    await acknowledgeTask(co.employee, task.id);
    await expect(acknowledgeTask(co.employee, task.id)).rejects.toThrow(/already acknowledged/i);
  });

  it("will not let a non-assignee acknowledge", async () => {
    const task = await createTask(co.owner, taskInput({ teamId: co.teamId, assigneeIds: [co.employee.id] }));
    await expect(acknowledgeTask(co.employee2, task.id)).rejects.toThrow(/only an assignee/i);
  });

  it("will not let anyone acknowledge a draft", async () => {
    const task = await createTask(
      co.owner,
      taskInput({ teamId: co.teamId, assigneeIds: [co.employee.id], asDraft: true }),
    );
    await expect(acknowledgeTask(co.employee, task.id)).rejects.toThrow(/not been assigned/i);
  });
});

// ---------------------------------------------------------------------------
describe("5. An employee updates task progress", () => {
  it("stores the report and uses the reported figure, never an invented one", async () => {
    const task = await createTask(
      co.owner,
      taskInput({ teamId: co.teamId, assigneeIds: [co.employee.id], dueAt: daysFromNow(5) }),
    );

    await postProgressUpdate(co.employee, task.id, {
      progress: 40,
      workCompleted: "Drafted the first two sections.",
      workRemaining: "The appendix.",
      blockers: null,
      helpNeeded: null,
      expectedCompletion: daysFromNow(3),
      linkUrl: "https://example.com/draft",
      updateRequestId: null,
    });

    const stored = await taskRow(task.id);
    expect(stored.progress).toBe(40);
    expect(stored.status).toBe("IN_PROGRESS");
    expect(stored.lastProgressAt).not.toBeNull();

    const updates = await prisma.progressUpdate.findMany({ where: { taskId: task.id } });
    expect(updates).toHaveLength(1);
    expect(updates[0].workCompleted).toBe("Drafted the first two sections.");
    expect(updates[0].progress).toBe(40);
  });

  it("averages the required assignees on a shared task", async () => {
    const task = await createTask(
      co.owner,
      taskInput({
        teamId: co.teamId,
        assignmentType: "MULTIPLE",
        assigneeIds: [co.employee.id, co.employee2.id],
      }),
    );

    await postProgressUpdate(co.employee, task.id, progressPayload(80));
    expect((await taskRow(task.id)).progress).toBe(40); // (80 + 0) / 2

    await postProgressUpdate(co.employee2, task.id, progressPayload(60));
    expect((await taskRow(task.id)).progress).toBe(70); // (80 + 60) / 2
  });

  it("counts progress from the checklist when that is the configured source", async () => {
    const task = await createTask(
      co.owner,
      taskInput({
        teamId: co.teamId,
        assigneeIds: [co.employee.id],
        progressMode: "CHECKLIST",
        subtasks: [
          { title: "One", isDone: false },
          { title: "Two", isDone: false },
          { title: "Three", isDone: false },
          { title: "Four", isDone: false },
        ],
      }),
    );
    expect((await taskRow(task.id)).progress).toBe(0);

    const subtasks = await prisma.subtask.findMany({ where: { taskId: task.id }, orderBy: { position: "asc" } });
    await toggleSubtask(co.employee, subtasks[0].id, true);
    expect((await taskRow(task.id)).progress).toBe(25);

    await toggleSubtask(co.employee, subtasks[1].id, true);
    expect((await taskRow(task.id)).progress).toBe(50);

    // A hand-typed figure is ignored in checklist mode.
    await postProgressUpdate(co.employee, task.id, progressPayload(99));
    expect((await taskRow(task.id)).progress).toBe(50);

    await toggleSubtask(co.employee, subtasks[1].id, false);
    expect((await taskRow(task.id)).progress).toBe(25);
  });

  it("rejects a percentage outside 0–100", async () => {
    const task = await createTask(co.owner, taskInput({ teamId: co.teamId, assigneeIds: [co.employee.id] }));
    const { progressUpdateSchema } = await import("@/lib/validation");
    expect(progressUpdateSchema.safeParse({ progress: 140 }).success).toBe(false);
    expect(progressUpdateSchema.safeParse({ progress: -5 }).success).toBe(false);
    expect(progressUpdateSchema.safeParse({ progress: 55 }).success).toBe(true);
    void task;
  });

  it("marks a manager's update request answered when the assignee replies", async () => {
    const task = await createTask(
      co.owner,
      taskInput({ teamId: co.teamId, assigneeIds: [co.employee.id], dueAt: daysFromNow(2) }),
    );

    await requestUpdates(co.manager, task.id, {
      userIds: [co.employee.id],
      message: "Where is this up to?",
      dueAt: null,
    });

    let request = await prisma.updateRequest.findFirstOrThrow({ where: { taskId: task.id } });
    expect(request.respondedAt).toBeNull();
    expect(await notificationsFor(co.employee.id, "UPDATE_REQUESTED")).toHaveLength(1);

    await postProgressUpdate(co.employee, task.id, { ...progressPayload(55), updateRequestId: request.id });

    request = await prisma.updateRequest.findFirstOrThrow({ where: { taskId: task.id } });
    expect(request.respondedAt).not.toBeNull();
    expect(await notificationsFor(co.manager.id, "UPDATE_PROVIDED")).toHaveLength(1);
  });

  it("will not stack a second open update request on the same person", async () => {
    const task = await createTask(co.owner, taskInput({ teamId: co.teamId, assigneeIds: [co.employee.id] }));
    await requestUpdates(co.manager, task.id, { userIds: [co.employee.id], message: null, dueAt: null });
    await expect(
      requestUpdates(co.manager, task.id, { userIds: [co.employee.id], message: null, dueAt: null }),
    ).rejects.toThrow(/already have an open update request/i);
  });

  it("will not let a non-assignee report progress", async () => {
    const task = await createTask(co.owner, taskInput({ teamId: co.teamId, assigneeIds: [co.employee.id] }));
    await expect(postProgressUpdate(co.employee2, task.id, progressPayload(50))).rejects.toThrow(
      /only an assignee/i,
    );
  });
});

// ---------------------------------------------------------------------------
describe("6. An employee reports a blocker", () => {
  it("blocks the task, records the reason and alerts the managers", async () => {
    const task = await createTask(
      co.owner,
      taskInput({ teamId: co.teamId, assigneeIds: [co.employee.id], dueAt: daysFromNow(3) }),
    );

    await reportBlocker(co.employee, task.id, {
      reason: "The staging database keeps dropping connections.",
      helpNeeded: "A bigger staging instance for a day.",
      progress: 35,
    });

    const stored = await taskRow(task.id);
    expect(stored.status).toBe("BLOCKED");
    expect(stored.blockedAt).not.toBeNull();
    expect(stored.progress).toBe(35);
    expect((await assigneeRow(task.id, co.employee.id)).status).toBe("BLOCKED");

    const blockerUpdate = await prisma.progressUpdate.findFirstOrThrow({ where: { taskId: task.id, kind: "BLOCKER" } });
    expect(blockerUpdate.blockers).toContain("dropping connections");

    expect(await notificationsFor(co.owner.id, "BLOCKER_REPORTED")).toHaveLength(1);
    expect(await notificationsFor(co.manager.id, "BLOCKER_REPORTED")).toHaveLength(1);
  });

  it("blocks the whole task when any required assignee is blocked", async () => {
    const task = await createTask(
      co.owner,
      taskInput({
        teamId: co.teamId,
        assignmentType: "MULTIPLE",
        assigneeIds: [co.employee.id, co.employee2.id],
      }),
    );
    await postProgressUpdate(co.employee2, task.id, progressPayload(70));
    await reportBlocker(co.employee, task.id, { reason: "Waiting on legal.", helpNeeded: null, progress: 10 });
    expect((await taskRow(task.id)).status).toBe("BLOCKED");
  });

  it("treats a blocker written into an ordinary update the same way", async () => {
    const task = await createTask(co.owner, taskInput({ teamId: co.teamId, assigneeIds: [co.employee.id] }));
    await postProgressUpdate(co.employee, task.id, {
      ...progressPayload(20),
      blockers: "The API credentials have expired.",
    });
    expect((await taskRow(task.id)).status).toBe("BLOCKED");
  });
});

// ---------------------------------------------------------------------------
describe("7–10. Submit, request changes, resubmit, approve", () => {
  async function setupSubmitted() {
    const task = await createTask(
      co.owner,
      taskInput({
        title: "Fix the duplicate notification bug",
        teamId: co.teamId,
        assigneeIds: [co.employee.id],
        dueAt: daysFromNow(2),
      }),
    );
    await acknowledgeTask(co.employee, task.id);
    await startTask(co.employee, task.id);
    await submitForReview(co.employee, task.id, {
      summary: "Fixed the double write and added a test.",
      linkUrl: "https://example.com/pr/1",
    });
    return task;
  }

  it("7. submission opens a review round and notifies the reviewers", async () => {
    const task = await setupSubmitted();
    const stored = await taskRow(task.id);

    expect(stored.status).toBe("SUBMITTED_FOR_REVIEW");
    expect(stored.submittedAt).not.toBeNull();
    expect(stored.progress).toBe(100);
    expect(stored.reviews).toHaveLength(1);
    expect(stored.reviews[0].round).toBe(1);
    expect(stored.reviews[0].decision).toBe("PENDING");
    expect(stored.reviews[0].summary).toContain("double write");

    // The completion summary is kept as a progress entry too.
    const submission = await prisma.progressUpdate.findFirstOrThrow({ where: { taskId: task.id, kind: "SUBMISSION" } });
    expect(submission.progress).toBe(100);

    // The deliverable link becomes an attachment.
    const attachments = await prisma.attachment.findMany({ where: { taskId: task.id } });
    expect(attachments).toHaveLength(1);
    expect(attachments[0].url).toBe("https://example.com/pr/1");

    expect(await notificationsFor(co.manager.id, "SUBMITTED_FOR_REVIEW")).toHaveLength(1);
    expect(await notificationsFor(co.owner.id, "SUBMITTED_FOR_REVIEW")).toHaveLength(1);
  });

  it("7b. the submitter cannot approve their own work", async () => {
    const task = await createTask(
      co.owner,
      taskInput({ teamId: co.teamId, assigneeIds: [co.manager.id], dueAt: daysFromNow(2) }),
    );
    // The manager is both the lead of this team and the assignee here.
    await submitForReview(co.manager, task.id, { summary: "Done it myself.", linkUrl: null });

    await expect(
      decideReview(co.manager, task.id, { decision: "APPROVED", feedback: null }),
    ).rejects.toThrow(/cannot review work you submitted/i);

    // Another authorised reviewer can.
    await decideReview(co.owner, task.id, { decision: "APPROVED", feedback: null });
    expect((await taskRow(task.id)).status).toBe("COMPLETED");
  });

  it("8. requesting changes returns the task to the assignee with feedback", async () => {
    const task = await setupSubmitted();

    await decideReview(co.manager, task.id, {
      decision: "CHANGES_REQUESTED",
      feedback: "No regression test for the reassign path.",
    });

    const stored = await taskRow(task.id);
    expect(stored.status).toBe("CHANGES_REQUESTED");
    expect(stored.reviewedAt).not.toBeNull();
    expect(stored.completedAt).toBeNull();
    expect(stored.reviews[0].decision).toBe("CHANGES_REQUESTED");
    expect(stored.reviews[0].feedback).toContain("regression test");
    expect(stored.reviews[0].decidedById).toBe(co.manager.id);

    const assignee = await assigneeRow(task.id, co.employee.id);
    expect(assignee.status).toBe("CHANGES_REQUESTED");
    expect(assignee.submittedAt).toBeNull();

    const notices = await notificationsFor(co.employee.id, "CHANGES_REQUESTED");
    expect(notices).toHaveLength(1);
    expect(notices[0].body).toContain("regression test");
  });

  it("9. resubmission opens a second round and keeps the first", async () => {
    const task = await setupSubmitted();
    await decideReview(co.manager, task.id, { decision: "CHANGES_REQUESTED", feedback: "Add a test." });

    await startTask(co.employee, task.id);
    expect((await taskRow(task.id)).status).toBe("IN_PROGRESS");

    await submitForReview(co.employee, task.id, { summary: "Test added.", linkUrl: null });

    const stored = await taskRow(task.id);
    expect(stored.status).toBe("SUBMITTED_FOR_REVIEW");
    expect(stored.reviews).toHaveLength(2);
    expect(stored.reviews.map((r) => r.round).sort()).toEqual([1, 2]);
    const round1 = stored.reviews.find((r) => r.round === 1)!;
    expect(round1.decision).toBe("CHANGES_REQUESTED");
    expect(round1.feedback).toBe("Add a test.");
  });

  it("10. approval completes the task at 100% and records who approved", async () => {
    const task = await setupSubmitted();
    await decideReview(co.manager, task.id, { decision: "APPROVED", feedback: "Looks good." });

    const stored = await taskRow(task.id);
    expect(stored.status).toBe("COMPLETED");
    expect(stored.progress).toBe(100);
    expect(stored.completedAt).not.toBeNull();
    expect(stored.reviewedAt).not.toBeNull();
    expect(stored.assignees.every((a) => a.status === "COMPLETED")).toBe(true);
    expect(stored.reviews[0].decidedById).toBe(co.manager.id);

    expect(await notificationsFor(co.employee.id, "TASK_APPROVED")).toHaveLength(1);
  });

  it("10b. a completed task cannot be edited back open", async () => {
    const task = await setupSubmitted();
    await decideReview(co.manager, task.id, { decision: "APPROVED", feedback: null });

    // The rollup must not drag a completed task back to another status.
    const rollup = await recomputeRollup(task.id);
    expect(rollup.status).toBe("COMPLETED");

    await expect(cancelTask(co.manager, task.id, "changed my mind")).rejects.toThrow(/completed task cannot be cancelled/i);
  });

  it("10c. a task with review turned off completes on submission", async () => {
    const task = await createTask(
      co.owner,
      taskInput({ teamId: co.teamId, assigneeIds: [co.employee.id], reviewRequired: false }),
    );
    await submitForReview(co.employee, task.id, { summary: "Weekly report sent.", linkUrl: null });

    const stored = await taskRow(task.id);
    expect(stored.status).toBe("COMPLETED");
    expect(stored.reviews).toHaveLength(0);
  });

  it("10d. an approved recurring task opens its next occurrence", async () => {
    const task = await createTask(
      co.owner,
      taskInput({
        title: "Weekly performance report",
        teamId: co.teamId,
        assigneeIds: [co.employee.id],
        recurrence: "WEEKLY",
        dueAt: daysFromNow(2),
      }),
    );
    await submitForReview(co.employee, task.id, { summary: "Sent.", linkUrl: null });
    await decideReview(co.manager, task.id, { decision: "APPROVED", feedback: null });

    const occurrences = await prisma.task.findMany({ where: { recurrenceParentId: task.id } });
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].status).toBe("ASSIGNED");
    expect(occurrences[0].dueAt!.getTime()).toBeGreaterThan(task.dueAt!.getTime());
  });

  it("surfaces the pending review to the people who may decide it", async () => {
    const task = await setupSubmitted();

    const forManager = await listAwaitingReview(co.manager);
    expect(forManager.map((r) => r.taskId)).toContain(task.id);

    const forOtherManager = await listAwaitingReview(co.otherManager);
    expect(forOtherManager.map((r) => r.taskId)).not.toContain(task.id);

    const forSubmitter = await listAwaitingReview(co.employee);
    expect(forSubmitter.map((r) => r.taskId)).not.toContain(task.id);
  });
});

// ---------------------------------------------------------------------------
describe("11. The system identifies overdue tasks", () => {
  it("flags a passed deadline as overdue and notifies once per deadline", async () => {
    const task = await createTask(
      co.owner,
      taskInput({ teamId: co.teamId, assigneeIds: [co.employee.id], dueAt: hoursFromNow(-5) }),
    );
    await postProgressUpdate(co.employee, task.id, progressPayload(50));

    const first = await runReminderSweep();
    expect(first.overdueNotices).toBeGreaterThan(0);
    expect(await notificationsFor(co.employee.id, "TASK_OVERDUE")).toHaveLength(1);

    // Running the sweep again must not notify anyone a second time.
    const second = await runReminderSweep();
    expect(second.overdueNotices).toBe(0);
    expect(await notificationsFor(co.employee.id, "TASK_OVERDUE")).toHaveLength(1);

    const activity = await prisma.activityLog.findMany({ where: { taskId: task.id, action: "TASK_BECAME_OVERDUE" } });
    expect(activity).toHaveLength(1);
  });

  it("sends one approaching-deadline reminder for the tightest window crossed", async () => {
    await prisma.notificationPreference.updateMany({ data: { reminderOffsets: "48,24,2" } });
    const task = await createTask(
      co.owner,
      taskInput({ teamId: co.teamId, assigneeIds: [co.employee.id], dueAt: hoursFromNow(20) }),
    );

    const result = await runReminderSweep();
    expect(result.deadlineReminders).toBe(1);

    const reminders = await notificationsFor(co.employee.id, "DEADLINE_APPROACHING");
    expect(reminders).toHaveLength(1);
    // Keyed to the 24-hour window, not 48 and not 2.
    expect(reminders[0].dedupeKey).toContain(":24");

    await runReminderSweep();
    expect(await notificationsFor(co.employee.id, "DEADLINE_APPROACHING")).toHaveLength(1);
    void task;
  });

  it("starts a fresh reminder series when the deadline moves", async () => {
    const task = await createTask(
      co.owner,
      taskInput({ teamId: co.teamId, assigneeIds: [co.employee.id], dueAt: hoursFromNow(20) }),
    );
    await runReminderSweep();
    expect(await notificationsFor(co.employee.id, "DEADLINE_APPROACHING")).toHaveLength(1);

    await changeDeadline(co.manager, task.id, { dueAt: hoursFromNow(23), reason: "Moved by one day." });
    await runReminderSweep();
    expect(await notificationsFor(co.employee.id, "DEADLINE_APPROACHING")).toHaveLength(2);
  });

  it("nudges an assignee whose daily update window has lapsed, once per window", async () => {
    const task = await createTask(
      co.owner,
      taskInput({
        teamId: co.teamId,
        assigneeIds: [co.employee.id],
        updateCadence: "DAILY",
        dueAt: hoursFromNow(72),
      }),
    );
    // Backdate the assignment so the daily window has passed.
    await prisma.task.update({ where: { id: task.id }, data: { assignedAt: hoursFromNow(-30) } });

    const first = await runReminderSweep();
    expect(first.updateNudges).toBe(1);
    const second = await runReminderSweep();
    expect(second.updateNudges).toBe(0);
  });

  it("reports health honestly on the dashboard and in the overdue filter", async () => {
    const overdue = await createTask(
      co.owner,
      taskInput({ teamId: co.teamId, assigneeIds: [co.employee.id], dueAt: hoursFromNow(-2) }),
    );
    const onTrack = await createTask(
      co.owner,
      taskInput({ teamId: co.teamId, assigneeIds: [co.employee2.id], dueAt: daysFromNow(20), startDate: new Date() }),
    );

    const dashboard = await getDashboard(co.owner);
    expect(dashboard.summary.overdue).toBe(1);
    expect(dashboard.deadlines.overdue.map((t) => t.id)).toEqual([overdue.id]);

    const filtered = await listTasks(co.owner, taskFilterSchema.parse({ health: "OVERDUE" }));
    expect(filtered.total).toBe(1);
    expect(filtered.items[0].id).toBe(overdue.id);

    const healthy = await listTasks(co.owner, taskFilterSchema.parse({ health: "NOT_STARTED" }));
    expect(healthy.items.map((t) => t.id)).toContain(onTrack.id);
  });
});

// ---------------------------------------------------------------------------
describe("12. Unauthorised users cannot access or modify restricted tasks", () => {
  it("hides another team's task from an unrelated employee", async () => {
    const task = await createTask(
      co.owner,
      taskInput({ teamId: co.teamId, assigneeIds: [co.employee.id], dueAt: daysFromNow(3) }),
    );

    await expect(getTaskDetail(co.outsider, task.id)).rejects.toThrow(/do not have access/i);

    const visible = await listTasks(co.outsider, taskFilterSchema.parse({}));
    expect(visible.items.map((t) => t.id)).not.toContain(task.id);

    // The owner and the team see it.
    expect((await listTasks(co.owner, taskFilterSchema.parse({}))).items.map((t) => t.id)).toContain(task.id);
    expect((await listTasks(co.employee2, taskFilterSchema.parse({}))).items.map((t) => t.id)).toContain(task.id);
  });

  it("stops an employee editing a task, even their own", async () => {
    const task = await createTask(co.owner, taskInput({ teamId: co.teamId, assigneeIds: [co.employee.id] }));

    await expect(updateTask(co.employee, task.id, { title: "Renamed by the assignee" })).rejects.toThrow(
      /only the task owner, a team lead/i,
    );
    await expect(changeDeadline(co.employee, task.id, { dueAt: daysFromNow(30), reason: null })).rejects.toThrow(
      AppError,
    );
    await expect(
      setAssignees(co.employee, task.id, {
        assigneeIds: [co.employee2.id],
        optionalAssigneeIds: [],
        primaryOwnerId: null,
      }),
    ).rejects.toThrow(AppError);
  });

  it("stops a manager acting outside the teams they lead", async () => {
    const task = await createTask(
      co.owner,
      taskInput({ teamId: co.teamId, assigneeIds: [co.employee.id], dueAt: daysFromNow(2) }),
    );

    await expect(updateTask(co.otherManager, task.id, { priority: "URGENT" })).rejects.toThrow(AppError);
    await expect(
      createTask(co.otherManager, taskInput({ teamId: co.teamId, assigneeIds: [co.employee.id] })),
    ).rejects.toThrow(/only create tasks for a team you lead/i);
  });

  it("stops an employee reviewing anything", async () => {
    const task = await createTask(co.owner, taskInput({ teamId: co.teamId, assigneeIds: [co.employee.id] }));
    await submitForReview(co.employee, task.id, { summary: "Done.", linkUrl: null });

    await expect(decideReview(co.employee2, task.id, { decision: "APPROVED", feedback: null })).rejects.toThrow(
      /only a team lead or the company owner/i,
    );
    expect((await taskRow(task.id)).status).toBe("SUBMITTED_FOR_REVIEW");
  });

  it("keeps a deactivated person out of the assignable pool", async () => {
    await prisma.user.update({ where: { id: co.employee2.id }, data: { status: "DEACTIVATED" } });
    const task = await createTask(
      co.owner,
      taskInput({ teamId: co.teamId, assignmentType: "TEAM", assigneeIds: [] }),
    );
    const stored = await taskRow(task.id);
    expect(stored.assignees.map((a) => a.userId)).not.toContain(co.employee2.id);
  });

  it("scopes the employee list to the teams a manager leads", async () => {
    const forManager = await listEmployees(co.manager);
    const ids = forManager.map((row) => row.id);
    expect(ids).toContain(co.employee.id);
    expect(ids).not.toContain(co.outsider.id);

    const forEmployee = await listEmployees(co.employee);
    expect(forEmployee.map((row) => row.id)).toEqual([co.employee.id]);
  });

  it("scopes team summaries to the teams a person belongs to", async () => {
    const forEmployee = await listTeamSummaries(co.employee);
    expect(forEmployee.map((t) => t.id)).toEqual([co.teamId]);

    const forOwner = await listTeamSummaries(co.owner);
    expect(forOwner).toHaveLength(2);
  });

  it("refuses to make someone a primary owner who is not an assignee", async () => {
    const task = await createTask(co.owner, taskInput({ teamId: co.teamId, assigneeIds: [co.employee.id] }));
    await expect(updateTask(co.owner, task.id, { primaryOwnerId: co.outsider.id })).rejects.toThrow(
      /must be one of the assignees/i,
    );
  });
});

// ---------------------------------------------------------------------------
describe("13. Notifications go to the correct users", () => {
  it("respects the recipient's preferences", async () => {
    await prisma.notificationPreference.update({
      where: { userId: co.employee.id },
      data: { notifyAssignment: false },
    });

    await createTask(co.owner, taskInput({ teamId: co.teamId, assigneeIds: [co.employee.id] }));
    expect(await notificationsFor(co.employee.id, "TASK_ASSIGNED")).toHaveLength(0);

    // Other topics still arrive.
    const task = await createTask(co.owner, taskInput({ teamId: co.teamId, assigneeIds: [co.employee.id] }));
    await requestUpdates(co.manager, task.id, { userIds: [co.employee.id], message: null, dueAt: null });
    expect(await notificationsFor(co.employee.id, "UPDATE_REQUESTED")).toHaveLength(1);
  });

  it("sends nothing at all when in-app notifications are switched off", async () => {
    await prisma.notificationPreference.update({
      where: { userId: co.employee.id },
      data: { inAppEnabled: false },
    });
    await createTask(co.owner, taskInput({ teamId: co.teamId, assigneeIds: [co.employee.id] }));
    expect(await notificationsFor(co.employee.id)).toHaveLength(0);
  });

  it("tells the assignees, not the actor, when a deadline moves", async () => {
    const task = await createTask(
      co.owner,
      taskInput({ teamId: co.teamId, assigneeIds: [co.employee.id], dueAt: daysFromNow(4) }),
    );

    await changeDeadline(co.manager, task.id, { dueAt: daysFromNow(8), reason: "Scope grew." });

    const forEmployee = await notificationsFor(co.employee.id, "DEADLINE_CHANGED");
    expect(forEmployee).toHaveLength(1);
    expect(forEmployee[0].body).toContain("Scope grew");
    expect(await notificationsFor(co.manager.id, "DEADLINE_CHANGED")).toHaveLength(0);
    // The task creator hears about it too.
    expect(await notificationsFor(co.owner.id, "DEADLINE_CHANGED")).toHaveLength(1);
  });

  it("keeps the original deadline and records who changed it", async () => {
    const original = daysFromNow(4);
    const task = await createTask(
      co.owner,
      taskInput({ teamId: co.teamId, assigneeIds: [co.employee.id], dueAt: original }),
    );

    await changeDeadline(co.manager, task.id, { dueAt: daysFromNow(9), reason: "Waiting on data." });
    await changeDeadline(co.owner, task.id, { dueAt: daysFromNow(12), reason: "And again." });

    const stored = await prisma.task.findUniqueOrThrow({
      where: { id: task.id },
      include: { deadlineChanges: { orderBy: { createdAt: "asc" } } },
    });

    expect(stored.originalDueAt!.getTime()).toBe(original.getTime());
    expect(stored.deadlineChanges).toHaveLength(2);
    expect(stored.deadlineChanges[0].changedById).toBe(co.manager.id);
    expect(stored.deadlineChanges[0].reason).toBe("Waiting on data.");
    expect(stored.deadlineChanges[1].changedById).toBe(co.owner.id);
  });

  it("does not claim an email was sent when no provider is configured", async () => {
    const { isEmailConfigured, sendEmail } = await import("@/server/email");
    expect(isEmailConfigured()).toBe(false);

    const result = await sendEmail({ to: "someone@test.local", subject: "Hello", text: "Hi" });
    expect(result).toEqual({ sent: false, reason: "not-configured" });
  });
});

// ---------------------------------------------------------------------------
describe("14. Progress and analytics calculations are correct", () => {
  it("counts assignment, completion, on-time and late against the original deadline", async () => {
    const from = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const to = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // On time: completed before its deadline.
    const onTime = await createTask(
      co.owner,
      taskInput({ teamId: co.teamId, assigneeIds: [co.employee.id], dueAt: daysFromNow(5) }),
    );
    await submitForReview(co.employee, onTime.id, { summary: "Early.", linkUrl: null });
    await decideReview(co.manager, onTime.id, { decision: "APPROVED", feedback: null });

    // Late: the deadline was yesterday, and an extension cannot undo that.
    const late = await createTask(
      co.owner,
      taskInput({ teamId: co.teamId, assigneeIds: [co.employee2.id], dueAt: hoursFromNow(-6) }),
    );
    await changeDeadline(co.manager, late.id, { dueAt: daysFromNow(5), reason: "Extension granted." });
    await submitForReview(co.employee2, late.id, { summary: "Finally.", linkUrl: null });
    await decideReview(co.manager, late.id, { decision: "APPROVED", feedback: null });

    const report = await getReport(co.owner, { from, to, teamId: null, projectId: null });

    expect(report.headline.assigned).toBe(2);
    expect(report.headline.completed).toBe(2);
    expect(report.headline.onTime).toBe(1);
    expect(report.headline.late).toBe(1);
    expect(report.headline.onTimeRate).toBe(50);
    expect(report.lateCompletions.map((row) => row.taskId)).toEqual([late.id]);
    expect(report.headline.completionRate).toBe(100);
  });

  it("splits a shared task between its required assignees rather than double counting", async () => {
    const from = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const to = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const shared = await createTask(
      co.owner,
      taskInput({
        teamId: co.teamId,
        assignmentType: "MULTIPLE",
        assigneeIds: [co.employee.id, co.employee2.id],
        priority: "HIGH",
        dueAt: daysFromNow(3),
      }),
    );
    await submitForReview(co.employee, shared.id, { summary: "Half one.", linkUrl: null });
    await submitForReview(co.employee2, shared.id, { summary: "Half two.", linkUrl: null });
    await decideReview(co.manager, shared.id, { decision: "APPROVED", feedback: null });

    const report = await getReport(co.owner, { from, to, teamId: null, projectId: null });
    const rows = report.byEmployee.filter((row) => row.userId === co.employee.id || row.userId === co.employee2.id);

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.assignedShare).toBe(0.5);
      expect(row.completedShare).toBe(0.5);
    }
    // The whole task counts once at task level.
    expect(report.headline.completed).toBe(1);
  });

  it("weights open workload by priority and divides shared work", async () => {
    await createTask(
      co.owner,
      taskInput({ teamId: co.teamId, assigneeIds: [co.employee.id], priority: "URGENT" }),
    );
    await createTask(co.owner, taskInput({ teamId: co.teamId, assigneeIds: [co.employee.id], priority: "LOW" }));
    await createTask(
      co.owner,
      taskInput({
        teamId: co.teamId,
        assignmentType: "MULTIPLE",
        assigneeIds: [co.employee.id, co.employee2.id],
        priority: "HIGH",
      }),
    );

    const rows = await listEmployees(co.owner);
    const eve = rows.find((row) => row.id === co.employee.id)!;
    const evan = rows.find((row) => row.id === co.employee2.id)!;

    // Urgent 4 + Low 1 + half of High 3 = 6.5
    expect(eve.workloadWeighted).toBe(6.5);
    // Half of High 3 = 1.5
    expect(evan.workloadWeighted).toBe(1.5);
    expect(eve.activeTasks).toBe(3);
  });

  it("tracks update compliance from requests and replies", async () => {
    const from = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const to = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const answered = await createTask(co.owner, taskInput({ teamId: co.teamId, assigneeIds: [co.employee.id] }));
    const ignored = await createTask(co.owner, taskInput({ teamId: co.teamId, assigneeIds: [co.employee2.id] }));

    await requestUpdates(co.manager, answered.id, { userIds: [co.employee.id], message: null, dueAt: null });
    await requestUpdates(co.manager, ignored.id, { userIds: [co.employee2.id], message: null, dueAt: null });

    const request = await prisma.updateRequest.findFirstOrThrow({ where: { taskId: answered.id } });
    await postProgressUpdate(co.employee, answered.id, { ...progressPayload(30), updateRequestId: request.id });

    const report = await getReport(co.owner, { from, to, teamId: null, projectId: null });
    expect(report.headline.updateCompliance).toBe(50);

    const eve = report.byEmployee.find((row) => row.userId === co.employee.id)!;
    const evan = report.byEmployee.find((row) => row.userId === co.employee2.id)!;
    expect(eve.updateComplianceRate).toBe(100);
    expect(evan.updateComplianceRate).toBe(0);
  });

  it("counts tasks that were sent back for changes", async () => {
    const from = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const to = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const task = await createTask(co.owner, taskInput({ teamId: co.teamId, assigneeIds: [co.employee.id] }));
    await submitForReview(co.employee, task.id, { summary: "First go.", linkUrl: null });
    await decideReview(co.manager, task.id, { decision: "CHANGES_REQUESTED", feedback: "Not yet." });
    await submitForReview(co.employee, task.id, { summary: "Second go.", linkUrl: null });
    await decideReview(co.manager, task.id, { decision: "APPROVED", feedback: null });

    const report = await getReport(co.owner, { from, to, teamId: null, projectId: null });
    expect(report.headline.reopenedCount).toBe(1);
    expect(report.reopened[0].rounds).toBe(1);
    expect(report.reopened[0].lastFeedback).toBe("Not yet.");
  });

  it("scopes a manager's report to the teams they lead", async () => {
    const from = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const to = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await createTask(co.owner, taskInput({ teamId: co.teamId, assigneeIds: [co.employee.id] }));
    await createTask(co.owner, taskInput({ teamId: co.otherTeamId, assigneeIds: [co.outsider.id] }));

    const ownerReport = await getReport(co.owner, { from, to, teamId: null, projectId: null });
    expect(ownerReport.headline.assigned).toBe(2);

    const managerReport = await getReport(co.manager, { from, to, teamId: null, projectId: null });
    expect(managerReport.headline.assigned).toBe(1);
    expect(managerReport.byTeam.map((row) => row.teamId)).toEqual([co.teamId]);
  });

  it("produces a CSV export whose rows match the report", async () => {
    const from = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const to = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const { exportReportCsv } = await import("@/server/services/reports");

    await createTask(
      co.owner,
      taskInput({ title: "Exportable task", teamId: co.teamId, assigneeIds: [co.employee.id], dueAt: daysFromNow(2) }),
    );

    const csv = await exportReportCsv(co.owner, "tasks", { from, to, teamId: null, projectId: null });
    const lines = csv.trim().split("\n");
    expect(lines[0]).toContain("code,title,status,health");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("Exportable task");
    expect(lines[1]).toContain("Eve Employee");
  });

  it("pages and sorts the task list on the server", async () => {
    for (let index = 0; index < 7; index += 1) {
      await createTask(
        co.owner,
        taskInput({
          title: `Task ${index}`,
          teamId: co.teamId,
          assigneeIds: [co.employee.id],
          dueAt: daysFromNow(index + 1),
        }),
      );
    }

    const page1 = await listTasks(co.owner, taskFilterSchema.parse({ pageSize: 3, page: 1, sort: "dueAt", dir: "asc" }));
    expect(page1.items).toHaveLength(3);
    expect(page1.total).toBe(7);
    expect(page1.pageCount).toBe(3);
    expect(page1.items.map((t) => t.title)).toEqual(["Task 0", "Task 1", "Task 2"]);

    const page3 = await listTasks(co.owner, taskFilterSchema.parse({ pageSize: 3, page: 3, sort: "dueAt", dir: "asc" }));
    expect(page3.items.map((t) => t.title)).toEqual(["Task 6"]);

    const descending = await listTasks(
      co.owner,
      taskFilterSchema.parse({ pageSize: 2, page: 1, sort: "dueAt", dir: "desc" }),
    );
    expect(descending.items.map((t) => t.title)).toEqual(["Task 6", "Task 5"]);
  });

  it("filters by text, status and assignee on the server", async () => {
    await createTask(
      co.owner,
      taskInput({ title: "Rebuild the billing export", teamId: co.teamId, assigneeIds: [co.employee.id] }),
    );
    const blocked = await createTask(
      co.owner,
      taskInput({ title: "Something else entirely", teamId: co.teamId, assigneeIds: [co.employee2.id] }),
    );
    await reportBlocker(co.employee2, blocked.id, { reason: "Stuck.", helpNeeded: null, progress: 10 });

    const byText = await listTasks(co.owner, taskFilterSchema.parse({ q: "billing" }));
    expect(byText.total).toBe(1);

    const byStatus = await listTasks(co.owner, taskFilterSchema.parse({ status: "BLOCKED" }));
    expect(byStatus.items.map((t) => t.id)).toEqual([blocked.id]);

    const byAssignee = await listTasks(co.owner, taskFilterSchema.parse({ assigneeId: co.employee.id }));
    expect(byAssignee.total).toBe(1);
    expect(byAssignee.items[0].title).toBe("Rebuild the billing export");
  });

  it("gives each team an honest completion rate", async () => {
    const a = await createTask(co.owner, taskInput({ teamId: co.teamId, assigneeIds: [co.employee.id] }));
    await createTask(co.owner, taskInput({ teamId: co.teamId, assigneeIds: [co.employee2.id] }));
    await submitForReview(co.employee, a.id, { summary: "Done.", linkUrl: null });
    await decideReview(co.manager, a.id, { decision: "APPROVED", feedback: null });

    const summaries = await listTeamSummaries(co.owner);
    const delivery = summaries.find((row) => row.id === co.teamId)!;
    expect(delivery.completedTasks).toBe(1);
    expect(delivery.activeTasks).toBe(1);
    expect(delivery.completionRate).toBe(50);
  });
});

// ---------------------------------------------------------------------------
describe("extra guarantees", () => {
  it("keeps progress reports when an assignee is swapped out", async () => {
    const task = await createTask(
      co.owner,
      taskInput({
        teamId: co.teamId,
        assignmentType: "MULTIPLE",
        assigneeIds: [co.employee.id, co.employee2.id],
      }),
    );
    await postProgressUpdate(co.employee, task.id, progressPayload(45));

    await setAssignees(co.manager, task.id, {
      assigneeIds: [co.employee2.id],
      optionalAssigneeIds: [],
      primaryOwnerId: co.employee2.id,
    });

    const stored = await taskRow(task.id);
    expect(stored.assignees.map((a) => a.userId)).toEqual([co.employee2.id]);
    // The history of the person who left is still there.
    const updates = await prisma.progressUpdate.findMany({ where: { taskId: task.id, userId: co.employee.id } });
    expect(updates).toHaveLength(1);
  });

  it("lets a new member join a team and immediately be assigned work", async () => {
    const joiner = await createTeamJoiner();
    await addMember(co.owner, co.teamId, { userId: joiner, role: "MEMBER" });

    const task = await createTask(co.owner, taskInput({ teamId: co.teamId, assigneeIds: [joiner] }));
    expect((await taskRow(task.id)).assignees[0].userId).toBe(joiner);

    const joinerSession = await session(joiner);
    const visible = await listTasks(joinerSession, taskFilterSchema.parse({}));
    expect(visible.items.map((t) => t.id)).toContain(task.id);
  });

  it("records an audit entry for sensitive actions", async () => {
    await inviteUser(co.owner, {
      email: "audited@test.local",
      name: "Audited Person",
      jobTitle: null,
      role: "EMPLOYEE",
      teamIds: [],
      weeklyHours: 40,
      timezone: "UTC",
    });

    const entries = await prisma.auditLog.findMany({ where: { action: "USER_INVITED" } });
    expect(entries).toHaveLength(1);
    expect(entries[0].actorId).toBe(co.owner.id);
  });

  it("gives each task a unique sequential code", async () => {
    const codes: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      const task = await createTask(co.owner, taskInput({ teamId: co.teamId, assigneeIds: [co.employee.id] }));
      codes.push(task.code);
    }
    expect(new Set(codes).size).toBe(4);
    expect(codes).toEqual(["TST-001", "TST-002", "TST-003", "TST-004"]);
  });
});

// ---------------------------------------------------------------------------

function progressPayload(progress: number) {
  return {
    progress,
    workCompleted: null,
    workRemaining: null,
    blockers: null,
    helpNeeded: null,
    expectedCompletion: null,
    linkUrl: null,
    updateRequestId: null,
  };
}

async function createTeamJoiner(): Promise<string> {
  const user = await prisma.user.create({
    data: {
      email: `joiner-${Date.now()}@test.local`,
      name: "Jo Joiner",
      role: "EMPLOYEE",
      status: "ACTIVE",
      passwordHash: "$2a$12$notarealhashnotarealhashnotarealhashnotarealhashnota",
      preferences: { create: {} },
    },
  });
  return user.id;
}
