/**
 * Role-based authorisation.
 *
 * Every rule lives here and is evaluated against data read from the database,
 * never against values supplied by the browser. Service functions call these
 * helpers before any read or write; API routes add no rules of their own.
 *
 * Scope summary:
 *   OWNER    — everything, company-wide.
 *   MANAGER  — the teams they lead (TeamMembership.role = LEAD), plus their own work.
 *   EMPLOYEE — their own assignments, tasks they created, and their teams' tasks.
 */
import type { SessionUser } from "@/server/auth";
import { forbidden } from "@/server/errors";

export type TaskScope = {
  id: string;
  teamId: string | null;
  createdById: string;
  primaryOwnerId: string | null;
  reviewRequired: boolean;
  assigneeIds: string[];
};

export const isOwner = (user: SessionUser) => user.role === "OWNER";
export const isManager = (user: SessionUser) => user.role === "MANAGER";

/** Teams whose tasks the user may administer (create, edit, reassign, review). */
export function managedTeamIds(user: SessionUser): string[] {
  if (isOwner(user)) return [];
  return user.ledTeamIds;
}

export function memberTeamIds(user: SessionUser): string[] {
  return user.teams.map((t) => t.teamId);
}

export function leadsTeam(user: SessionUser, teamId: string | null | undefined): boolean {
  if (!teamId) return false;
  return user.ledTeamIds.includes(teamId);
}

export function belongsToTeam(user: SessionUser, teamId: string | null | undefined): boolean {
  if (!teamId) return false;
  return user.teams.some((t) => t.teamId === teamId);
}

// --- Task visibility -------------------------------------------------------

/** Can the user see this task at all? */
export function canViewTask(user: SessionUser, task: TaskScope): boolean {
  if (isOwner(user)) return true;
  if (task.createdById === user.id) return true;
  if (task.primaryOwnerId === user.id) return true;
  if (task.assigneeIds.includes(user.id)) return true;
  if (leadsTeam(user, task.teamId)) return true;
  // Team-wide visibility: members can see what their team is accountable for.
  if (belongsToTeam(user, task.teamId)) return true;
  return false;
}

/** Can the user change the task itself — title, dates, priority, assignees? */
export function canManageTask(user: SessionUser, task: TaskScope): boolean {
  if (isOwner(user)) return true;
  if (leadsTeam(user, task.teamId)) return true;
  // The creator keeps control of what they assigned, even across teams.
  if (task.createdById === user.id && (isManager(user) || isOwner(user))) return true;
  return false;
}

/** Can the user delete or archive the task? Owners and the creating manager. */
export function canDeleteTask(user: SessionUser, task: TaskScope): boolean {
  if (isOwner(user)) return true;
  return isManager(user) && (task.createdById === user.id || leadsTeam(user, task.teamId));
}

/** Is the user accountable for delivering this task? */
export function isAssignee(user: SessionUser, task: TaskScope): boolean {
  return task.assigneeIds.includes(user.id) || task.primaryOwnerId === user.id;
}

/**
 * Can the user decide a review on this task?
 *
 * Reviewers must have management authority over the task *and* must not be the
 * person who submitted the work — nobody approves their own submission.
 */
export function canReviewTask(user: SessionUser, task: TaskScope, submittedById: string | null): boolean {
  if (!canManageTask(user, task)) return false;
  if (submittedById && submittedById === user.id) return false;
  return true;
}

/** Can the user post a progress report? Only the people doing the work. */
export function canReportProgress(user: SessionUser, task: TaskScope): boolean {
  return isAssignee(user, task);
}

/** Can the user set the task-level percentage directly? */
export function canSetTaskProgress(user: SessionUser, task: TaskScope): boolean {
  return isAssignee(user, task) || canManageTask(user, task);
}

/** Can the user comment? Anyone who can see the task. */
export function canComment(user: SessionUser, task: TaskScope): boolean {
  return canViewTask(user, task);
}

/** Can the user ask an assignee for an update? */
export function canRequestUpdate(user: SessionUser, task: TaskScope): boolean {
  return canManageTask(user, task);
}

// --- Teams, people, settings ----------------------------------------------

export function canCreateTeam(user: SessionUser): boolean {
  return isOwner(user);
}

export function canManageTeam(user: SessionUser, teamId: string): boolean {
  return isOwner(user) || leadsTeam(user, teamId);
}

/** Only owners change who belongs to a team; leads may view it. */
export function canManageMembership(user: SessionUser, teamId: string): boolean {
  return isOwner(user) || leadsTeam(user, teamId);
}

export function canViewTeam(user: SessionUser, teamId: string): boolean {
  return isOwner(user) || belongsToTeam(user, teamId);
}

export function canInviteUsers(user: SessionUser): boolean {
  return isOwner(user);
}

export function canManageUser(actor: SessionUser, targetId: string): boolean {
  if (isOwner(actor)) return true;
  return actor.id === targetId;
}

/** Changing someone's role is an owner-only action, and never on yourself. */
export function canChangeRole(actor: SessionUser, targetId: string): boolean {
  return isOwner(actor) && actor.id !== targetId;
}

export function canViewReports(user: SessionUser): boolean {
  return isOwner(user) || isManager(user);
}

export function canExportReports(user: SessionUser): boolean {
  return isOwner(user) || isManager(user);
}

export function canConfigureSettings(user: SessionUser): boolean {
  return isOwner(user);
}

export function canViewAudit(user: SessionUser): boolean {
  return isOwner(user);
}

/** Can the user create tasks at all, and for which team? */
export function canCreateTaskForTeam(user: SessionUser, teamId: string | null): boolean {
  if (isOwner(user)) return true;
  if (!isManager(user)) return false;
  if (!teamId) return false;
  return leadsTeam(user, teamId);
}

// --- Assertion helpers -----------------------------------------------------

export function assert(condition: boolean, message?: string): void {
  if (!condition) throw forbidden(message);
}

export function assertCanViewTask(user: SessionUser, task: TaskScope): void {
  assert(canViewTask(user, task), "You do not have access to this task.");
}

export function assertCanManageTask(user: SessionUser, task: TaskScope): void {
  assert(canManageTask(user, task), "Only the task owner, a team lead or the company owner can change this task.");
}
