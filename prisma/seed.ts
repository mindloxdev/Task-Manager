/**
 * Development and demonstration seed.
 *
 * Creates a small company — four teams, thirteen people, a backlog of tasks
 * spread across every lifecycle state with real progress reports, reviews,
 * blockers and notifications — so every screen has something honest to show.
 *
 * Run with `npm run db:seed`. It clears the existing rows first, so never point
 * it at a database you care about.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "cadence2026";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Deterministic pseudo-random source, so repeated seeds look identical. */
let seedState = 1337;
function rand(): number {
  seedState = (seedState * 1103515245 + 12345) % 2147483648;
  return seedState / 2147483648;
}
function pick<T>(items: T[]): T {
  return items[Math.floor(rand() * items.length)];
}
function int(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

const NOW = new Date();
NOW.setMinutes(0, 0, 0);
const ago = (days: number, hours = 0) => new Date(NOW.getTime() - days * DAY - hours * HOUR);
const ahead = (days: number, hours = 0) => new Date(NOW.getTime() + days * DAY + hours * HOUR);

async function clear() {
  // Child rows first; most relations cascade, but being explicit keeps the
  // order obvious and the script safe to re-run.
  await prisma.auditLog.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.progressUpdate.deleteMany();
  await prisma.updateRequest.deleteMany();
  await prisma.extensionRequest.deleteMany();
  await prisma.deadlineChange.deleteMany();
  await prisma.taskReview.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.subtask.deleteMany();
  await prisma.taskAssignee.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.teamMembership.deleteMany();
  await prisma.team.deleteMany();
  await prisma.notificationPreference.deleteMany();
  await prisma.user.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.counter.deleteMany();
}

type PersonSeed = {
  key: string;
  name: string;
  email: string;
  jobTitle: string;
  role: "OWNER" | "MANAGER" | "EMPLOYEE";
  color: string;
  weeklyHours?: number;
  timezone?: string;
};

const PEOPLE: PersonSeed[] = [
  { key: "owner", name: "Amara Osei", email: "owner@cadence.test", jobTitle: "Managing Director", role: "OWNER", color: "#1D53D6", timezone: "Europe/London" },
  { key: "eng-lead", name: "Daniel Reyes", email: "daniel@cadence.test", jobTitle: "Head of Engineering", role: "MANAGER", color: "#0F7A52", timezone: "Europe/Madrid" },
  { key: "design-lead", name: "Priya Nandakumar", email: "priya@cadence.test", jobTitle: "Design Lead", role: "MANAGER", color: "#6341F0", timezone: "Asia/Kolkata" },
  { key: "growth-lead", name: "Tomas Lindqvist", email: "tomas@cadence.test", jobTitle: "Growth Lead", role: "MANAGER", color: "#C0304F", timezone: "Europe/Stockholm" },
  { key: "eng-1", name: "Mei Chen", email: "mei@cadence.test", jobTitle: "Senior Backend Engineer", role: "EMPLOYEE", color: "#0D7490" },
  { key: "eng-2", name: "Jonas Weber", email: "jonas@cadence.test", jobTitle: "Frontend Engineer", role: "EMPLOYEE", color: "#96590A" },
  { key: "eng-3", name: "Fatima Haddad", email: "fatima@cadence.test", jobTitle: "Platform Engineer", role: "EMPLOYEE", color: "#7A2FC9", weeklyHours: 32 },
  { key: "design-1", name: "Luca Moretti", email: "luca@cadence.test", jobTitle: "Product Designer", role: "EMPLOYEE", color: "#3F46C8" },
  { key: "design-2", name: "Nina Kovac", email: "nina@cadence.test", jobTitle: "UX Researcher", role: "EMPLOYEE", color: "#BE185D", weeklyHours: 24 },
  { key: "growth-1", name: "Samuel Addo", email: "samuel@cadence.test", jobTitle: "Content Strategist", role: "EMPLOYEE", color: "#B4530A" },
  { key: "growth-2", name: "Elena Petrova", email: "elena@cadence.test", jobTitle: "Performance Marketer", role: "EMPLOYEE", color: "#1D53D6" },
  { key: "cs-1", name: "Marcus Hale", email: "marcus@cadence.test", jobTitle: "Customer Success Manager", role: "EMPLOYEE", color: "#0F7A52" },
  { key: "cs-2", name: "Aisha Bello", email: "aisha@cadence.test", jobTitle: "Support Engineer", role: "EMPLOYEE", color: "#6341F0" },
];

type TeamSeed = { key: string; name: string; description: string; color: string; leads: string[]; members: string[] };

const TEAMS: TeamSeed[] = [
  {
    key: "engineering",
    name: "Engineering",
    description: "Platform, API and infrastructure work.",
    color: "#0F7A52",
    leads: ["eng-lead"],
    members: ["eng-1", "eng-2", "eng-3", "design-1"],
  },
  {
    key: "design",
    name: "Product Design",
    description: "Product design, research and the design system.",
    color: "#6341F0",
    leads: ["design-lead"],
    members: ["design-1", "design-2", "eng-2"],
  },
  {
    key: "growth",
    name: "Growth",
    description: "Content, campaigns and lifecycle marketing.",
    color: "#C0304F",
    leads: ["growth-lead"],
    members: ["growth-1", "growth-2"],
  },
  {
    key: "success",
    name: "Customer Success",
    description: "Onboarding, support escalations and renewals.",
    color: "#1D53D6",
    leads: ["owner"],
    members: ["cs-1", "cs-2", "growth-1"],
  },
];

type TaskSeed = {
  title: string;
  description: string;
  team: string;
  project?: string;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  /** Which lifecycle state to stage the task in. */
  stage:
    | "DRAFT"
    | "ASSIGNED"
    | "ACKNOWLEDGED"
    | "IN_PROGRESS"
    | "BLOCKED"
    | "SUBMITTED"
    | "CHANGES_REQUESTED"
    | "COMPLETED_ON_TIME"
    | "COMPLETED_LATE"
    | "OVERDUE"
    | "AT_RISK"
    | "CANCELLED";
  assignmentType: "INDIVIDUAL" | "MULTIPLE" | "TEAM";
  assignees: string[];
  primaryOwner?: string;
  createdBy: string;
  startOffset: number;
  dueOffset: number;
  estimateHours?: number;
  reviewRequired?: boolean;
  updateCadence?: "NONE" | "DAILY" | "WEEKLY" | "ON_STATUS_CHANGE";
  progressMode?: "MANUAL" | "CHECKLIST";
  recurrence?: "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";
  category?: string;
  subtasks?: string[];
  completionRule?: "ALL_REQUIRED" | "ANY_ONE" | "PRIMARY_ONLY";
};

const TASKS: TaskSeed[] = [
  {
    title: "Ship SSO support for enterprise accounts",
    description:
      "Enterprise customers need SAML sign-in. Implement the identity provider handshake, map groups to roles, and document the setup flow for onboarding.",
    team: "engineering",
    project: "PLAT",
    priority: "URGENT",
    stage: "IN_PROGRESS",
    assignmentType: "MULTIPLE",
    assignees: ["eng-1", "eng-3"],
    primaryOwner: "eng-1",
    createdBy: "eng-lead",
    startOffset: -9,
    dueOffset: 4,
    estimateHours: 60,
    updateCadence: "DAILY",
    category: "Platform",
    subtasks: ["Metadata exchange", "Group-to-role mapping", "Session hardening", "Admin setup docs"],
    progressMode: "CHECKLIST",
  },
  {
    title: "Reduce dashboard load time below 1.5s",
    description: "Profile the dashboard queries, add the missing indexes and cache the team rollups.",
    team: "engineering",
    project: "PLAT",
    priority: "HIGH",
    stage: "BLOCKED",
    assignmentType: "INDIVIDUAL",
    assignees: ["eng-3"],
    createdBy: "eng-lead",
    startOffset: -12,
    dueOffset: 2,
    estimateHours: 24,
    updateCadence: "DAILY",
    category: "Performance",
  },
  {
    title: "Migrate background jobs to the new queue",
    description: "Move the reminder and digest jobs onto the shared queue with retries and dead-letter handling.",
    team: "engineering",
    project: "PLAT",
    priority: "NORMAL",
    stage: "SUBMITTED",
    assignmentType: "INDIVIDUAL",
    assignees: ["eng-1"],
    createdBy: "eng-lead",
    startOffset: -16,
    dueOffset: 1,
    estimateHours: 32,
    category: "Platform",
  },
  {
    title: "Fix duplicate notification emails on task reassign",
    description: "Reassigning a task sends two notifications to the new assignee. Trace the double write and add a regression test.",
    team: "engineering",
    priority: "HIGH",
    stage: "CHANGES_REQUESTED",
    assignmentType: "INDIVIDUAL",
    assignees: ["eng-2"],
    createdBy: "eng-lead",
    startOffset: -7,
    dueOffset: 2,
    estimateHours: 8,
    category: "Bug",
  },
  {
    title: "Quarterly dependency and security upgrade",
    description: "Upgrade framework and library versions, review advisories, run the full test suite.",
    team: "engineering",
    priority: "NORMAL",
    stage: "ASSIGNED",
    assignmentType: "TEAM",
    assignees: [],
    primaryOwner: "eng-1",
    createdBy: "owner",
    startOffset: 0,
    dueOffset: 11,
    estimateHours: 20,
    updateCadence: "WEEKLY",
    recurrence: "MONTHLY",
    category: "Maintenance",
  },
  {
    title: "Write the public API reference",
    description: "Document every endpoint with examples, error codes and rate limits.",
    team: "engineering",
    project: "PLAT",
    priority: "LOW",
    stage: "OVERDUE",
    assignmentType: "INDIVIDUAL",
    assignees: ["eng-2"],
    createdBy: "eng-lead",
    startOffset: -20,
    dueOffset: -4,
    estimateHours: 16,
    category: "Documentation",
  },
  {
    title: "Rebuild the task detail layout",
    description:
      "The current detail page buries the progress timeline. Rework the layout so status, deadline and the latest update are visible without scrolling.",
    team: "design",
    project: "DSYS",
    priority: "HIGH",
    stage: "IN_PROGRESS",
    assignmentType: "MULTIPLE",
    assignees: ["design-1", "eng-2"],
    primaryOwner: "design-1",
    createdBy: "design-lead",
    startOffset: -6,
    dueOffset: 6,
    estimateHours: 40,
    category: "Product",
    subtasks: ["Audit the current page", "Wireframes", "High-fidelity screens", "Hand-off notes"],
  },
  {
    title: "Run five accountability interviews with team leads",
    description: "Understand how leads currently chase updates, and where the product should nudge instead of nag.",
    team: "design",
    priority: "NORMAL",
    stage: "COMPLETED_ON_TIME",
    assignmentType: "INDIVIDUAL",
    assignees: ["design-2"],
    createdBy: "design-lead",
    startOffset: -24,
    dueOffset: -8,
    estimateHours: 20,
    category: "Research",
  },
  {
    title: "Define the status and priority colour system",
    description: "One accessible palette for status, priority and health, with contrast checked in light and dark mode.",
    team: "design",
    project: "DSYS",
    priority: "NORMAL",
    stage: "COMPLETED_LATE",
    assignmentType: "INDIVIDUAL",
    assignees: ["design-1"],
    createdBy: "design-lead",
    startOffset: -30,
    dueOffset: -12,
    estimateHours: 12,
    category: "Design system",
  },
  {
    title: "Empty states and loading skeletons for every list",
    description: "Design the empty, loading and error states for tasks, teams, employees and reports.",
    team: "design",
    project: "DSYS",
    priority: "LOW",
    stage: "ACKNOWLEDGED",
    assignmentType: "INDIVIDUAL",
    assignees: ["design-2"],
    createdBy: "design-lead",
    startOffset: -1,
    dueOffset: 9,
    estimateHours: 14,
    category: "Design system",
  },
  {
    title: "Accessibility pass on the task creation form",
    description: "Keyboard order, labels, error summaries and focus management on the longest form in the product.",
    team: "design",
    priority: "HIGH",
    stage: "AT_RISK",
    assignmentType: "MULTIPLE",
    assignees: ["design-1", "design-2"],
    primaryOwner: "design-2",
    createdBy: "owner",
    startOffset: -10,
    dueOffset: 1,
    estimateHours: 18,
    updateCadence: "DAILY",
    category: "Accessibility",
  },
  {
    title: "Launch the Q4 accountability campaign",
    description: "Landing page, three emails and a paid test budget. Target: operations leads at 50–500 person companies.",
    team: "growth",
    project: "GTM",
    priority: "URGENT",
    stage: "IN_PROGRESS",
    assignmentType: "TEAM",
    assignees: [],
    primaryOwner: "growth-1",
    createdBy: "growth-lead",
    startOffset: -5,
    dueOffset: 3,
    estimateHours: 50,
    updateCadence: "DAILY",
    category: "Campaign",
    completionRule: "ALL_REQUIRED",
  },
  {
    title: "Rewrite the pricing page copy",
    description: "Lead with outcomes rather than feature lists, and make the team plan comparison legible.",
    team: "growth",
    project: "GTM",
    priority: "NORMAL",
    stage: "SUBMITTED",
    assignmentType: "INDIVIDUAL",
    assignees: ["growth-1"],
    createdBy: "growth-lead",
    startOffset: -8,
    dueOffset: 2,
    estimateHours: 10,
    category: "Website",
  },
  {
    title: "Weekly performance report",
    description: "Channel spend, pipeline and CAC for the leadership review.",
    team: "growth",
    priority: "NORMAL",
    stage: "ASSIGNED",
    assignmentType: "INDIVIDUAL",
    assignees: ["growth-2"],
    createdBy: "growth-lead",
    startOffset: 0,
    dueOffset: 2,
    estimateHours: 4,
    reviewRequired: false,
    recurrence: "WEEKLY",
    updateCadence: "NONE",
    category: "Reporting",
  },
  {
    title: "Cut paid acquisition cost by 15%",
    description: "Audit the campaign structure, kill the losing creatives, rebuild the audience segments.",
    team: "growth",
    project: "GTM",
    priority: "HIGH",
    stage: "OVERDUE",
    assignmentType: "INDIVIDUAL",
    assignees: ["growth-2"],
    createdBy: "owner",
    startOffset: -18,
    dueOffset: -2,
    estimateHours: 30,
    updateCadence: "WEEKLY",
    category: "Campaign",
  },
  {
    title: "Onboard Northwind Logistics",
    description: "Kick-off call, data import, admin training and a 30-day check-in schedule.",
    team: "success",
    priority: "HIGH",
    stage: "IN_PROGRESS",
    assignmentType: "MULTIPLE",
    assignees: ["cs-1", "cs-2"],
    primaryOwner: "cs-1",
    createdBy: "owner",
    startOffset: -4,
    dueOffset: 5,
    estimateHours: 26,
    category: "Onboarding",
    subtasks: ["Kick-off call", "Data import", "Admin training", "Day-30 check-in"],
    progressMode: "CHECKLIST",
  },
  {
    title: "Clear the support escalation backlog",
    description: "Twenty-three escalations older than a week. Triage, respond and close or hand to engineering.",
    team: "success",
    priority: "URGENT",
    stage: "AT_RISK",
    assignmentType: "INDIVIDUAL",
    assignees: ["cs-2"],
    createdBy: "owner",
    startOffset: -6,
    dueOffset: 1,
    estimateHours: 24,
    updateCadence: "DAILY",
    category: "Support",
  },
  {
    title: "Build the renewal risk playbook",
    description: "Document the signals that predict churn and the plays that address each one.",
    team: "success",
    priority: "NORMAL",
    stage: "DRAFT",
    assignmentType: "INDIVIDUAL",
    assignees: ["cs-1"],
    createdBy: "owner",
    startOffset: 1,
    dueOffset: 14,
    estimateHours: 16,
    category: "Process",
  },
  {
    title: "Quarterly customer health review",
    description: "Review every account over £10k, flag risk and assign follow-up owners.",
    team: "success",
    priority: "NORMAL",
    stage: "COMPLETED_ON_TIME",
    assignmentType: "TEAM",
    assignees: [],
    primaryOwner: "cs-1",
    createdBy: "owner",
    startOffset: -28,
    dueOffset: -14,
    estimateHours: 22,
    category: "Review",
  },
  {
    title: "Retire the legacy billing export",
    description: "Superseded by the finance integration. Kept for history only.",
    team: "engineering",
    priority: "LOW",
    stage: "CANCELLED",
    assignmentType: "INDIVIDUAL",
    assignees: ["eng-3"],
    createdBy: "eng-lead",
    startOffset: -15,
    dueOffset: -5,
    estimateHours: 6,
    category: "Maintenance",
  },
  {
    title: "Prepare the board pack for November",
    description: "Growth, retention and hiring plan, with the accountability metrics from the new dashboard.",
    team: "success",
    priority: "HIGH",
    stage: "ACKNOWLEDGED",
    assignmentType: "MULTIPLE",
    assignees: ["growth-lead", "eng-lead"],
    primaryOwner: "growth-lead",
    createdBy: "owner",
    startOffset: -2,
    dueOffset: 7,
    estimateHours: 18,
    updateCadence: "WEEKLY",
    category: "Leadership",
  },
];

const PROGRESS_NOTES = [
  "Pushed the first slice behind a feature flag and asked two reviewers to look at it.",
  "Finished the groundwork; the remaining work is the fiddly half.",
  "Paired with a teammate this morning and cleared most of the unknowns.",
  "Slower than planned — the third-party sandbox was down for half a day.",
  "Draft is ready for internal feedback before I take it any further.",
  "Tidied the edge cases and wrote the tests that were missing.",
];

const REMAINING_NOTES = [
  "Error handling, then the documentation.",
  "One integration test and the hand-off notes.",
  "Needs a review pass and a final tidy-up.",
  "Two of the four checklist items.",
];

const COMMENTS = [
  "Flagging this is the one I would most like finished before Thursday.",
  "I left notes in the shared doc — shout if anything is unclear.",
  "Can we split the last part into its own task? It is bigger than it looked.",
  "Thanks for the quick turnaround on this.",
  "Checked with the customer: the later date works for them.",
];

async function main() {
  console.log("Clearing existing data…");
  await clear();

  console.log("Creating settings…");
  await prisma.setting.createMany({
    data: [
      { key: "companyName", value: "MindLox" },
      { key: "defaultReviewRequired", value: "true" },
      { key: "defaultUpdateCadence", value: "ON_STATUS_CHANGE" },
      { key: "reminderOffsets", value: "48,24,2" },
      { key: "taskCodePrefix", value: "CAD" },
    ],
  });

  console.log("Creating people…");
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const users = new Map<string, { id: string; name: string }>();

  for (const person of PEOPLE) {
    const user = await prisma.user.create({
      data: {
        email: person.email,
        name: person.name,
        jobTitle: person.jobTitle,
        role: person.role,
        status: "ACTIVE",
        passwordHash,
        avatarColor: person.color,
        weeklyHours: person.weeklyHours ?? 40,
        timezone: person.timezone ?? "Europe/London",
        lastLoginAt: ago(int(0, 3), int(1, 20)),
        preferences: {
          create: {
            emailEnabled: false,
            reminderOffsets: person.role === "EMPLOYEE" ? "24,2" : "48,24,2",
          },
        },
      },
    });
    users.set(person.key, { id: user.id, name: user.name });
  }

  // One invited account that has not signed in, and one deactivated leaver —
  // both states the people table needs to render.
  const invited = await prisma.user.create({
    data: {
      email: "new.starter@cadence.test",
      name: "Ruth Nakamura",
      jobTitle: "Junior Designer",
      role: "EMPLOYEE",
      status: "INVITED",
      avatarColor: "#BE185D",
      inviteToken: "demo-invite-token-ruth",
      invitedAt: ago(2),
      preferences: { create: {} },
    },
  });
  const leaver = await prisma.user.create({
    data: {
      email: "former.colleague@cadence.test",
      name: "Oliver Grant",
      jobTitle: "Account Executive",
      role: "EMPLOYEE",
      status: "DEACTIVATED",
      passwordHash,
      avatarColor: "#64748B",
      deactivatedAt: ago(21),
      preferences: { create: {} },
    },
  });

  console.log("Creating teams…");
  const teams = new Map<string, { id: string; name: string; memberIds: string[] }>();
  for (const team of TEAMS) {
    const memberKeys = Array.from(new Set([...team.leads, ...team.members]));
    const created = await prisma.team.create({
      data: {
        name: team.name,
        slug: team.key,
        description: team.description,
        color: team.color,
        createdById: users.get("owner")!.id,
        createdAt: ago(60),
        memberships: {
          create: memberKeys.map((key) => ({
            userId: users.get(key)!.id,
            role: team.leads.includes(key) ? "LEAD" : "MEMBER",
            createdAt: ago(int(30, 59)),
          })),
        },
      },
    });
    teams.set(team.key, {
      id: created.id,
      name: created.name,
      memberIds: memberKeys.map((key) => users.get(key)!.id),
    });
  }
  // The invited starter already belongs to a team, so they appear in its roster.
  await prisma.teamMembership.create({
    data: { teamId: teams.get("design")!.id, userId: invited.id, role: "MEMBER" },
  });

  console.log("Creating projects…");
  const projects = new Map<string, string>();
  for (const project of [
    { key: "PLAT", name: "Platform foundations", teamKey: "engineering", color: "#0F7A52", description: "API, data model and infrastructure." },
    { key: "DSYS", name: "Design system", teamKey: "design", color: "#6341F0", description: "Shared components, tokens and patterns." },
    { key: "GTM", name: "Go to market", teamKey: "growth", color: "#C0304F", description: "Campaigns, website and lifecycle." },
  ]) {
    const created = await prisma.project.create({
      data: {
        key: project.key,
        name: project.name,
        description: project.description,
        color: project.color,
        teamId: teams.get(project.teamKey)!.id,
        createdAt: ago(55),
      },
    });
    projects.set(project.key, created.id);
  }

  console.log("Creating tasks…");
  let codeCounter = 0;

  for (const seed of TASKS) {
    codeCounter += 1;
    const code = `CAD-${String(codeCounter).padStart(3, "0")}`;
    const team = teams.get(seed.team)!;
    const creator = users.get(seed.createdBy)!;

    const assigneeIds =
      seed.assignmentType === "TEAM"
        ? team.memberIds
        : Array.from(new Set(seed.assignees.map((key) => users.get(key)!.id)));
    const primaryOwnerId = seed.primaryOwner ? users.get(seed.primaryOwner)!.id : assigneeIds[0] ?? null;

    const startDate = ago(-seed.startOffset);
    const dueAt = seed.dueOffset >= 0 ? ahead(seed.dueOffset, 9) : ago(-seed.dueOffset, -9);
    const createdAt = ago(-seed.startOffset + 1);

    // Resolve the staged lifecycle into concrete statuses, timestamps and progress.
    const stage = seed.stage;
    const isDraft = stage === "DRAFT";
    const assignedAt = isDraft ? null : createdAt;

    let taskStatus: string;
    let assigneeStatus: string;
    let progress: number;
    let acknowledgedAt: Date | null = null;
    let startedAt: Date | null = null;
    let blockedAt: Date | null = null;
    let submittedAt: Date | null = null;
    let reviewedAt: Date | null = null;
    let completedAt: Date | null = null;
    let cancelledAt: Date | null = null;

    switch (stage) {
      case "DRAFT":
        taskStatus = "DRAFT";
        assigneeStatus = "ASSIGNED";
        progress = 0;
        break;
      case "ASSIGNED":
        taskStatus = "ASSIGNED";
        assigneeStatus = "ASSIGNED";
        progress = 0;
        break;
      case "ACKNOWLEDGED":
        taskStatus = "ACKNOWLEDGED";
        assigneeStatus = "ACKNOWLEDGED";
        progress = 0;
        acknowledgedAt = ago(-seed.startOffset - 1);
        break;
      case "IN_PROGRESS":
        taskStatus = "IN_PROGRESS";
        assigneeStatus = "IN_PROGRESS";
        progress = int(35, 75);
        acknowledgedAt = ago(-seed.startOffset - 1);
        startedAt = ago(-seed.startOffset - 1, -2);
        break;
      case "AT_RISK":
        taskStatus = "IN_PROGRESS";
        assigneeStatus = "IN_PROGRESS";
        progress = int(10, 25);
        acknowledgedAt = ago(-seed.startOffset - 1);
        startedAt = ago(-seed.startOffset - 1, -2);
        break;
      case "OVERDUE":
        taskStatus = "IN_PROGRESS";
        assigneeStatus = "IN_PROGRESS";
        progress = int(40, 70);
        acknowledgedAt = ago(-seed.startOffset - 1);
        startedAt = ago(-seed.startOffset - 2);
        break;
      case "BLOCKED":
        taskStatus = "BLOCKED";
        assigneeStatus = "BLOCKED";
        progress = int(30, 55);
        acknowledgedAt = ago(-seed.startOffset - 1);
        startedAt = ago(-seed.startOffset - 2);
        blockedAt = ago(1, 4);
        break;
      case "SUBMITTED":
        taskStatus = "SUBMITTED_FOR_REVIEW";
        assigneeStatus = "SUBMITTED";
        progress = 100;
        acknowledgedAt = ago(-seed.startOffset - 1);
        startedAt = ago(-seed.startOffset - 2);
        submittedAt = ago(0, int(6, 30));
        break;
      case "CHANGES_REQUESTED":
        taskStatus = "CHANGES_REQUESTED";
        assigneeStatus = "CHANGES_REQUESTED";
        progress = int(70, 90);
        acknowledgedAt = ago(-seed.startOffset - 1);
        startedAt = ago(-seed.startOffset - 2);
        reviewedAt = ago(1, 2);
        break;
      case "COMPLETED_ON_TIME":
        taskStatus = "COMPLETED";
        assigneeStatus = "COMPLETED";
        progress = 100;
        acknowledgedAt = ago(-seed.startOffset - 1);
        startedAt = ago(-seed.startOffset - 2);
        submittedAt = new Date(dueAt.getTime() - 2 * DAY);
        reviewedAt = new Date(dueAt.getTime() - 1 * DAY);
        completedAt = new Date(dueAt.getTime() - 1 * DAY);
        break;
      case "COMPLETED_LATE":
        taskStatus = "COMPLETED";
        assigneeStatus = "COMPLETED";
        progress = 100;
        acknowledgedAt = ago(-seed.startOffset - 1);
        startedAt = ago(-seed.startOffset - 2);
        submittedAt = new Date(dueAt.getTime() + 2 * DAY);
        reviewedAt = new Date(dueAt.getTime() + 3 * DAY);
        completedAt = new Date(dueAt.getTime() + 3 * DAY);
        break;
      case "CANCELLED":
        taskStatus = "CANCELLED";
        assigneeStatus = "ASSIGNED";
        progress = int(10, 30);
        cancelledAt = ago(4);
        break;
      default:
        taskStatus = "ASSIGNED";
        assigneeStatus = "ASSIGNED";
        progress = 0;
    }

    const subtasks = seed.subtasks ?? [];
    const doneSubtasks = seed.progressMode === "CHECKLIST" ? Math.round((progress / 100) * subtasks.length) : 0;

    const task = await prisma.task.create({
      data: {
        code,
        title: seed.title,
        description: seed.description,
        instruction:
          seed.priority === "URGENT"
            ? "Post a short update at the end of each day, even if the answer is 'no change'."
            : null,
        priority: seed.priority,
        status: taskStatus,
        assignmentType: seed.assignmentType,
        completionRule: seed.completionRule ?? "ALL_REQUIRED",
        progressMode: seed.progressMode ?? "MANUAL",
        updateCadence: seed.updateCadence ?? "ON_STATUS_CHANGE",
        recurrence: seed.recurrence ?? "NONE",
        reviewRequired: seed.reviewRequired ?? true,
        progress,
        estimateHours: seed.estimateHours,
        category: seed.category,
        startDate,
        dueAt,
        originalDueAt: dueAt,
        teamId: team.id,
        projectId: seed.project ? projects.get(seed.project)! : null,
        createdById: creator.id,
        primaryOwnerId: isDraft ? primaryOwnerId : primaryOwnerId,
        assignedAt,
        acknowledgedAt,
        startedAt,
        blockedAt,
        submittedAt,
        reviewedAt,
        completedAt,
        cancelledAt,
        lastProgressAt: startedAt ? ago(int(0, 3), int(1, 10)) : null,
        createdAt,
        assignees: {
          create: assigneeIds.map((userId, index) => ({
            userId,
            isRequired: true,
            isPrimary: userId === primaryOwnerId,
            viaTeam: seed.assignmentType === "TEAM",
            status: index === 0 ? assigneeStatus : stage === "IN_PROGRESS" ? "IN_PROGRESS" : assigneeStatus,
            progress: index === 0 ? progress : Math.max(0, progress - int(5, 20)),
            acknowledgedAt,
            startedAt,
            submittedAt: assigneeStatus === "SUBMITTED" || assigneeStatus === "COMPLETED" ? submittedAt : null,
            completedAt: assigneeStatus === "COMPLETED" ? completedAt : null,
            lastUpdateAt: startedAt ? ago(int(0, 3), int(1, 10)) : null,
            createdAt,
          })),
        },
        subtasks: {
          create: subtasks.map((title, index) => ({
            title,
            position: index,
            isDone: index < doneSubtasks,
            completedById: index < doneSubtasks ? assigneeIds[0] : null,
            completedAt: index < doneSubtasks ? ago(int(1, 5)) : null,
          })),
        },
      },
      include: { assignees: true },
    });

    await prisma.activityLog.create({
      data: {
        taskId: task.id,
        teamId: team.id,
        actorId: creator.id,
        action: "TASK_CREATED",
        summary: `${creator.name} created ${code} — ${seed.title}`,
        createdAt,
      },
    });

    if (!isDraft) {
      await prisma.activityLog.create({
        data: {
          taskId: task.id,
          teamId: team.id,
          actorId: creator.id,
          action: "TASK_ASSIGNED",
          summary: `${creator.name} assigned ${code} to ${
            seed.assignmentType === "TEAM" ? `the ${team.name} team` : `${assigneeIds.length} ${assigneeIds.length === 1 ? "person" : "people"}`
          }`,
          createdAt,
        },
      });
    }

    // --- progress history -------------------------------------------------
    const updateCount =
      stage === "DRAFT" || stage === "ASSIGNED" || stage === "ACKNOWLEDGED" || stage === "CANCELLED" ? 0 : int(2, 4);
    const author = task.assignees[0];
    for (let i = 0; i < updateCount; i += 1) {
      const step = Math.round(((i + 1) / (updateCount + 1)) * progress);
      await prisma.progressUpdate.create({
        data: {
          taskId: task.id,
          userId: author.userId,
          kind: "UPDATE",
          progress: step,
          workCompleted: pick(PROGRESS_NOTES),
          workRemaining: pick(REMAINING_NOTES),
          expectedCompletion: dueAt,
          createdAt: new Date(startDate.getTime() + (i + 1) * ((NOW.getTime() - startDate.getTime()) / (updateCount + 2))),
        },
      });
    }

    if (stage === "BLOCKED") {
      await prisma.progressUpdate.create({
        data: {
          taskId: task.id,
          userId: author.userId,
          kind: "BLOCKER",
          progress,
          blockers:
            "The staging database keeps dropping connections under load, so I cannot measure whether the new indexes help.",
          helpNeeded: "Someone from platform to look at the connection limits, or a bigger staging instance for a day.",
          createdAt: blockedAt!,
        },
      });
      await prisma.activityLog.create({
        data: {
          taskId: task.id,
          teamId: team.id,
          actorId: author.userId,
          action: "BLOCKER_REPORTED",
          summary: `${users.get(seed.assignees[0])?.name ?? "An assignee"} is blocked on ${code}`,
          createdAt: blockedAt!,
        },
      });
      for (const recipient of [creator.id, users.get("owner")!.id]) {
        if (recipient === author.userId) continue;
        await prisma.notification.create({
          data: {
            userId: recipient,
            actorId: author.userId,
            taskId: task.id,
            type: "BLOCKER_REPORTED",
            title: `Blocker on ${code}: ${seed.title}`,
            body: "The staging database keeps dropping connections under load.",
            href: `/tasks/${task.id}`,
            createdAt: blockedAt!,
          },
        });
      }
    }

    if (stage === "SUBMITTED" || stage === "COMPLETED_ON_TIME" || stage === "COMPLETED_LATE" || stage === "CHANGES_REQUESTED") {
      const summary =
        "Everything in the description is done. Tests pass, the documentation is updated, and I have noted two follow-ups in the comments.";
      await prisma.progressUpdate.create({
        data: {
          taskId: task.id,
          userId: author.userId,
          kind: "SUBMISSION",
          progress: stage === "CHANGES_REQUESTED" ? progress : 100,
          workCompleted: summary,
          createdAt: submittedAt ?? reviewedAt ?? ago(1),
        },
      });

      const decision =
        stage === "SUBMITTED" ? "PENDING" : stage === "CHANGES_REQUESTED" ? "CHANGES_REQUESTED" : "APPROVED";
      const reviewer = creator.id === author.userId ? users.get("owner")!.id : creator.id;

      await prisma.taskReview.create({
        data: {
          taskId: task.id,
          round: 1,
          submittedById: author.userId,
          summary,
          decision,
          feedback:
            decision === "CHANGES_REQUESTED"
              ? "The fix works, but there is no regression test for the reassign path. Please add one before this goes out."
              : decision === "APPROVED"
                ? "Approved — thank you for the clear summary."
                : null,
          decidedById: decision === "PENDING" ? null : reviewer,
          submittedAt: submittedAt ?? ago(1),
          decidedAt: decision === "PENDING" ? null : (reviewedAt ?? ago(1)),
        },
      });

      await prisma.activityLog.create({
        data: {
          taskId: task.id,
          teamId: team.id,
          actorId: author.userId,
          action: "SUBMITTED_FOR_REVIEW",
          summary: `${task.assignees.length > 0 ? users.get(seed.assignees[0] ?? "owner")?.name ?? "An assignee" : "An assignee"} submitted ${code} for review`,
          createdAt: submittedAt ?? ago(1),
        },
      });

      if (decision === "PENDING") {
        await prisma.notification.create({
          data: {
            userId: reviewer,
            actorId: author.userId,
            taskId: task.id,
            type: "SUBMITTED_FOR_REVIEW",
            title: `${code} is ready for review`,
            body: summary.slice(0, 160),
            href: `/tasks/${task.id}`,
            createdAt: submittedAt ?? ago(1),
          },
        });
      }
      if (decision === "CHANGES_REQUESTED") {
        await prisma.notification.create({
          data: {
            userId: author.userId,
            actorId: reviewer,
            taskId: task.id,
            type: "CHANGES_REQUESTED",
            title: `Changes requested on ${code}`,
            body: "The fix works, but there is no regression test for the reassign path.",
            href: `/tasks/${task.id}`,
            createdAt: reviewedAt ?? ago(1),
          },
        });
        await prisma.activityLog.create({
          data: {
            taskId: task.id,
            teamId: team.id,
            actorId: reviewer,
            action: "REVIEW_CHANGES_REQUESTED",
            summary: `${creator.name} requested changes on ${code}`,
            createdAt: reviewedAt ?? ago(1),
          },
        });
      }
      if (decision === "APPROVED") {
        await prisma.activityLog.create({
          data: {
            taskId: task.id,
            teamId: team.id,
            actorId: reviewer,
            action: "REVIEW_APPROVED",
            summary: `${creator.name} approved ${code}`,
            createdAt: reviewedAt ?? ago(1),
          },
        });
      }
    }

    // --- comments ---------------------------------------------------------
    if (stage !== "DRAFT") {
      const commentCount = int(0, 3);
      for (let i = 0; i < commentCount; i += 1) {
        const commenter = i % 2 === 0 ? creator.id : author.userId;
        await prisma.comment.create({
          data: {
            taskId: task.id,
            authorId: commenter,
            body: pick(COMMENTS),
            createdAt: new Date(createdAt.getTime() + (i + 1) * 8 * HOUR),
          },
        });
      }
    }

    // --- an open update request on the quiet ones -------------------------
    if (stage === "AT_RISK" || stage === "OVERDUE") {
      await prisma.updateRequest.create({
        data: {
          taskId: task.id,
          requestedById: creator.id,
          requestedOfId: author.userId,
          message: "Where has this got to? I need a realistic finish date before the leadership review.",
          dueAt: ahead(1),
          createdAt: ago(1, 3),
        },
      });
      await prisma.notification.create({
        data: {
          userId: author.userId,
          actorId: creator.id,
          taskId: task.id,
          type: "UPDATE_REQUESTED",
          title: `Update requested on ${code}`,
          body: "Where has this got to? I need a realistic finish date before the leadership review.",
          href: `/tasks/${task.id}`,
          createdAt: ago(1, 3),
        },
      });
    }

    // --- a pending extension request --------------------------------------
    if (stage === "OVERDUE" && codeCounter % 2 === 0) {
      await prisma.extensionRequest.create({
        data: {
          taskId: task.id,
          requestedById: author.userId,
          currentDueAt: dueAt,
          requestedDueAt: ahead(5),
          reason:
            "Two of the four sections need data I only get after the month-end close. Five more days and it is finished properly.",
          status: "PENDING",
          createdAt: ago(0, 20),
        },
      });
      await prisma.notification.create({
        data: {
          userId: creator.id,
          actorId: author.userId,
          taskId: task.id,
          type: "EXTENSION_REQUESTED",
          title: `Extension requested on ${code}`,
          body: "Five more days to finish the last two sections properly.",
          href: `/tasks/${task.id}`,
          createdAt: ago(0, 20),
        },
      });
    }

    // --- a deadline that moved once --------------------------------------
    if (stage === "AT_RISK") {
      const previous = new Date(dueAt.getTime() - 3 * DAY);
      await prisma.deadlineChange.create({
        data: {
          taskId: task.id,
          fromDueAt: previous,
          toDueAt: dueAt,
          reason: "Moved after the research interviews ran long.",
          changedById: creator.id,
          createdAt: ago(3),
        },
      });
      await prisma.task.update({ where: { id: task.id }, data: { originalDueAt: previous } });
      await prisma.activityLog.create({
        data: {
          taskId: task.id,
          teamId: team.id,
          actorId: creator.id,
          action: "DEADLINE_CHANGED",
          summary: `${creator.name} moved the ${code} deadline by 3 days`,
          createdAt: ago(3),
        },
      });
    }

    // --- assignment notifications for live work ---------------------------
    if (!isDraft && (stage === "ASSIGNED" || stage === "ACKNOWLEDGED")) {
      for (const assignee of task.assignees) {
        if (assignee.userId === creator.id) continue;
        await prisma.notification.create({
          data: {
            userId: assignee.userId,
            actorId: creator.id,
            taskId: task.id,
            type: "TASK_ASSIGNED",
            title: `New task: ${seed.title}`,
            body: `${creator.name} assigned you ${code}.`,
            href: `/tasks/${task.id}`,
            readAt: stage === "ACKNOWLEDGED" ? ago(1) : null,
            createdAt,
          },
        });
      }
    }
  }

  await prisma.counter.create({ data: { key: "taskCode", value: codeCounter } });

  await prisma.auditLog.createMany({
    data: [
      {
        actorId: users.get("owner")!.id,
        action: "USER_DEACTIVATED",
        entityType: "User",
        entityId: leaver.id,
        before: JSON.stringify({ status: "ACTIVE" }),
        after: JSON.stringify({ status: "DEACTIVATED", openTasks: 0 }),
        createdAt: ago(21),
      },
      {
        actorId: users.get("owner")!.id,
        action: "USER_INVITED",
        entityType: "User",
        entityId: invited.id,
        after: JSON.stringify({ email: invited.email, role: "EMPLOYEE" }),
        createdAt: ago(2),
      },
      {
        actorId: users.get("owner")!.id,
        action: "SETTINGS_UPDATED",
        entityType: "Setting",
        entityId: "company",
        before: JSON.stringify({ reminderOffsets: "24,2" }),
        after: JSON.stringify({ reminderOffsets: "48,24,2" }),
        createdAt: ago(9),
      },
    ],
  });

  const counts = {
    users: await prisma.user.count(),
    teams: await prisma.team.count(),
    projects: await prisma.project.count(),
    tasks: await prisma.task.count(),
    assignments: await prisma.taskAssignee.count(),
    progressUpdates: await prisma.progressUpdate.count(),
    comments: await prisma.comment.count(),
    reviews: await prisma.taskReview.count(),
    notifications: await prisma.notification.count(),
    activity: await prisma.activityLog.count(),
  };

  console.log("\nSeed complete:", counts);
  console.log(`\nSign in with any of these (password: ${DEMO_PASSWORD}):`);
  console.log("  owner@cadence.test     — Amara Osei, owner");
  console.log("  daniel@cadence.test    — Daniel Reyes, manager (Engineering lead)");
  console.log("  priya@cadence.test     — Priya Nandakumar, manager (Design lead)");
  console.log("  mei@cadence.test       — Mei Chen, employee");
  console.log("  luca@cadence.test      — Luca Moretti, employee");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
