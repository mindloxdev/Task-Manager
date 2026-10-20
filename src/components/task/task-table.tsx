import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, MessageSquare, Radio } from "lucide-react";

import { AvatarStack, EmptyState, ProgressBar } from "@/components/ui/primitives";
import { DueBadge, HealthBadge, PriorityBadge, StatusBadge } from "@/components/task/badges";
import { TaskCard } from "@/components/task/task-card";
import type { TaskListItem } from "@/server/services/tasks";
import { formatDate, formatRelative } from "@/lib/dates";
import { healthExplanation } from "@/lib/task-health";
import { cn } from "@/lib/utils";

export type SortField = "dueAt" | "priority" | "progress" | "updatedAt" | "createdAt" | "title" | "status";

type Column = { key: SortField | null; label: string; className?: string; align?: "left" | "right" };

const COLUMNS: Column[] = [
  { key: "title", label: "Task", className: "min-w-[18rem]" },
  { key: "status", label: "Status", className: "w-[11rem]" },
  { key: null, label: "Health", className: "w-[8rem]" },
  { key: "priority", label: "Priority", className: "w-[7rem]" },
  { key: "progress", label: "Progress", className: "w-[10rem]" },
  { key: "dueAt", label: "Deadline", className: "w-[9rem]" },
  { key: null, label: "Assignees", className: "w-[8rem]" },
  { key: "updatedAt", label: "Last update", className: "w-[10rem]" },
];

/**
 * Sortable task table.
 *
 * Sorting is a link, not client state: the URL carries `sort` and `dir`, so a
 * sorted view can be bookmarked, shared and reloaded, and the sort happens in
 * the database rather than over one page of rows.
 *
 * Phones get the same tasks as cards: eight columns do not fit, and a table
 * that has to be swiped sideways hides status, deadline and owners.
 */
export function TaskTable({
  tasks,
  sort,
  dir,
  buildSortHref,
  highlightUserId,
}: {
  tasks: TaskListItem[];
  sort: SortField;
  dir: "asc" | "desc";
  buildSortHref: (field: SortField) => string;
  highlightUserId?: string;
}) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        title="No tasks match these filters"
        description="Try widening the date range, clearing a filter, or switching the scope above."
      />
    );
  }

  return (
    <>
      <ul className="grid gap-2.5 p-3 md:hidden" aria-label="Tasks">
        {tasks.map((task) => (
          <li key={task.id}>
            <TaskCard task={task} highlightUserId={highlightUserId} />
          </li>
        ))}
      </ul>
      <div className="scroll-x max-md:hidden">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">
            Tasks, sorted by {sort} {dir === "asc" ? "ascending" : "descending"}
          </caption>
          <thead>
            <tr className="border-b border-border">
              {COLUMNS.map((column) => {
                const active = column.key !== null && column.key === sort;
                const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
                return (
                  <th
                    key={column.label}
                    scope="col"
                    aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
                    className={cn(
                      "whitespace-nowrap px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-fg-subtle",
                      column.className,
                    )}
                  >
                    {column.key ? (
                      <Link
                        href={buildSortHref(column.key)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded transition-colors hover:text-fg",
                          active && "text-primary",
                        )}
                      >
                        {column.label}
                        <Icon className="size-3" aria-hidden="true" />
                        <span className="sr-only">
                          {active ? `sorted ${dir === "asc" ? "ascending" : "descending"}, click to reverse` : "click to sort"}
                        </span>
                      </Link>
                    ) : (
                      column.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => {
              const mine = highlightUserId ? task.assignees.find((a) => a.userId === highlightUserId) : undefined;
              return (
                <tr key={task.id} className="row-hover border-b border-border last:border-0 hover:bg-surface-2">
                  <td className="px-3 py-2.5 align-top">
                    <div className="flex items-start gap-2">
                      <span
                        className={cn("mt-0.5 h-8 w-1 shrink-0 rounded-full", `bar-${task.health === "OVERDUE" ? "OVERDUE" : task.status}`)}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <Link
                          href={`/tasks/${task.id}`}
                          className="block text-sm font-semibold leading-snug text-fg hover:text-primary hover:underline"
                        >
                          {task.title}
                        </Link>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-fg-subtle">
                          <span className="tnum font-mono">{task.code}</span>
                          {task.team ? <span>· {task.team.name}</span> : null}
                          {task.project ? <span>· {task.project.key}</span> : null}
                          {task.openUpdateRequests > 0 ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-accent-soft-fg">
                              <Radio className="size-2.5" aria-hidden="true" />
                              update requested
                            </span>
                          ) : null}
                          {task.commentCount > 0 ? (
                            <span className="inline-flex items-center gap-1">
                              <MessageSquare className="size-2.5" aria-hidden="true" />
                              {task.commentCount}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <StatusBadge status={task.status} />
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <HealthBadge
                      health={task.health}
                      title={healthExplanation({
                        status: task.status,
                        progress: task.progress,
                        startDate: task.startDate,
                        dueAt: task.dueAt,
                      })}
                    />
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <PriorityBadge priority={task.priority} />
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <ProgressBar
                      value={task.progress}
                      tone={task.health === "OVERDUE" ? "OVERDUE" : task.status}
                      showValue
                      label={`${task.title}: ${task.progress}% complete`}
                    />
                    {mine ? <p className="mt-1 text-[10px] text-fg-subtle">you: {mine.progress}%</p> : null}
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <DueBadge dueAt={task.dueAt} status={task.status} />
                    {task.dueAt ? <p className="mt-1 text-[10px] text-fg-subtle">{formatDate(task.dueAt)}</p> : null}
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <AvatarStack
                      people={task.assignees.map((a) => ({ name: a.name, avatarColor: a.avatarColor }))}
                      max={3}
                      size="xs"
                    />
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    {task.latestUpdate ? (
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-medium text-fg">{task.latestUpdate.authorName}</p>
                        <p className="text-[10px] text-fg-subtle">
                          {formatRelative(task.latestUpdate.createdAt)} · {task.latestUpdate.progress}%
                        </p>
                      </div>
                    ) : (
                      <p className="text-[11px] text-fg-subtle">No reports yet</p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
