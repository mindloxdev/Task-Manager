import Link from "next/link";
import { MessageSquare, Radio, Users } from "lucide-react";

import { AvatarStack, ProgressBar } from "@/components/ui/primitives";
import { DueBadge, HealthBadge, PriorityBadge, StatusBadge } from "@/components/task/badges";
import type { TaskListItem } from "@/server/services/tasks";
import { ASSIGNMENT_TYPE_LABEL, type AssignmentType } from "@/lib/enums";
import { formatRelative } from "@/lib/dates";
import { healthExplanation } from "@/lib/task-health";
import { cn, truncate } from "@/lib/utils";

/**
 * Task card used in the dashboard columns and the card view of the task list.
 * Everything a manager asks at a glance: who owns it, how far along, when it is
 * due, and whether it is in trouble.
 */
export function TaskCard({
  task,
  highlightUserId,
  className,
}: {
  task: TaskListItem;
  highlightUserId?: string;
  className?: string;
}) {
  const mine = highlightUserId ? task.assignees.find((a) => a.userId === highlightUserId) : undefined;
  const explanation = healthExplanation({
    status: task.status,
    progress: task.progress,
    startDate: task.startDate,
    dueAt: task.dueAt,
  });

  return (
    <article
      className={cn(
        "lift group rounded-lg border border-border bg-surface p-3 shadow-[var(--shadow-sm)] hover:border-border-strong",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="tnum font-mono text-[10px] font-semibold text-fg-subtle">{task.code}</span>
            {task.team ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-fg-subtle">
                <span className="size-1.5 rounded-full" style={{ backgroundColor: task.team.color }} aria-hidden="true" />
                {task.team.name}
              </span>
            ) : null}
          </div>
          <h3 className="mt-0.5 text-sm font-semibold leading-snug text-fg">
            <Link href={`/tasks/${task.id}`} className="hover:text-primary hover:underline">
              {task.title}
            </Link>
          </h3>
        </div>
        <PriorityBadge priority={task.priority} />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <StatusBadge status={task.status} />
        {/* The health chip would just repeat the status on a closed task. */}
        {task.health !== "COMPLETED" ? <HealthBadge health={task.health} title={explanation} /> : null}
        <DueBadge dueAt={task.dueAt} status={task.status} />
      </div>

      <div className="mt-3">
        <ProgressBar value={task.progress} tone={task.health === "OVERDUE" ? "OVERDUE" : task.status} showValue />
      </div>

      {mine ? (
        <p className="mt-2 text-[11px] text-fg-muted">
          Your part: <strong className="font-semibold text-fg">{mine.progress}%</strong> ·{" "}
          {mine.status.replace(/_/g, " ").toLowerCase()}
        </p>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <AvatarStack
            people={task.assignees.map((a) => ({ name: a.name, avatarColor: a.avatarColor }))}
            max={3}
            size="xs"
          />
          {task.assignmentType !== "INDIVIDUAL" ? (
            <span className="inline-flex items-center gap-1 text-[10px] text-fg-subtle">
              <Users className="size-3" aria-hidden="true" />
              {ASSIGNMENT_TYPE_LABEL[task.assignmentType as AssignmentType]}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2.5 text-[10px] text-fg-subtle">
          {task.openUpdateRequests > 0 ? (
            <span className="inline-flex items-center gap-1 font-semibold text-accent-soft-fg">
              <Radio className="size-3" aria-hidden="true" />
              Update asked
            </span>
          ) : null}
          {task.commentCount > 0 ? (
            <span className="inline-flex items-center gap-1" title={`${task.commentCount} comments`}>
              <MessageSquare className="size-3" aria-hidden="true" />
              {task.commentCount}
            </span>
          ) : null}
        </div>
      </div>

      {task.latestUpdate ? (
        <p className="mt-2 text-[11px] leading-relaxed text-fg-subtle">
          <span className="font-semibold text-fg-muted">{task.latestUpdate.authorName}</span>,{" "}
          {formatRelative(task.latestUpdate.createdAt)}:{" "}
          {task.latestUpdate.excerpt ? truncate(task.latestUpdate.excerpt, 110) : `reported ${task.latestUpdate.progress}%`}
        </p>
      ) : null}
    </article>
  );
}

/** Dense single-line variant for sidebars and deadline columns. */
export function TaskLine({ task, showTeam = true }: { task: TaskListItem; showTeam?: boolean }) {
  return (
    <Link
      href={`/tasks/${task.id}`}
      className="flex items-center gap-2.5 rounded-md px-2 py-2 transition-colors hover:bg-surface-2"
    >
      <span className={cn("h-7 w-1 shrink-0 rounded-full", `bar-${task.health === "OVERDUE" ? "OVERDUE" : task.status}`)} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-fg">{task.title}</span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-fg-subtle">
          <span className="tnum font-mono">{task.code}</span>
          {showTeam && task.team ? <span className="truncate">· {task.team.name}</span> : null}
          <span>· {task.progress}%</span>
        </span>
      </span>
      <AvatarStack people={task.assignees.map((a) => ({ name: a.name, avatarColor: a.avatarColor }))} max={2} size="xs" />
    </Link>
  );
}
