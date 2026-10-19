/**
 * Zod schemas shared by API routes, services and forms.
 *
 * The server validates every payload against these before touching the
 * database — a request is never trusted because the UI sent it.
 */
import { z } from "zod";

import {
  assigneeStatusSchema,
  assignmentTypeSchema,
  completionRuleSchema,
  progressModeSchema,
  recurrenceSchema,
  taskPrioritySchema,
  taskStatusSchema,
  teamRoleSchema,
  updateCadenceSchema,
  userRoleSchema,
} from "@/lib/enums";

const trimmed = (max: number) => z.string().trim().max(max);
const nonEmpty = (max: number, label = "This field") =>
  z.string().trim().min(1, `${label} is required.`).max(max, `${label} must be ${max} characters or fewer.`);

/** Accepts "", null and undefined as "not set". */
const optionalText = (max: number) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => {
      if (value === null || value === undefined) return null;
      const next = value.trim();
      return next.length === 0 ? null : next;
    })
    .refine((value) => value === null || value.length <= max, `Must be ${max} characters or fewer.`);

/** ISO date string, a `datetime-local` value, or null. */
export const dateInput = z
  .union([z.string(), z.date(), z.null(), z.undefined()])
  .transform((value) => {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    const raw = value.trim();
    if (!raw) return null;
    const normalised = /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? `${raw}T00:00:00.000Z`
      : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)
        ? `${raw}:00.000Z`
        : raw;
    const parsed = new Date(normalised);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  })
  .refine((value) => value === null || value instanceof Date, "Enter a valid date.");

export const requiredDateInput = dateInput.refine((value): value is Date => value !== null, "A date is required.");

const httpUrl = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (!value) return null;
    const raw = String(value).trim();
    return raw.length === 0 ? null : raw;
  })
  .refine((value) => {
    if (value === null) return true;
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }, "Enter a full http(s) link.");

export const percentage = z.coerce.number().int().min(0, "Progress cannot be below 0%.").max(100, "Progress cannot exceed 100%.");

// --- Auth ------------------------------------------------------------------

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(200, "That password is too long.")
  .refine((value) => /[a-zA-Z]/.test(value) && /[0-9]/.test(value), "Include at least one letter and one number.");

export const acceptInviteSchema = z.object({
  token: nonEmpty(200, "Invite token"),
  name: nonEmpty(120, "Your name"),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: passwordSchema,
});

// --- Users -----------------------------------------------------------------

export const inviteUserSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  name: nonEmpty(120, "Name"),
  jobTitle: optionalText(120),
  role: userRoleSchema.default("EMPLOYEE"),
  teamIds: z.array(z.string().min(1)).max(20).default([]),
  weeklyHours: z.coerce.number().int().min(1).max(80).default(40),
  timezone: trimmed(60).default("UTC"),
});

export const updateUserSchema = z.object({
  name: nonEmpty(120, "Name").optional(),
  jobTitle: optionalText(120).optional(),
  timezone: trimmed(60).optional(),
  weeklyHours: z.coerce.number().int().min(1).max(80).optional(),
  avatarColor: trimmed(9).optional(),
});

export const changeRoleSchema = z.object({ role: userRoleSchema });

export const notificationPreferenceSchema = z.object({
  inAppEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  notifyAssignment: z.boolean().optional(),
  notifyProgress: z.boolean().optional(),
  notifyBlocker: z.boolean().optional(),
  notifyReview: z.boolean().optional(),
  notifyDeadline: z.boolean().optional(),
  notifyComments: z.boolean().optional(),
  reminderOffsets: z
    .string()
    .trim()
    .regex(/^\s*\d{1,3}(\s*,\s*\d{1,3})*\s*$/, "Use a comma-separated list of hours, for example 48,24,2.")
    .optional(),
});

// --- Teams & projects ------------------------------------------------------

export const createTeamSchema = z.object({
  name: nonEmpty(80, "Team name"),
  description: optionalText(500),
  color: trimmed(9).default("#0F766E"),
  leadIds: z.array(z.string().min(1)).max(10).default([]),
  memberIds: z.array(z.string().min(1)).max(200).default([]),
});

export const updateTeamSchema = z.object({
  name: nonEmpty(80, "Team name").optional(),
  description: optionalText(500).optional(),
  color: trimmed(9).optional(),
});

export const membershipSchema = z.object({
  userId: z.string().min(1, "Choose a person."),
  role: teamRoleSchema.default("MEMBER"),
});

