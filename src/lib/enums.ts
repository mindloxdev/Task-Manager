/**
 * Enum-like vocabularies for Cadence.
 *
 * The database stores these as plain strings (for provider portability), so
 * this module is the single source of truth: every write path validates
 * against the Zod schemas here, and the UI reads its labels and ordering from
 * the same constants.
 */
import { z } from "zod";

// --- Roles -----------------------------------------------------------------

export const USER_ROLES = ["OWNER", "MANAGER", "EMPLOYEE"] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const userRoleSchema = z.enum(USER_ROLES);

export const USER_ROLE_LABEL: Record<UserRole, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  EMPLOYEE: "Employee",
};

export const USER_STATUSES = ["ACTIVE", "INVITED", "DEACTIVATED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];
export const userStatusSchema = z.enum(USER_STATUSES);

export const USER_STATUS_LABEL: Record<UserStatus, string> = {
  ACTIVE: "Active",
  INVITED: "Invited",
  DEACTIVATED: "Deactivated",
};

export const TEAM_ROLES = ["LEAD", "MEMBER"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];
export const teamRoleSchema = z.enum(TEAM_ROLES);

export const TEAM_ROLE_LABEL: Record<TeamRole, string> = {
  LEAD: "Team lead",
  MEMBER: "Member",
};

// --- Task status -----------------------------------------------------------

export const TASK_STATUSES = [
  "DRAFT",
  "ASSIGNED",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "BLOCKED",
  "SUBMITTED_FOR_REVIEW",
  "CHANGES_REQUESTED",
  "COMPLETED",
  "CANCELLED",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const taskStatusSchema = z.enum(TASK_STATUSES);

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  DRAFT: "Draft",
  ASSIGNED: "Assigned",
  ACKNOWLEDGED: "Acknowledged",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  SUBMITTED_FOR_REVIEW: "Submitted for review",
  CHANGES_REQUESTED: "Changes requested",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/** Statuses that mean the task is finished, one way or another. */
export const TERMINAL_TASK_STATUSES: TaskStatus[] = ["COMPLETED", "CANCELLED"];

/** Statuses that count as live work in dashboards and workload numbers. */
export const ACTIVE_TASK_STATUSES: TaskStatus[] = [
  "ASSIGNED",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "BLOCKED",
  "SUBMITTED_FOR_REVIEW",
  "CHANGES_REQUESTED",
];

/**
 * Statuses that only a reviewer or manager may set, and that the rollup
 * recalculation must never silently overwrite.
 */
export const MANAGER_CONTROLLED_STATUSES: TaskStatus[] = [
  "DRAFT",
  "COMPLETED",
  "CANCELLED",
  "CHANGES_REQUESTED",
];

export const ASSIGNEE_STATUSES = [
  "ASSIGNED",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "BLOCKED",
  "SUBMITTED",
  "CHANGES_REQUESTED",
  "COMPLETED",
] as const;
export type AssigneeStatus = (typeof ASSIGNEE_STATUSES)[number];
export const assigneeStatusSchema = z.enum(ASSIGNEE_STATUSES);

export const ASSIGNEE_STATUS_LABEL: Record<AssigneeStatus, string> = {
  ASSIGNED: "Assigned",
  ACKNOWLEDGED: "Acknowledged",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  SUBMITTED: "Submitted",
  CHANGES_REQUESTED: "Changes requested",
  COMPLETED: "Completed",
};

// --- Task shape ------------------------------------------------------------

export const TASK_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export const taskPrioritySchema = z.enum(TASK_PRIORITIES);

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

export const TASK_PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  LOW: 1,
  NORMAL: 2,
  HIGH: 3,
  URGENT: 4,
};

export const ASSIGNMENT_TYPES = ["INDIVIDUAL", "MULTIPLE", "TEAM"] as const;
export type AssignmentType = (typeof ASSIGNMENT_TYPES)[number];
export const assignmentTypeSchema = z.enum(ASSIGNMENT_TYPES);

export const ASSIGNMENT_TYPE_LABEL: Record<AssignmentType, string> = {
  INDIVIDUAL: "One person",
  MULTIPLE: "Several people",
  TEAM: "Whole team",
};

export const COMPLETION_RULES = ["ALL_REQUIRED", "ANY_ONE", "PRIMARY_ONLY"] as const;
export type CompletionRule = (typeof COMPLETION_RULES)[number];
export const completionRuleSchema = z.enum(COMPLETION_RULES);

export const COMPLETION_RULE_LABEL: Record<CompletionRule, string> = {
  ALL_REQUIRED: "Every required assignee must finish",
  ANY_ONE: "Any one assignee finishing is enough",
  PRIMARY_ONLY: "Only the primary owner must finish",
};

export const PROGRESS_MODES = ["MANUAL", "CHECKLIST"] as const;
export type ProgressMode = (typeof PROGRESS_MODES)[number];
export const progressModeSchema = z.enum(PROGRESS_MODES);

export const PROGRESS_MODE_LABEL: Record<ProgressMode, string> = {
  MANUAL: "Reported by assignees",
  CHECKLIST: "Calculated from the checklist",
};

export const UPDATE_CADENCES = ["NONE", "DAILY", "WEEKLY", "ON_STATUS_CHANGE"] as const;
export type UpdateCadence = (typeof UPDATE_CADENCES)[number];
export const updateCadenceSchema = z.enum(UPDATE_CADENCES);

export const UPDATE_CADENCE_LABEL: Record<UpdateCadence, string> = {
  NONE: "No set cadence",
  DAILY: "Daily update expected",
  WEEKLY: "Weekly update expected",
  ON_STATUS_CHANGE: "Update when status changes",
};

/** Hours of silence after which an update is considered overdue, per cadence. */
export const UPDATE_CADENCE_HOURS: Record<UpdateCadence, number | null> = {
  NONE: null,
  DAILY: 24,
  WEEKLY: 24 * 7,
  ON_STATUS_CHANGE: null,
};

export const RECURRENCES = ["NONE", "DAILY", "WEEKLY", "MONTHLY"] as const;
export type Recurrence = (typeof RECURRENCES)[number];
export const recurrenceSchema = z.enum(RECURRENCES);

export const RECURRENCE_LABEL: Record<Recurrence, string> = {
  NONE: "Does not repeat",
  DAILY: "Repeats daily",
  WEEKLY: "Repeats weekly",
  MONTHLY: "Repeats monthly",
};

// --- Progress updates, reviews, extensions ---------------------------------

export const PROGRESS_KINDS = ["UPDATE", "BLOCKER", "UNBLOCKED", "SUBMISSION", "RESPONSE"] as const;
export type ProgressKind = (typeof PROGRESS_KINDS)[number];
export const progressKindSchema = z.enum(PROGRESS_KINDS);

export const PROGRESS_KIND_LABEL: Record<ProgressKind, string> = {
  UPDATE: "Progress update",
  BLOCKER: "Blocker reported",
  UNBLOCKED: "Blocker cleared",
  SUBMISSION: "Submitted for review",
  RESPONSE: "Reply to update request",
};

export const REVIEW_DECISIONS = ["PENDING", "APPROVED", "CHANGES_REQUESTED"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];
export const reviewDecisionSchema = z.enum(REVIEW_DECISIONS);

export const EXTENSION_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type ExtensionStatus = (typeof EXTENSION_STATUSES)[number];
export const extensionStatusSchema = z.enum(EXTENSION_STATUSES);

export const ATTACHMENT_KINDS = ["FILE", "LINK"] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

// --- Task health -----------------------------------------------------------

export const TASK_HEALTHS = ["COMPLETED", "BLOCKED", "OVERDUE", "AT_RISK", "ON_TRACK", "NOT_STARTED"] as const;
export type TaskHealth = (typeof TASK_HEALTHS)[number];

export const TASK_HEALTH_LABEL: Record<TaskHealth, string> = {
  COMPLETED: "Completed",
  BLOCKED: "Blocked",
  OVERDUE: "Overdue",
  AT_RISK: "At risk",
  ON_TRACK: "On track",
  NOT_STARTED: "Not started",
};

// --- Notifications ---------------------------------------------------------

export const NOTIFICATION_TYPES = [
  "TASK_ASSIGNED",
  "TASK_ACKNOWLEDGED",
  "TASK_STARTED",
  "PROGRESS_UPDATED",
  "BLOCKER_REPORTED",
  "UPDATE_REQUESTED",
  "UPDATE_PROVIDED",
  "SUBMITTED_FOR_REVIEW",
  "CHANGES_REQUESTED",
  "TASK_APPROVED",
  "DEADLINE_CHANGED",
  "DEADLINE_APPROACHING",
  "TASK_OVERDUE",
  "EXTENSION_REQUESTED",
  "EXTENSION_DECIDED",
  "COMMENT_ADDED",
  "TASK_CANCELLED",
  "TEAM_MEMBERSHIP",
  "ACCOUNT_INVITED",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Which preference flag gates each notification type. */
export const NOTIFICATION_PREFERENCE_KEY: Record<
  NotificationType,
  | "notifyAssignment"
  | "notifyProgress"
  | "notifyBlocker"
  | "notifyReview"
  | "notifyDeadline"
  | "notifyComments"
  | null
> = {
  TASK_ASSIGNED: "notifyAssignment",
  TASK_ACKNOWLEDGED: "notifyProgress",
  TASK_STARTED: "notifyProgress",
  PROGRESS_UPDATED: "notifyProgress",
  BLOCKER_REPORTED: "notifyBlocker",
  UPDATE_REQUESTED: "notifyProgress",
  UPDATE_PROVIDED: "notifyProgress",
  SUBMITTED_FOR_REVIEW: "notifyReview",
  CHANGES_REQUESTED: "notifyReview",
  TASK_APPROVED: "notifyReview",
  DEADLINE_CHANGED: "notifyDeadline",
  DEADLINE_APPROACHING: "notifyDeadline",
  TASK_OVERDUE: "notifyDeadline",
  EXTENSION_REQUESTED: "notifyDeadline",
  EXTENSION_DECIDED: "notifyDeadline",
  COMMENT_ADDED: "notifyComments",
  TASK_CANCELLED: "notifyAssignment",
  TEAM_MEMBERSHIP: null,
  ACCOUNT_INVITED: null,
};

// --- Activity --------------------------------------------------------------

export const ACTIVITY_ACTIONS = [
  "TASK_CREATED",
  "TASK_UPDATED",
  "TASK_ASSIGNED",
  "ASSIGNEE_ADDED",
  "ASSIGNEE_REMOVED",
  "TASK_ACKNOWLEDGED",
  "TASK_STARTED",
  "PROGRESS_UPDATED",
  "BLOCKER_REPORTED",
  "BLOCKER_CLEARED",
  "SUBTASK_TOGGLED",
  "UPDATE_REQUESTED",
  "UPDATE_PROVIDED",
  "SUBMITTED_FOR_REVIEW",
  "REVIEW_APPROVED",
  "REVIEW_CHANGES_REQUESTED",
  "DEADLINE_CHANGED",
  "EXTENSION_REQUESTED",
  "EXTENSION_DECIDED",
  "COMMENT_ADDED",
  "ATTACHMENT_ADDED",
  "TASK_BECAME_OVERDUE",
  "TASK_CANCELLED",
  "TASK_ARCHIVED",
  "TASK_TRANSFERRED",
  "TEAM_CREATED",
  "TEAM_UPDATED",
  "TEAM_ARCHIVED",
  "MEMBER_ADDED",
  "MEMBER_REMOVED",
  "USER_INVITED",
  "USER_UPDATED",
  "USER_DEACTIVATED",
  "USER_REACTIVATED",
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];
