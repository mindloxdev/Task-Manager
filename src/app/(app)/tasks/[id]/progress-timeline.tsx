import { CheckCheck, CircleDot, ExternalLink, OctagonAlert, Send, Undo2 } from "lucide-react";

import { Avatar, EmptyState, ProgressBar } from "@/components/ui/primitives";
import { PROGRESS_KIND_LABEL, type ProgressKind } from "@/lib/enums";
import { formatDate, formatDateTime, formatRelative } from "@/lib/dates";
import { cn } from "@/lib/utils";

type Update = {
  id: string;
  kind: string;
  progress: number;
  workCompleted: string | null;
  workRemaining: string | null;
  blockers: string | null;
  helpNeeded: string | null;
  expectedCompletion: Date | null;
  linkUrl: string | null;
  createdAt: Date;
  authorName: string;
  authorColor: string;
};

const KIND_ICON: Record<ProgressKind, { icon: typeof CircleDot; className: string }> = {
  UPDATE: { icon: CircleDot, className: "text-primary" },
  BLOCKER: { icon: OctagonAlert, className: "text-overdue" },
  UNBLOCKED: { icon: Undo2, className: "text-track" },
  SUBMISSION: { icon: Send, className: "text-primary" },
  RESPONSE: { icon: CheckCheck, className: "text-primary" },
};

/**
 * Chronological progress history, newest first.
 *
 * The reports are shown exactly as the assignee wrote them: no summarising, no
 * inferred percentages.
 */
export function ProgressTimeline({ updates }: { updates: Update[] }) {
  if (updates.length === 0) {
    return (
      <EmptyState
        compact
        title="No progress reports yet"
        description="Updates from the assignees appear here."
      />
    );
  }

  return (
    <ol className="space-y-3">
      {updates.map((update, index) => {
        const config = KIND_ICON[(update.kind as ProgressKind) ?? "UPDATE"] ?? KIND_ICON.UPDATE;
        const Icon = config.icon;
        const previous = updates[index + 1];
        const delta = previous ? update.progress - previous.progress : update.progress;

        return (
          <li
            key={update.id}
            className={cn(
              "rounded-lg border p-3",
              update.kind === "BLOCKER" ? "border-overdue/40 bg-overdue-bg/40" : "border-border bg-surface",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <Avatar name={update.authorName} color={update.authorColor} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-fg">{update.authorName}</p>
                  <p className="text-[10px] text-fg-subtle">
                    <time dateTime={update.createdAt.toISOString()} title={formatDateTime(update.createdAt)}>
                      {formatRelative(update.createdAt)}
                    </time>
                  </p>
                </div>
              </div>
              <span className={cn("chip", update.kind === "BLOCKER" ? "chip-BLOCKED" : "bg-surface-2 text-fg-muted")}>
                <Icon className="size-3" aria-hidden="true" />
                {PROGRESS_KIND_LABEL[(update.kind as ProgressKind) ?? "UPDATE"]}
              </span>
            </div>

            <div className="mt-2.5 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <ProgressBar
                  value={update.progress}
                  tone={update.kind === "BLOCKER" ? "BLOCKED" : "IN_PROGRESS"}
                  size="sm"
                  label={`Reported ${update.progress}%`}
                />
              </div>
              <span className="tnum shrink-0 text-xs font-semibold text-fg">{update.progress}%</span>
              {delta !== 0 ? (
                <span
                  className={cn(
                    "tnum shrink-0 text-[10px] font-semibold",
                    delta > 0 ? "text-track" : "text-risk",
                  )}
                >
                  {delta > 0 ? "+" : ""}
                  {delta}
                </span>
              ) : null}
            </div>

            <dl className="mt-2.5 space-y-2">
              {update.workCompleted ? (
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-fg-subtle">Completed</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-fg-muted">{update.workCompleted}</dd>
                </div>
              ) : null}
              {update.workRemaining ? (
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-fg-subtle">Remaining</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-fg-muted">{update.workRemaining}</dd>
                </div>
              ) : null}
              {update.blockers ? (
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-overdue">Blocker</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-fg">{update.blockers}</dd>
                </div>
              ) : null}
              {update.helpNeeded ? (
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-risk">Help needed</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-fg">{update.helpNeeded}</dd>
                </div>
              ) : null}
            </dl>

            {update.expectedCompletion || update.linkUrl ? (
              <div className="mt-2.5 flex flex-wrap items-center gap-3 border-t border-border pt-2 text-[11px]">
                {update.expectedCompletion ? (
                  <span className="text-fg-subtle">
                    Expects to finish by{" "}
                    <strong className="font-semibold text-fg-muted">{formatDate(update.expectedCompletion)}</strong>
                  </span>
                ) : null}
                {update.linkUrl ? (
                  <a
                    href={update.linkUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                  >
                    <ExternalLink className="size-3" aria-hidden="true" />
                    Open the linked work
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
