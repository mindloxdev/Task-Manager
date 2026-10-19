import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PersonAdmin } from "@/app/(app)/employees/[id]/person-admin";
import { ProgressTimeline } from "@/app/(app)/tasks/[id]/progress-timeline";
import { TaskTable } from "@/components/task/task-table";
import { ButtonLink } from "@/components/ui/button";
import {
  Avatar,
  Card,
  CardHeader,
  EmptyState,
  KeyValue,
  StatCard,
} from "@/components/ui/primitives";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { isOwner } from "@/server/permissions";
import { getUserProfile, listEmployees } from "@/server/services/users";
import { listTasks } from "@/server/services/tasks";
import { USER_ROLE_LABEL, USER_STATUS_LABEL, type UserRole, type UserStatus } from "@/lib/enums";
import { formatDateTime, formatRelative } from "@/lib/dates";
import { taskFilterSchema } from "@/lib/validation";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const person = await prisma.user.findUnique({ where: { id }, select: { name: true } });
  return { title: person?.name ?? "Person" };
}

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  let profile: Awaited<ReturnType<typeof getUserProfile>>;
  try {
    profile = await getUserProfile(user, id);
  } catch (error) {
    if (error instanceof AppError && (error.code === "NOT_FOUND" || error.code === "FORBIDDEN")) notFound();
    throw error;
  }

  const [rows, tasks, updates] = await Promise.all([
    listEmployees(user, { includeInactive: true }),
    listTasks(user, taskFilterSchema.parse({ assigneeId: id, pageSize: 50, sort: "dueAt", dir: "asc" })),
    prisma.progressUpdate.findMany({
      where: { userId: id },
      include: { task: { select: { id: true, code: true, title: true } } },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
  ]);

  const stats = rows.find((row) => row.id === id);
  const isSelf = user.id === id;

  return (
    <div className="mx-auto max-w-[100rem]">
      <nav aria-label="Breadcrumb" className="mb-3 text-xs text-fg-subtle">
        <ol className="flex items-center gap-1.5">
          <li>
            <Link href="/employees" className="hover:text-fg hover:underline">
              People
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li className="font-semibold text-fg-muted">{profile.name}</li>
        </ol>
      </nav>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Avatar name={profile.name} color={profile.avatarColor} size="lg" />
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-fg">{profile.name}</h1>
            <p className="mt-0.5 text-sm text-fg-muted">{profile.jobTitle ?? USER_ROLE_LABEL[profile.role as UserRole]}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="chip bg-surface-2 text-fg-muted">{USER_ROLE_LABEL[profile.role as UserRole]}</span>
              <span
                className={`chip ${profile.status === "ACTIVE" ? "chip-COMPLETED" : profile.status === "INVITED" ? "chip-ASSIGNED" : "chip-CANCELLED"}`}
              >
                {USER_STATUS_LABEL[profile.status as UserStatus]}
              </span>
              {profile.memberships.map((membership) => (
                <Link key={membership.id} href={`/teams/${membership.teamId}`} className="chip bg-surface-2 text-fg-muted hover:bg-surface-3">
                  <span className="size-1.5 rounded-full" style={{ backgroundColor: membership.team.color }} aria-hidden="true" />
                  {membership.team.name}
                  {membership.role === "LEAD" ? " ★" : ""}
                </Link>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ButtonLink href={`/tasks?assigneeId=${id}`} variant="secondary">
            All their tasks
          </ButtonLink>
          {isOwner(user) && !isSelf ? (
            <PersonAdmin
              person={{
                id: profile.id,
                name: profile.name,
                role: profile.role as UserRole,
                status: profile.status as UserStatus,
              }}
            />
          ) : null}
        </div>
      </div>

      {stats ? (
        <div className="enter grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Active tasks" value={stats.activeTasks} />
          <StatCard label="Completed" value={stats.completedTasks} tone="success" />
          <StatCard label="Overdue" value={stats.overdueTasks} tone={stats.overdueTasks > 0 ? "danger" : "default"} />
          <StatCard label="Blocked" value={stats.blockedTasks} tone={stats.blockedTasks > 0 ? "danger" : "default"} />
          <StatCard
            label="Owes an update"
            value={stats.pendingUpdateRequests}
            tone={stats.pendingUpdateRequests > 0 ? "warning" : "default"}
          />
          <StatCard
            label="Weighted load"
            value={stats.workloadWeighted}
            hint={stats.workloadHours > 0 ? `${stats.workloadHours} estimated hours` : "No estimates set"}
          />
        </div>
      ) : null}

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader
              title="Their tasks"
              description={undefined}
            />
            <TaskTable
              tasks={tasks.items}
              sort="dueAt"
              dir="asc"
              buildSortHref={(field) => `/tasks?assigneeId=${id}&sort=${field}`}
              highlightUserId={id}
            />
          </Card>

          <Card>
            <CardHeader title="Recent progress reports" />
            <div className="p-4">
              {updates.length === 0 ? (
                <EmptyState compact title="No progress reports yet" />
              ) : (
                <ProgressTimeline
                  updates={updates.map((update) => ({
                    id: update.id,
                    kind: update.kind,
                    progress: update.progress,
                    workCompleted: update.workCompleted
                      ? `${update.task.code}: ${update.workCompleted}`
                      : `On ${update.task.code}`,
                    workRemaining: update.workRemaining,
                    blockers: update.blockers,
                    helpNeeded: update.helpNeeded,
                    expectedCompletion: update.expectedCompletion,
                    linkUrl: update.linkUrl,
                    createdAt: update.createdAt,
                    authorName: profile.name,
                    authorColor: profile.avatarColor,
                  }))}
                />
              )}
            </div>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader title="Profile" level={3} />
            <dl className="space-y-3 p-4">
              <KeyValue label="Email">
                <span className="break-all">{profile.email}</span>
              </KeyValue>
              <KeyValue label="Time zone">{profile.timezone}</KeyValue>
              <KeyValue label="Contracted hours">{profile.weeklyHours} a week</KeyValue>
              <KeyValue label="Joined">{formatDateTime(profile.createdAt, user.timezone)}</KeyValue>
              <KeyValue label="Last signed in">
                {profile.lastLoginAt ? formatRelative(profile.lastLoginAt) : "Never"}
              </KeyValue>
              {profile.status === "INVITED" ? (
                <KeyValue label="Invited">
                  {profile.invitedAt ? formatRelative(profile.invitedAt) : "—"} · not yet accepted
                </KeyValue>
              ) : null}
              {profile.deactivatedAt ? (
                <KeyValue label="Deactivated">{formatRelative(profile.deactivatedAt)}</KeyValue>
              ) : null}
            </dl>
          </Card>

        </aside>
      </div>
    </div>
  );
}
