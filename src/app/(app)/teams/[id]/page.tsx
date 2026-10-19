import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FolderKanban } from "lucide-react";

import { MemberManager } from "@/app/(app)/teams/[id]/member-manager";
import { TaskTable } from "@/components/task/task-table";
import { ButtonLink } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  EmptyState,
  Method,
  PageHeader,
  ProgressBar,
  StatCard,
} from "@/components/ui/primitives";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { canManageMembership, isOwner } from "@/server/permissions";
import { getTeamDetail } from "@/server/services/teams";
import { listTasks } from "@/server/services/tasks";
import { ACTIVE_TASK_STATUSES, TASK_PRIORITY_WEIGHT, type TaskPriority, type TaskStatus } from "@/lib/enums";
import { taskHealth, workloadScore } from "@/lib/task-health";
import { ratioPct } from "@/lib/utils";
import { taskFilterSchema } from "@/lib/validation";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const team = await prisma.team.findUnique({ where: { id }, select: { name: true } });
  return { title: team?.name ?? "Team" };
}

export default async function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  let detail: Awaited<ReturnType<typeof getTeamDetail>>;
  try {
    detail = await getTeamDetail(user, id);
  } catch (error) {
    if (error instanceof AppError && (error.code === "NOT_FOUND" || error.code === "FORBIDDEN")) notFound();
    throw error;
  }

  const { team, workload } = detail;
  const canManage = canManageMembership(user, team.id);

  const filter = taskFilterSchema.parse({ teamId: team.id, pageSize: 25, sort: "dueAt", dir: "asc" });
  const [tasks, addable] = await Promise.all([
    listTasks(user, filter),
    canManage
      ? prisma.user.findMany({
          where: {
            status: { not: "DEACTIVATED" },
            memberships: { none: { teamId: team.id } },
          },
          select: { id: true, name: true, jobTitle: true, avatarColor: true, role: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const now = new Date();
  const allTasks = await prisma.task.findMany({
    where: { teamId: team.id, archivedAt: null },
    select: { status: true, progress: true, startDate: true, dueAt: true, priority: true, completedAt: true, originalDueAt: true },
  });

  const active = allTasks.filter((task) => ACTIVE_TASK_STATUSES.includes(task.status as TaskStatus));
  const completed = allTasks.filter((task) => task.status === "COMPLETED");
  const overdue = active.filter(
    (task) =>
      taskHealth(
        { status: task.status as TaskStatus, progress: task.progress, startDate: task.startDate, dueAt: task.dueAt },
        now,
      ) === "OVERDUE",
  );
  const onTime = completed.filter((task) => {
    const due = task.originalDueAt ?? task.dueAt;
    return !due || !task.completedAt || task.completedAt <= due;
  });

  // Per-member load, from the same shared helper the reports use.
  const loadByUser = new Map<string, { weighted: number; hours: number; active: number; blocked: number }>();
  for (const membership of team.memberships) {
    const rows = workload.filter((row) => row.userId === membership.userId);
    const score = workloadScore(
      rows.map((row) => ({
        priorityWeight: TASK_PRIORITY_WEIGHT[row.task.priority as TaskPriority] ?? 2,
        requiredAssignees: 1,
        estimateHours: row.task.estimateHours,
      })),
    );
    loadByUser.set(membership.userId, {
      weighted: score.weighted,
      hours: score.hours,
      active: rows.length,
      blocked: rows.filter((row) => row.status === "BLOCKED").length,
    });
  }
  const maxLoad = Math.max(1, ...Array.from(loadByUser.values()).map((row) => row.weighted));

  return (
    <div className="mx-auto max-w-[100rem]">
      <nav aria-label="Breadcrumb" className="mb-3 text-xs text-fg-subtle">
        <ol className="flex items-center gap-1.5">
          <li>
            <Link href="/teams" className="hover:text-fg hover:underline">
              Teams
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li className="font-semibold text-fg-muted">{team.name}</li>
        </ol>
      </nav>

      <PageHeader
        title={team.name}
        description={team.description ?? undefined}
        meta={
          <>
            <span className="chip bg-surface-2 text-fg-muted">
              <span className="size-1.5 rounded-full" style={{ backgroundColor: team.color }} aria-hidden="true" />
              {team.memberships.length} {team.memberships.length === 1 ? "member" : "members"}
            </span>
            {team.archivedAt ? <span className="chip chip-CANCELLED">Archived</span> : null}
            {team.createdBy ? <span className="text-xs text-fg-subtle">Created by {team.createdBy.name}</span> : null}
          </>
        }
        actions={
          <>
            <ButtonLink href={`/tasks?teamId=${team.id}`} variant="secondary">
              All team tasks
            </ButtonLink>
            {isOwner(user) || user.ledTeamIds.includes(team.id) ? (
              <ButtonLink href="/tasks/new" variant="primary">
                Assign work
              </ButtonLink>
            ) : null}
          </>
        }
      />

      <div className="enter grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Active tasks" value={active.length} />
        <StatCard label="Completed" value={completed.length} tone="success" />
        <StatCard
          label="Overdue"
          value={overdue.length}
          tone={overdue.length > 0 ? "danger" : "default"}
        />
        <StatCard
          label="Blocked"
          value={active.filter((task) => task.status === "BLOCKED").length}
          tone={active.some((task) => task.status === "BLOCKED") ? "danger" : "default"}
        />
        <StatCard label="In review" value={active.filter((task) => task.status === "SUBMITTED_FOR_REVIEW").length} />
        <StatCard
          label="On-time rate"
          value={completed.length > 0 ? `${ratioPct(onTime.length, completed.length)}%` : "—"}
          hint="Against the original deadline"
        />
      </div>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader
              title="Team tasks"
              description={undefined}
            />
            <TaskTable
              tasks={tasks.items}
              sort="dueAt"
              dir="asc"
              buildSortHref={(field) => `/tasks?teamId=${team.id}&sort=${field}`}
              highlightUserId={user.id}
            />
            {tasks.total > tasks.items.length ? (
              <div className="border-t border-border p-3 text-center">
                <ButtonLink href={`/tasks?teamId=${team.id}`} size="sm" variant="secondary">
                  See all {tasks.total} tasks
                </ButtonLink>
              </div>
            ) : null}
          </Card>

          <Card>
            <CardHeader
              title="Workload by person"
              description="Open work, weighted by priority."
            />
            {team.memberships.length === 0 ? (
              <EmptyState compact title="No members yet" />
            ) : (
              <ul className="divide-y divide-border">
                {team.memberships.map((membership) => {
                  const load = loadByUser.get(membership.userId) ?? { weighted: 0, hours: 0, active: 0, blocked: 0 };
                  return (
                    <li key={membership.id} className="flex items-center gap-3 p-3">
                      <span className="min-w-0 flex-1">
                        <Link
                          href={`/employees/${membership.userId}`}
                          className="block truncate text-xs font-semibold text-fg hover:text-primary hover:underline"
                        >
                          {membership.user.name}
                        </Link>
                        <span className="block truncate text-[10px] text-fg-subtle">
                          {membership.user.jobTitle ?? membership.user.role}
                          {membership.role === "LEAD" ? " · team lead" : ""}
                          {membership.user.status !== "ACTIVE" ? ` · ${membership.user.status.toLowerCase()}` : ""}
                        </span>
                      </span>
                      <span className="w-28 shrink-0">
                        <ProgressBar
                          value={(load.weighted / maxLoad) * 100}
                          tone={load.blocked > 0 ? "BLOCKED" : "IN_PROGRESS"}
                          size="sm"
                          label={`${membership.user.name}: ${load.weighted} weighted open tasks`}
                        />
                      </span>
                      <span className="tnum w-24 shrink-0 text-right text-[11px] text-fg-muted">
                        {load.active} open · {load.weighted}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="border-t border-border px-3 pb-3">
              <Method>Weighted load = priority weights of open tasks (Low 1 → Urgent 4).</Method>
            </div>
          </Card>
        </div>

        <aside className="min-w-0 space-y-4">
          <MemberManager
            teamId={team.id}
            canManage={canManage}
            canAppointLeads={isOwner(user)}
            viewerId={user.id}
            members={team.memberships.map((membership) => ({
              id: membership.id,
              userId: membership.userId,
              name: membership.user.name,
              jobTitle: membership.user.jobTitle,
              avatarColor: membership.user.avatarColor,
              role: membership.role,
              status: membership.user.status,
              email: membership.user.email,
            }))}
            addable={addable}
          />

          <Card>
            <CardHeader title="Projects" level={3} description={undefined} />
            {team.projects.length === 0 ? (
              <EmptyState
                compact
                icon={<FolderKanban className="size-5" aria-hidden="true" />}
                title="No projects"
              />
            ) : (
              <ul className="divide-y divide-border">
                {team.projects.map((project) => (
                  <li key={project.id} className="flex items-center gap-2.5 p-3">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: project.color }} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <Link
                        href={`/tasks?projectId=${project.id}`}
                        className="block truncate text-xs font-semibold text-fg hover:text-primary hover:underline"
                      >
                        {project.name}
                      </Link>
                      <span className="tnum block font-mono text-[10px] text-fg-subtle">{project.key}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>


        </aside>
      </div>
    </div>
  );
}
