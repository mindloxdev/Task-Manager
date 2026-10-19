import Link from "next/link";
import {
  Ban,
  CalendarClock,
  CheckCheck,
  CircleDot,
  Clock,
  FilePlus2,
  Hand,
  MessageSquare,
  OctagonAlert,
  Paperclip,
  Radio,
  RotateCcw,
  Send,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";

import { Avatar, EmptyState } from "@/components/ui/primitives";
import { formatRelative } from "@/lib/dates";
import { cn } from "@/lib/utils";

type FeedItem = {
  id: string;
  action: string;
  summary: string;
  createdAt: Date;
  actor: { id: string; name: string; avatarColor: string } | null;
  task: { id: string; code: string; title: string } | null;
  team?: { id: string; name: string } | null;
};

const ACTION_ICON: Record<string, { icon: typeof CircleDot; className: string }> = {
  TASK_CREATED: { icon: FilePlus2, className: "text-fg-subtle" },
  TASK_ASSIGNED: { icon: Send, className: "text-primary" },
  ASSIGNEE_ADDED: { icon: UserPlus, className: "text-primary" },
  ASSIGNEE_REMOVED: { icon: UserMinus, className: "text-fg-subtle" },
  TASK_ACKNOWLEDGED: { icon: Hand, className: "text-primary" },
  TASK_STARTED: { icon: CircleDot, className: "text-primary" },
  PROGRESS_UPDATED: { icon: CircleDot, className: "text-primary" },
  BLOCKER_REPORTED: { icon: OctagonAlert, className: "text-overdue" },
  BLOCKER_CLEARED: { icon: CheckCheck, className: "text-track" },
  SUBTASK_TOGGLED: { icon: CheckCheck, className: "text-track" },
  UPDATE_REQUESTED: { icon: Radio, className: "text-risk" },
  UPDATE_PROVIDED: { icon: Send, className: "text-primary" },
  SUBMITTED_FOR_REVIEW: { icon: Send, className: "text-primary" },
  REVIEW_APPROVED: { icon: CheckCheck, className: "text-track" },
  REVIEW_CHANGES_REQUESTED: { icon: RotateCcw, className: "text-risk" },
  DEADLINE_CHANGED: { icon: CalendarClock, className: "text-risk" },
  EXTENSION_REQUESTED: { icon: Clock, className: "text-risk" },
  EXTENSION_DECIDED: { icon: Clock, className: "text-primary" },
  COMMENT_ADDED: { icon: MessageSquare, className: "text-fg-subtle" },
  ATTACHMENT_ADDED: { icon: Paperclip, className: "text-fg-subtle" },
  TASK_BECAME_OVERDUE: { icon: OctagonAlert, className: "text-overdue" },
  TASK_CANCELLED: { icon: Ban, className: "text-fg-subtle" },
  TASK_TRANSFERRED: { icon: Users, className: "text-primary" },
  TEAM_CREATED: { icon: Users, className: "text-primary" },
  MEMBER_ADDED: { icon: UserPlus, className: "text-primary" },
  MEMBER_REMOVED: { icon: UserMinus, className: "text-fg-subtle" },
  USER_INVITED: { icon: UserPlus, className: "text-primary" },
  USER_DEACTIVATED: { icon: UserMinus, className: "text-fg-subtle" },
};

export function ActivityFeed({ items, compact = false }: { items: FeedItem[]; compact?: boolean }) {
  if (items.length === 0) {
    return <EmptyState compact title="No activity yet" description="Assignments, updates and reviews will show up here." />;
  }

  return (
    <ol className="relative">
      {items.map((item, index) => {
        const config = ACTION_ICON[item.action] ?? { icon: CircleDot, className: "text-fg-subtle" };
        const Icon = config.icon;
        const last = index === items.length - 1;
        return (
          <li key={item.id} className="relative flex gap-3 pb-3 last:pb-0">
            {/* Timeline rail */}
            {!last ? (
              <span className="absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-px bg-border" aria-hidden="true" />
            ) : null}
            <span
              className={cn(
                "relative z-10 mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface",
                config.className,
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <p className={cn("text-xs leading-relaxed text-fg-muted", compact && "line-clamp-2")}>{item.summary}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[10px] text-fg-subtle">
                <time dateTime={new Date(item.createdAt).toISOString()}>{formatRelative(item.createdAt)}</time>
                {item.task ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <Link href={`/tasks/${item.task.id}`} className="tnum font-mono font-semibold hover:text-primary hover:underline">
                      {item.task.code}
                    </Link>
                  </>
                ) : null}
                {item.team ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{item.team.name}</span>
                  </>
                ) : null}
              </p>
            </div>
            {item.actor ? (
              <Avatar name={item.actor.name} color={item.actor.avatarColor} size="xs" title={item.actor.name} />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
