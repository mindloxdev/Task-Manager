import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { TaskFilterBar } from "@/app/(app)/tasks/filter-bar";
import { TaskCard } from "@/components/task/task-card";
import { TaskTable, type SortField } from "@/components/task/task-table";
import { ButtonLink } from "@/components/ui/button";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { isOwner } from "@/server/permissions";
import { listTasks } from "@/server/services/tasks";
import { taskFilterSchema } from "@/lib/validation";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "All tasks" };

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string | null =>
  Array.isArray(value) ? (value[0] ?? null) : (value ?? null);

export default async function TasksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const user = await requireUser();

  const filter = taskFilterSchema.parse({
    q: first(params.q),
    status: first(params.status),
    priority: first(params.priority),
    teamId: first(params.teamId),
    projectId: first(params.projectId),
    assigneeId: first(params.assigneeId),
    health: first(params.health),
    scope: first(params.scope) ?? undefined,
    dueFrom: first(params.dueFrom),
    dueTo: first(params.dueTo),
    includeArchived: first(params.includeArchived) ?? undefined,
    sort: first(params.sort) ?? undefined,
    dir: first(params.dir) ?? undefined,
    page: first(params.page) ?? undefined,
    pageSize: first(params.pageSize) ?? undefined,
  });

  const view = first(params.view) === "cards" ? "cards" : "table";
  const canAssign = isOwner(user) || user.ledTeamIds.length > 0;

  // Filter choices are limited to what the viewer may see.
  const teamScope = isOwner(user) ? {} : { id: { in: user.teams.map((t) => t.teamId) } };
  const [result, teams, projects, people] = await Promise.all([
    listTasks(user, filter),
    prisma.team.findMany({
      where: { archivedAt: null, ...teamScope },
      select: { id: true, name: true, color: true },
      orderBy: { name: "asc" },
    }),
    prisma.project.findMany({
      where: {
        archivedAt: null,
        ...(isOwner(user) ? {} : { OR: [{ teamId: { in: user.teams.map((t) => t.teamId) } }, { teamId: null }] }),
      },
      select: { id: true, name: true, color: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: {
        status: "ACTIVE",
        ...(isOwner(user) ? {} : { memberships: { some: { teamId: { in: user.teams.map((t) => t.teamId) } } } }),
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const buildHref = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      const single = first(value);
      if (single) next.set(key, single);
    }
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    return query ? `/tasks?${query}` : "/tasks";
  };

  const buildSortHref = (field: SortField) => {
    const sameField = filter.sort === field;
    const nextDir = sameField && filter.dir === "asc" ? "desc" : "asc";
    return buildHref({ sort: field, dir: nextDir, page: null });
  };

  return (
    <div className="mx-auto max-w-[110rem]">
      <PageHeader
        title="All tasks"
        description={undefined}
        actions={
          <>
            <ButtonLink href="/calendar" variant="secondary">
              Calendar
            </ButtonLink>
            {canAssign ? (
              <ButtonLink href="/tasks/new" variant="primary">
                New task
              </ButtonLink>
            ) : null}
          </>
        }
      />

      <TaskFilterBar
        teams={teams}
        projects={projects}
        people={people}
        view={view}
        total={result.total}
      />

      {result.items.length === 0 ? (
        <Card>
          <EmptyState
            title="No tasks match these filters"
            description={undefined}
            action={
              canAssign ? (
                <ButtonLink href="/tasks/new" variant="primary">
                  Create a task
                </ButtonLink>
              ) : null
            }
          />
        </Card>
      ) : view === "cards" ? (
        <div className="enter grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {result.items.map((task) => (
            <TaskCard key={task.id} task={task} highlightUserId={user.id} />
          ))}
        </div>
      ) : (
        <Card>
          <TaskTable
            tasks={result.items}
            sort={filter.sort}
            dir={filter.dir}
            buildSortHref={buildSortHref}
            highlightUserId={user.id}
          />
        </Card>
      )}

      {result.pageCount > 1 ? (
        <nav className="mt-4 flex items-center justify-between gap-3" aria-label="Pagination">
          <p className="text-xs text-fg-muted">
            Page <strong className="font-semibold text-fg">{result.page}</strong> of {result.pageCount} ·{" "}
            {result.total} tasks
          </p>
          <div className="flex items-center gap-1.5">
            <PageLink
              href={buildHref({ page: String(Math.max(1, result.page - 1)) })}
              disabled={result.page <= 1}
              label="Previous page"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
              Previous
            </PageLink>
            {pageNumbers(result.page, result.pageCount).map((entry, index) =>
              entry === null ? (
                <span key={`gap-${index}`} className="px-1 text-xs text-fg-subtle" aria-hidden="true">
                  …
                </span>
              ) : (
                <Link
                  key={entry}
                  href={buildHref({ page: String(entry) })}
                  aria-current={entry === result.page ? "page" : undefined}
                  className={cn(
                    "tnum flex size-9 items-center justify-center rounded-md border text-xs font-semibold transition-colors",
                    entry === result.page
                      ? "border-primary bg-primary text-primary-fg"
                      : "border-border bg-surface text-fg-muted hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  {entry}
                </Link>
              ),
            )}
            <PageLink
              href={buildHref({ page: String(Math.min(result.pageCount, result.page + 1)) })}
              disabled={result.page >= result.pageCount}
              label="Next page"
            >
              Next
              <ChevronRight className="size-4" aria-hidden="true" />
            </PageLink>
          </div>
        </nav>
      ) : null}
    </div>
  );
}

function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-semibold text-fg-subtle opacity-50"
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      className="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-surface px-2.5 text-xs font-semibold text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
    >
      {children}
    </Link>
  );
}

/** Compact page list: 1 … 4 5 6 … 20 */
function pageNumbers(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages = new Set<number>([1, total, current, current - 1, current + 1]);
  const sorted = Array.from(pages)
    .filter((page) => page >= 1 && page <= total)
    .sort((a, b) => a - b);
  const output: (number | null)[] = [];
  let previous = 0;
  for (const page of sorted) {
    if (previous && page - previous > 1) output.push(null);
    output.push(page);
    previous = page;
  }
  return output;
}
