/**
 * Test fixtures.
 *
 * Every test builds its own small company, then calls the service layer with a
 * `SessionUser` exactly as a request handler would — so the permission checks,
 * transactions and rollup logic under test are the production ones.
 */
import { prisma } from "@/server/db";
import { toSessionUser, type SessionUser } from "@/server/auth";
import type { UserRole } from "@/lib/enums";

/** Wipes every table, child rows first. */
export async function resetDatabase(): Promise<void> {
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

export async function createUser(params: {
  email: string;
  name: string;
  role?: UserRole;
  status?: "ACTIVE" | "INVITED" | "DEACTIVATED";
}): Promise<{ id: string; email: string; name: string }> {
  const user = await prisma.user.create({
    data: {
      email: params.email,
      name: params.name,
      role: params.role ?? "EMPLOYEE",
      status: params.status ?? "ACTIVE",
      // A real hash is not needed: these tests drive the service layer, not login.
      passwordHash: "$2a$12$notarealhashnotarealhashnotarealhashnotarealhashnota",
      preferences: { create: {} },
    },
  });
  return { id: user.id, email: user.email, name: user.name };
}

export async function createTeam(params: {
  name: string;
  slug?: string;
  leadIds?: string[];
  memberIds?: string[];
  createdById?: string;
}): Promise<string> {
  const leads = params.leadIds ?? [];
  const members = (params.memberIds ?? []).filter((id) => !leads.includes(id));
  const team = await prisma.team.create({
    data: {
      name: params.name,
      slug: params.slug ?? params.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      createdById: params.createdById,
      memberships: {
        create: [
          ...leads.map((userId) => ({ userId, role: "LEAD" })),
          ...members.map((userId) => ({ userId, role: "MEMBER" })),
        ],
      },
    },
  });
  return team.id;
}

/** Builds the SessionUser a request handler would hand to the services. */
export async function session(userId: string): Promise<SessionUser> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { memberships: { include: { team: { select: { id: true, name: true, archivedAt: true } } } } },
  });
  return toSessionUser(user);
}

export type Company = {
  owner: SessionUser;
  manager: SessionUser;
  otherManager: SessionUser;
  employee: SessionUser;
  employee2: SessionUser;
  outsider: SessionUser;
  teamId: string;
  otherTeamId: string;
};

/**
 * The standard fixture: one owner, two teams with their own leads, two
 * employees in the first team, and one person with no connection to it.
 */
export async function seedCompany(): Promise<Company> {
  await resetDatabase();
  await prisma.setting.create({ data: { key: "taskCodePrefix", value: "TST" } });

  const owner = await createUser({ email: "owner@test.local", name: "Olive Owner", role: "OWNER" });
  const manager = await createUser({ email: "manager@test.local", name: "Mandy Manager", role: "MANAGER" });
  const otherManager = await createUser({ email: "other@test.local", name: "Otto Other", role: "MANAGER" });
  const employee = await createUser({ email: "emp1@test.local", name: "Eve Employee" });
  const employee2 = await createUser({ email: "emp2@test.local", name: "Evan Employee" });
  const outsider = await createUser({ email: "outside@test.local", name: "Oscar Outsider" });

  const teamId = await createTeam({
    name: "Delivery",
    leadIds: [manager.id],
    memberIds: [employee.id, employee2.id],
    createdById: owner.id,
  });
  const otherTeamId = await createTeam({
    name: "Finance",
    leadIds: [otherManager.id],
    memberIds: [outsider.id],
    createdById: owner.id,
  });

  return {
    owner: await session(owner.id),
    manager: await session(manager.id),
    otherManager: await session(otherManager.id),
    employee: await session(employee.id),
    employee2: await session(employee2.id),
    outsider: await session(outsider.id),
    teamId,
    otherTeamId,
  };
}

/** Input for `createTask` with the defaults a test rarely cares about filled in. */
export function taskInput(overrides: Record<string, unknown> = {}) {
  return {
    title: "Test task",
    description: "A task created by the test suite.",
    instruction: null,
    priority: "NORMAL" as const,
    assignmentType: "INDIVIDUAL" as const,
    completionRule: "ALL_REQUIRED" as const,
    progressMode: "MANUAL" as const,
    updateCadence: "ON_STATUS_CHANGE" as const,
    recurrence: "NONE" as const,
    reviewRequired: true,
    teamId: null as string | null,
    projectId: null as string | null,
    assigneeIds: [] as string[],
    primaryOwnerId: null as string | null,
    optionalAssigneeIds: [] as string[],
    startDate: null as Date | null,
    dueAt: null as Date | null,
    estimateHours: null as number | null,
    category: null as string | null,
    subtasks: [] as { title: string; isDone: boolean }[],
    links: [] as { url: string; label: string | null }[],
    asDraft: false,
    ...overrides,
  };
}

export const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 60 * 60 * 1000);
export const daysFromNow = (days: number) => hoursFromNow(days * 24);

/** Notifications of a given type delivered to a person. */
export async function notificationsFor(userId: string, type?: string) {
  return prisma.notification.findMany({
    where: { userId, ...(type ? { type } : {}) },
    orderBy: { createdAt: "asc" },
  });
}

export async function taskRow(taskId: string) {
  return prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: { assignees: { include: { user: { select: { name: true } } } }, reviews: true, subtasks: true },
  });
}

export async function assigneeRow(taskId: string, userId: string) {
  return prisma.taskAssignee.findUniqueOrThrow({ where: { taskId_userId: { taskId, userId } } });
}