export const createProjectSchema = z.object({
  name: nonEmpty(80, "Project name"),
  key: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, "Use 2–8 characters.")
    .max(8, "Use 2–8 characters.")
    .regex(/^[A-Z0-9]+$/, "Letters and numbers only."),
  description: optionalText(500),
  color: trimmed(9).default("#4F46E5"),
  teamId: z.union([z.string().min(1), z.null(), z.literal("")]).transform((v) => (v ? v : null)),
});

// --- Tasks -----------------------------------------------------------------

export const subtaskInputSchema = z.object({
  title: nonEmpty(200, "Checklist item"),
  isDone: z.boolean().default(false),
});

export const taskLinkSchema = z.object({
  label: optionalText(120),
  url: httpUrl.refine((value) => value !== null, "Enter a link."),
});

export const createTaskSchema = z
  .object({
    title: nonEmpty(160, "Task title"),
    description: optionalText(5000),
    instruction: optionalText(2000),
    priority: taskPrioritySchema.default("NORMAL"),
    assignmentType: assignmentTypeSchema.default("INDIVIDUAL"),
    completionRule: completionRuleSchema.default("ALL_REQUIRED"),
    progressMode: progressModeSchema.default("MANUAL"),
    updateCadence: updateCadenceSchema.default("ON_STATUS_CHANGE"),
    recurrence: recurrenceSchema.default("NONE"),
    reviewRequired: z.boolean().default(true),
    teamId: z.union([z.string().min(1), z.null(), z.literal("")]).transform((v) => (v ? v : null)),
    projectId: z.union([z.string().min(1), z.null(), z.literal("")]).transform((v) => (v ? v : null)),
    assigneeIds: z.array(z.string().min(1)).max(100).default([]),
    primaryOwnerId: z.union([z.string().min(1), z.null(), z.literal("")]).transform((v) => (v ? v : null)),
    optionalAssigneeIds: z.array(z.string().min(1)).max(100).default([]),
    startDate: dateInput,
    dueAt: dateInput,
    estimateHours: z
      .union([z.coerce.number().min(0).max(10000), z.null(), z.literal("")])
      .transform((v) => (v === "" || v === null ? null : Number(v))),
    category: optionalText(80),
    subtasks: z.array(subtaskInputSchema).max(50).default([]),
    links: z.array(taskLinkSchema).max(20).default([]),
    /** Create as a draft instead of assigning immediately. */
    asDraft: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.assignmentType === "TEAM" && !value.teamId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["teamId"], message: "Choose the team this task is assigned to." });
    }
    if (value.assignmentType === "INDIVIDUAL" && !value.asDraft && value.assigneeIds.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assigneeIds"],
        message: "Choose exactly one person for an individual task.",
      });
    }
    if (value.assignmentType === "MULTIPLE" && !value.asDraft && value.assigneeIds.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assigneeIds"],
        message: "Choose at least two people, or switch to an individual task.",
      });
    }
    if (value.startDate && value.dueAt && value.startDate.getTime() > value.dueAt.getTime()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["dueAt"], message: "The deadline must be after the start date." });
    }
    if (value.completionRule === "PRIMARY_ONLY" && !value.primaryOwnerId && value.assignmentType !== "INDIVIDUAL") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["primaryOwnerId"],
        message: "Name the primary owner when only their completion counts.",
      });
    }
  });

