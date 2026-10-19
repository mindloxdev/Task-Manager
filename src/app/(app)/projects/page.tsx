import type { Metadata } from "next";
import Link from "next/link";
import { FolderKanban } from "lucide-react";

import { CreateProjectButton } from "@/app/(app)/projects/create-project";
import { Card, CardHeader, EmptyState, PageHeader, ProgressBar } from "@/components/ui/primitives";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { isOwner } from "@/server/permissions";
import { listProjects } from "@/server/services/teams";
import { ACTIVE_TASK_STATUSES, type TaskStatus } from "@/lib/enums";
import { taskHealth } from "@/lib/task-health";
import { ratioPct } from "@/lib/utils";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const user = await requireUser();
  const canCreate = isOwner(user) || user.ledTeamIds.length > 0;

  const [projects, teams, tasks] = await Promise.all([
    listProjects(user),
    canCreate
      ? prisma.team.findMany({
          where: { archivedAt: null, ...(isOwner(user) ? {} : { id: { in: user.ledTeamIds } }) },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    prisma.task.findMany({
      where: { archivedAt: null, projectId: { not: null } },
      select: { projectId: true, status: true, progress: true, startDate: true, dueAt: true },
    }),
  ]);

  const now = new Date();

  return (
    <div className="mx-auto max-w-[100rem]">
      <PageHeader
        title="Projects"
        description="Group related tasks for reporting."
        actions={canCreate ? <CreateProjectButton teams={teams} /> : null}
      />

      {projects.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FolderKanban className="size-5" aria-hidden="true" />}
            title="No projects yet"
            description={undefined}
          />
        </Card>
      ) : (
        <div className="enter grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            const projectTasks = tasks.filter((task) => task.projectId === project.id);
            const completed = projectTasks.filter((task) => task.status === "COMPLETED").length;
            const active = projectTasks.filter((task) => ACTIVE_TASK_STATUSES.includes(task.status as TaskStatus)).length;
            const overdue = projectTasks.filter(
              (task) =>
                taskHealth(
                  { status: task.status as TaskStatus, progress: task.progress, startDate: task.startDate, dueAt: task.dueAt },
                  now,
                ) === "OVERDUE",
            ).length;
            const counted = projectTasks.filter((task) => task.status !== "DRAFT" && task.status !== "CANCELLED").length;

            return (
              <Card key={project.id}>
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: project.color }} aria-hidden="true" />
                      <Link href={`/tasks?projectId=${project.id}`} className="hover:text-primary hover:underline">
                        {project.name}
                      </Link>
                    </span>
                  }
                  description={project.description ?? undefined}
                  action={<span className="tnum font-mono text-[10px] font-semibold text-fg-subtle">{project.key}</span>}
                />
                <div className="space-y-3 p-4">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-md bg-surface-2 p-2">
                      <p className="tnum text-base font-bold text-fg">{active}</p>
                      <p className="text-[10px] text-fg-subtle">Active</p>
                    </div>
                    <div className="rounded-md bg-surface-2 p-2">
                      <p className="tnum text-base font-bold text-track">{completed}</p>
                      <p className="text-[10px] text-fg-subtle">Completed</p>
                    </div>
                    <div className="rounded-md bg-surface-2 p-2">
                      <p className={`tnum text-base font-bold ${overdue > 0 ? "text-overdue" : "text-fg"}`}>{overdue}</p>
                      <p className="text-[10px] text-fg-subtle">Overdue</p>
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-[11px] text-fg-muted">
                      <span>Completion</span>
                      <span className="tnum font-semibold">{ratioPct(completed, counted)}%</span>
                    </div>
                    <ProgressBar
                      value={ratioPct(completed, counted)}
                      tone="COMPLETED"
                      size="sm"
                      label={`${project.name}: ${ratioPct(completed, counted)}% complete`}
                    />
                  </div>
                  <p className="text-[11px] text-fg-subtle">
                    {project.team ? `Owned by ${project.team.name}` : "No owning team"} · {project._count.tasks} total tasks
                  </p>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
