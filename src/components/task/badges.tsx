import {
  AlertTriangle,
  ArrowUp,
  Ban,
  CalendarClock,
  CheckCheck,
  CircleDashed,
  CircleDot,
  Clock,
  Eye,
  FileEdit,
  Flame,
  Hand,
  Minus,
  OctagonAlert,
  RotateCcw,
  TrendingUp,
} from "lucide-react";

import {
  ASSIGNEE_STATUS_LABEL,
  TASK_HEALTH_LABEL,
  TASK_PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  type AssigneeStatus,
  type TaskHealth,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/enums";
import { formatDueDistance, isOverdue } from "@/lib/dates";
import { cn } from "@/lib/utils";

/**
 * Status, health and priority indicators.
 *
 * Each one pairs a tint with its own icon and a text label, so the meaning
 * survives greyscale printing and colour blindness.
 */

const STATUS_ICON: Record<TaskStatus, typeof CircleDot> = {
  DRAFT: FileEdit,
  ASSIGNED: CircleDashed,
  ACKNOWLEDGED: Hand,
  IN_PROGRESS: CircleDot,
  BLOCKED: OctagonAlert,
  SUBMITTED_FOR_REVIEW: Eye,
  CHANGES_REQUESTED: RotateCcw,
  COMPLETED: CheckCheck,
  CANCELLED: Ban,
};

export function StatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  const Icon = STATUS_ICON[status] ?? CircleDot;
  return (
    <span className={cn("chip", `chip-${status}`, className)}>
      <Icon className="size-3" aria-hidden="true" />
      {TASK_STATUS_LABEL[status]}
    </span>
  );
}

const ASSIGNEE_ICON: Record<AssigneeStatus, typeof CircleDot> = {
  ASSIGNED: CircleDashed,
  ACKNOWLEDGED: Hand,
  IN_PROGRESS: CircleDot,
  BLOCKED: OctagonAlert,
  SUBMITTED: Eye,
  CHANGES_REQUESTED: RotateCcw,
  COMPLETED: CheckCheck,
};

export function AssigneeStatusBadge({ status, className }: { status: AssigneeStatus; className?: string }) {
  const Icon = ASSIGNEE_ICON[status] ?? CircleDot;
  return (
    <span className={cn("chip", `chip-${status}`, className)}>
      <Icon className="size-3" aria-hidden="true" />
      {ASSIGNEE_STATUS_LABEL[status]}
    </span>
  );
}

const HEALTH_ICON: Record<TaskHealth, typeof CircleDot> = {
  COMPLETED: CheckCheck,
  BLOCKED: OctagonAlert,
  OVERDUE: AlertTriangle,
  AT_RISK: Clock,
  ON_TRACK: TrendingUp,
  NOT_STARTED: CircleDashed,
};

export function HealthBadge({
  health,
  className,
  title,
}: {
  health: TaskHealth;
  className?: string;
  title?: string;
}) {
  const Icon = HEALTH_ICON[health] ?? CircleDot;
  const chipClass = health === "BLOCKED" ? "chip-BLOCKED" : `chip-${health}`;
  return (
    <span className={cn("chip", chipClass, className)} title={title}>
      <Icon className="size-3" aria-hidden="true" />
      {TASK_HEALTH_LABEL[health]}
    </span>
  );
}

const PRIORITY_ICON: Record<TaskPriority, typeof Minus> = {
  LOW: Minus,
  NORMAL: CircleDot,
  HIGH: ArrowUp,
  URGENT: Flame,
};

export function PriorityBadge({ priority, className }: { priority: TaskPriority; className?: string }) {
  const Icon = PRIORITY_ICON[priority];
  return (
    <span className={cn("chip", `chip-${priority}`, className)}>
      <Icon className="size-3" aria-hidden="true" />
      {TASK_PRIORITY_LABEL[priority]}
    </span>
  );
}

/** Deadline chip that turns red once the deadline has passed. */
export function DueBadge({
  dueAt,
  status,
  className,
}: {
  dueAt: Date | string | null;
  status?: TaskStatus;
  className?: string;
}) {
  if (!dueAt) {
    return (
      <span className={cn("chip bg-surface-2 text-fg-subtle", className)}>
        <CalendarClock className="size-3" aria-hidden="true" />
        No deadline
      </span>
    );
  }
  const finished = status === "COMPLETED" || status === "CANCELLED";
  const late = !finished && isOverdue(dueAt);
  return (
    <span
      className={cn("chip", late ? "chip-OVERDUE" : "bg-surface-2 text-fg-muted", className)}
      title={new Date(dueAt).toISOString()}
    >
      <CalendarClock className="size-3" aria-hidden="true" />
      {finished ? "Closed" : formatDueDistance(dueAt)}
    </span>
  );
}