export const updateTaskSchema = z
  .object({
    title: nonEmpty(160, "Task title").optional(),
    description: optionalText(5000).optional(),
    instruction: optionalText(2000).optional(),
    priority: taskPrioritySchema.optional(),
    completionRule: completionRuleSchema.optional(),
    progressMode: progressModeSchema.optional(),
    updateCadence: updateCadenceSchema.optional(),
    recurrence: recurrenceSchema.optional(),
    reviewRequired: z.boolean().optional(),
    projectId: z
      .union([z.string().min(1), z.null(), z.literal("")])
      .transform((v) => (v ? v : null))
      .optional(),
    startDate: dateInput.optional(),
    estimateHours: z
      .union([z.coerce.number().min(0).max(10000), z.null(), z.literal("")])
      .transform((v) => (v === "" || v === null ? null : Number(v)))
      .optional(),
    category: optionalText(80).optional(),
    primaryOwnerId: z
      .union([z.string().min(1), z.null(), z.literal("")])
      .transform((v) => (v ? v : null))
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Nothing to update.");

export const changeDeadlineSchema = z.object({
  dueAt: dateInput,
  reason: optionalText(500),
});

export const setAssigneesSchema = z.object({
  assigneeIds: z.array(z.string().min(1)).max(100).default([]),
  optionalAssigneeIds: z.array(z.string().min(1)).max(100).default([]),
  primaryOwnerId: z.union([z.string().min(1), z.null(), z.literal("")]).transform((v) => (v ? v : null)),
});

export const transferTeamSchema = z.object({
  teamId: z.string().min(1, "Choose the receiving team."),
  reason: optionalText(500),
  keepAssignees: z.boolean().default(false),
});

export const taskStatusTransitionSchema = z.object({
  status: taskStatusSchema,
  note: optionalText(500),
});

export const assigneeStatusSchema_ = assigneeStatusSchema;

export const toggleSubtaskSchema = z.object({ isDone: z.boolean() });

export const addSubtaskSchema = z.object({ title: nonEmpty(200, "Checklist item") });

// --- Progress, blockers, review, extensions --------------------------------

export const progressUpdateSchema = z.object({
  progress: percentage,
  workCompleted: optionalText(2000),
  workRemaining: optionalText(2000),
  blockers: optionalText(2000),
  helpNeeded: optionalText(2000),
  expectedCompletion: dateInput,
  linkUrl: httpUrl,
  updateRequestId: z.union([z.string().min(1), z.null(), z.undefined()]).transform((v) => v ?? null),
});

export const blockerSchema = z.object({
  reason: nonEmpty(2000, "Blocker description"),
  helpNeeded: optionalText(2000),
  progress: percentage.optional(),
});

export const submitForReviewSchema = z.object({
  summary: nonEmpty(2000, "Completion summary"),
  linkUrl: httpUrl,
});

export const reviewDecisionSchema = z.object({
  decision: z.enum(["APPROVED", "CHANGES_REQUESTED"]),
  feedback: optionalText(2000),
});

export const requestUpdateSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1, "Choose at least one person.").max(50),
  message: optionalText(1000),
  dueAt: dateInput,
});

export const extensionRequestSchema = z.object({
  requestedDueAt: requiredDateInput,
  reason: nonEmpty(1000, "Reason"),
});

export const extensionDecisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: optionalText(1000),
});

export const commentSchema = z.object({
  body: nonEmpty(5000, "Comment"),
  parentId: z.union([z.string().min(1), z.null(), z.undefined()]).transform((v) => v ?? null),
});

export const linkAttachmentSchema = z.object({
  url: httpUrl.refine((value) => value !== null, "Enter a link."),
  label: optionalText(120),
});

// --- Listing / filtering ---------------------------------------------------

const csvList = z
  .union([z.string(), z.array(z.string()), z.null(), z.undefined()])
  .transform((value) => {
    if (!value) return [] as string[];
    const parts = Array.isArray(value) ? value : value.split(",");
    return parts.map((p) => p.trim()).filter(Boolean);
  });

export const taskFilterSchema = z.object({
  q: optionalText(120),
  status: csvList,
  priority: csvList,
  teamId: csvList,
  projectId: csvList,
  assigneeId: csvList,
  health: csvList,
  scope: z.enum(["ALL", "ASSIGNED_TO_ME", "CREATED_BY_ME", "MY_TEAMS", "NEEDS_MY_ACTION", "AWAITING_REVIEW"]).default("ALL"),
  dueFrom: dateInput,
  dueTo: dateInput,
  includeArchived: z
    .union([z.boolean(), z.string(), z.undefined()])
    .transform((v) => v === true || v === "true" || v === "1"),
  sort: z
    .enum(["dueAt", "priority", "progress", "updatedAt", "createdAt", "title", "status"])
    .default("dueAt"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type TaskFilter = z.infer<typeof taskFilterSchema>;

export const reportRangeSchema = z.object({
  from: dateInput,
  to: dateInput,
  teamId: z.union([z.string().min(1), z.null(), z.literal("")]).transform((v) => (v ? v : null)),
  projectId: z.union([z.string().min(1), z.null(), z.literal("")]).transform((v) => (v ? v : null)),
});

export const settingsSchema = z.object({
  companyName: nonEmpty(120, "Company name").optional(),
  defaultReviewRequired: z.boolean().optional(),
  defaultUpdateCadence: updateCadenceSchema.optional(),
  reminderOffsets: z
    .string()
    .trim()
    .regex(/^\s*\d{1,3}(\s*,\s*\d{1,3})*\s*$/, "Use a comma-separated list of hours.")
    .optional(),
  taskCodePrefix: z
    .string()
    .trim()
    .toUpperCase()
    .min(2)
    .max(6)
    .regex(/^[A-Z]+$/, "Letters only.")
    .optional(),
});
