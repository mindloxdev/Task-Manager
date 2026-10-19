import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CalendarClock,
  ClipboardList,
  Clock,
  FileText,
  History,
  Info,
  OctagonAlert,
  Repeat,
  Target,
  Users,
} from "lucide-react";

import { TaskActions } from "@/app/(app)/tasks/[id]/task-actions";
import { TaskDiscussion } from "@/app/(app)/tasks/[id]/task-discussion";
import { ProgressTimeline } from "@/app/(app)/tasks/[id]/progress-timeline";
import { ActivityFeed } from "@/components/activity-feed";
import { AssigneeStatusBadge, DueBadge, HealthBadge, PriorityBadge, StatusBadge } from "@/components/task/badges";
import {
  Avatar,
  Card,
  CardHeader,
  EmptyState,
  KeyValue,
  ProgressBar,
} from "@/components/ui/primitives";
import { requireUser } from "@/server/auth";
import { AppError } from "@/server/errors";
import {
  canManageTask,
  canReportProgress,
  canReviewTask,
  isAssignee,
  isOwner,
} from "@/server/permissions";
import { getTaskDetail } from "@/server/services/tasks";
import {
  ASSIGNMENT_TYPE_LABEL,
  COMPLETION_RULE_LABEL,
  PROGRESS_MODE_LABEL,
  RECURRENCE_LABEL,
  UPDATE_CADENCE_LABEL,
  type AssigneeStatus,
  type AssignmentType,
  type CompletionRule,
  type ProgressMode,
  type Recurrence,
  type TaskPriority,
  type TaskStatus,
  type UpdateCadence,
} from "@/lib/enums";
import { formatDate, formatDateTime, formatRelative } from "@/lib/dates";
import { healthExplanation, taskHealth } from "@/lib/task-health";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { task } = await getTaskDetail(user, id);
    return { title: `${task.code} — ${task.title}` };
  } catch {
    return { title: "Task" };
  }
}

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  let detail: Awaited<ReturnType<typeof getTaskDetail>>;
  try {
    detail = await getTaskDetail(user, id);
  } catch (error) {
    // A task you cannot see is indistinguishable from one that does not exist.
    if (error instanceof AppError && (error.code === "NOT_FOUND" || error.code === "FORBIDDEN")) notFound();
    throw error;
  }

  const { task, scope } = detail;
  const myAssignment = task.assignees.find((a) => a.userId === user.id) ?? null;
  const pendingReview = task.reviews.find((review) => review.decision === "PENDING") ?? null;
  const latestDecided = task.reviews.find((review) => review.decision !== "PENDING") ?? null;
  const myOpenRequest = task.updateRequests.find((r) => r.requestedOfId === user.id && !r.respondedAt) ?? null;
  const myPendingExtension = task.extensions.find((e) => e.requestedById === user.id && e.status === "PENDING") ?? null;

  const manage = canManageTask(user, scope);
  const review = pendingReview ? canReviewTask(user, scope, pendingReview.submittedById) : false;
  const health = taskHealth({
    status: task.status as TaskStatus,
    progress: task.progress,
    startDate: task.startDate,
    dueAt: task.dueAt,
  });

  return (
    <div className="mx-auto max-w-[95rem]">
      {/* ------------------------------------------------------------- */}
      <nav aria-label="Breadcrumb" className="mb-3 text-xs text-fg-subtle">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/tasks" className="hover:text-fg hover:underline">
              All tasks
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          {task.team ? (
            <>
              <li>
                <Link href={`/teams/${task.team.id}`} className="hover:text-fg hover:underline">
                  {task.team.name}
                </Link>
              </li>
              <li aria-hidden="true">/</li>
            </>
          ) : null}
          <li className="tnum font-mono font-semibold text-fg-muted">{task.code}</li>
        </ol>
      </nav>

      <header className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold tracking-tight text-fg sm:text-2xl">{task.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <StatusBadge status={task.status as TaskStatus} />
              {/* Once a task is closed the health chip would just repeat the status. */}
              {health !== "COMPLETED" ? (
                <HealthBadge
                  health={health}
                  title={healthExplanation({
                    status: task.status as TaskStatus,
                    progress: task.progress,
                    startDate: task.startDate,
                    dueAt: task.dueAt,
                  })}
                />
              ) : null}
              <PriorityBadge priority={task.priority as TaskPriority} />
              <DueBadge dueAt={task.dueAt} status={task.status as TaskStatus} />
              {task.reviewRequired ? <span className="chip bg-surface-2 text-fg-muted">Review required</span> : null}
              {task.archivedAt ? <span className="chip chip-CANCELLED">Archived</span> : null}
              {task.recurrence !== "NONE" ? (
                <span className="chip bg-surface-2 text-fg-muted">
                  <Repeat className="size-3" aria-hidden="true" />
                  {RECURRENCE_LABEL[task.recurrence as Recurrence]}
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-fg-subtle">
              Created by {task.createdBy.name} {formatRelative(task.createdAt)}
              {task.assignedAt ? ` · assigned ${formatRelative(task.assignedAt)}` : " · not yet assigned"}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-fg">
              Overall progress <span className="tnum ml-1 text-fg-muted">{task.progress}%</span>
            </p>
            <p className="text-[11px] text-fg-subtle">
              {task.progressMode === "CHECKLIST"
                ? `Counted from ${task.subtasks.filter((s) => s.isDone).length} of ${task.subtasks.length} checklist items`
                : task.assignees.length > 1
                  ? "Mean of the required assignees' own reports"
                  : "As reported by the assignee"}
            </p>
          </div>
          <div className="mt-1.5">
            <ProgressBar
              value={task.progress}
              tone={health === "OVERDUE" ? "OVERDUE" : (task.status as string)}
              size="lg"
              label={`${task.title}: ${task.progress}% complete`}
            />
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------- */}
      <TaskActions
        task={{
          id: task.id,
          code: task.code,
          title: task.title,
          status: task.status as TaskStatus,
          progress: task.progress,
          dueAt: task.dueAt ? task.dueAt.toISOString() : null,
          progressMode: task.progressMode as ProgressMode,
          reviewRequired: task.reviewRequired,
          teamId: task.teamId,
          assignmentType: task.assignmentType as AssignmentType,
        }}
        me={{
          id: user.id,
          isAssignee: isAssignee(user, scope),
          assignmentStatus: (myAssignment?.status ?? null) as AssigneeStatus | null,
          assignmentProgress: myAssignment?.progress ?? 0,
          canReportProgress: canReportProgress(user, scope),
          canManage: manage,
          canReview: review,
          isOwner: isOwner(user),
        }}
        pendingReview={
          pendingReview
            ? {
                id: pendingReview.id,
                round: pendingReview.round,
                submittedByName: pendingReview.submittedBy.name,
                submittedById: pendingReview.submittedById,
                summary: pendingReview.summary,
                submittedAt: pendingReview.submittedAt.toISOString(),
              }
            : null
        }
        openUpdateRequest={
          myOpenRequest
            ? {
                id: myOpenRequest.id,
                message: myOpenRequest.message,
                requestedByName: myOpenRequest.requestedBy.name,
              }
            : null
        }
        pendingExtension={myPendingExtension !== null}
        assignees={task.assignees.map((a) => ({
          userId: a.userId,
          name: a.user.name,
          avatarColor: a.user.avatarColor,
          jobTitle: a.user.jobTitle,
          isRequired: a.isRequired,
          isPrimary: a.isPrimary,
          status: a.status as AssigneeStatus,
        }))}
      />

      {/* ------------------------------------------------------------- */}
      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Main column */}
        <div className="min-w-0 space-y-4">
          {pendingReview && review ? (
            <Card className="border-primary/40">
              <CardHeader
                title={`Round ${pendingReview.round} submitted for your review`}
                description={`${pendingReview.submittedBy.name}, ${formatRelative(pendingReview.submittedAt)}`}
              />
              <div className="p-4">
                <p className="text-xs font-semibold text-fg">Their completion summary</p>
                <p className="mt-1 whitespace-pre-wrap rounded-md bg-surface-2 p-3 text-sm leading-relaxed text-fg-muted">
                  {pendingReview.summary ?? "No summary was given."}
                </p>
              </div>
            </Card>
          ) : null}

          {task.status === "CHANGES_REQUESTED" && latestDecided?.feedback ? (
            <Card className="border-risk/50">
              <CardHeader
                title="Changes requested"
                description={`${latestDecided.decidedBy?.name ?? "Reviewer"}, ${formatRelative(latestDecided.decidedAt ?? latestDecided.submittedAt)}`}
              />
              <div className="p-4">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg">{latestDecided.feedback}</p>
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Description" />
            <div className="p-4">
              {task.description ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg-muted">{task.description}</p>
              ) : (
                <p className="text-sm text-fg-subtle">No description was given.</p>
              )}
              {task.instruction ? (
                <div className="mt-4 rounded-md border border-border bg-surface-2 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                    <Info className="size-3.5" aria-hidden="true" />
                    Additional instructions
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-fg-muted">{task.instruction}</p>
                </div>
              ) : null}
            </div>
          </Card>

          <TaskDiscussion
            taskId={task.id}
            canContribute={isAssignee(user, scope) || manage}
            canComment
            viewerId={user.id}
            canModerate={manage || isOwner(user)}
            progressMode={task.progressMode as ProgressMode}
            subtasks={task.subtasks.map((subtask) => ({
              id: subtask.id,
              title: subtask.title,
              isDone: subtask.isDone,
              completedByName: subtask.completedBy?.name ?? null,
              completedAt: subtask.completedAt ? subtask.completedAt.toISOString() : null,
            }))}
            attachments={task.attachments.map((attachment) => ({
              id: attachment.id,
              kind: attachment.kind,
              filename: attachment.filename,
              label: attachment.label,
              url: attachment.url,
              sizeBytes: attachment.sizeBytes,
              mimeType: attachment.mimeType,
              uploaderId: attachment.uploaderId,
              uploaderName: attachment.uploader.name,
              createdAt: attachment.createdAt.toISOString(),
            }))}
            comments={task.comments.map((comment) => ({
              id: comment.id,
              body: comment.body,
              parentId: comment.parentId,
              authorId: comment.authorId,
              authorName: comment.author.name,
              authorColor: comment.author.avatarColor,
              createdAt: comment.createdAt.toISOString(),
              editedAt: comment.editedAt ? comment.editedAt.toISOString() : null,
            }))}
          />

          <Card id="progress">
            <CardHeader
              title="Progress timeline"
            />
            <div className="p-4">
              <ProgressTimeline
                updates={task.progressUpdates.map((update) => ({
                  id: update.id,
                  kind: update.kind,
                  progress: update.progress,
                  workCompleted: update.workCompleted,
                  workRemaining: update.workRemaining,
                  blockers: update.blockers,
                  helpNeeded: update.helpNeeded,
                  expectedCompletion: update.expectedCompletion,
                  linkUrl: update.linkUrl,
                  createdAt: update.createdAt,
                  authorName: update.user.name,
                  authorColor: update.user.avatarColor,
                }))}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Task history" />
            <div className="p-4">
              <ActivityFeed
                items={task.activity.map((item) => ({
                  id: item.id,
                  action: item.action,
                  summary: item.summary,
                  createdAt: item.createdAt,
                  actor: item.actor,
                  task: null,
                }))}
              />
            </div>
          </Card>
        </div>

        {/* Sidebar */}
        <aside className="min-w-0 space-y-4">
          <Card>
            <CardHeader title="Accountability" level={3} />
            <div className="space-y-3 p-4">
              <div className="flex items-start gap-2">
                <Target className="mt-0.5 size-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />
                <KeyValue label="Assignment">
                  {ASSIGNMENT_TYPE_LABEL[task.assignmentType as AssignmentType]}
                  {task.assignees.length > 1
                    ? ` · ${COMPLETION_RULE_LABEL[task.completionRule as CompletionRule].toLowerCase()}`
                    : ""}
                </KeyValue>
              </div>
              <div className="flex items-start gap-2">
                <Users className="mt-0.5 size-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />
                <KeyValue label="Primary owner">
                  {task.primaryOwner ? task.primaryOwner.name : <span className="text-fg-subtle">Not named</span>}
                </KeyValue>
              </div>
              <div className="flex items-start gap-2">
                <ClipboardList className="mt-0.5 size-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />
                <KeyValue label="Progress source">{PROGRESS_MODE_LABEL[task.progressMode as ProgressMode]}</KeyValue>
              </div>
              <div className="flex items-start gap-2">
                <Clock className="mt-0.5 size-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />
                <KeyValue label="Update expectation">{UPDATE_CADENCE_LABEL[task.updateCadence as UpdateCadence]}</KeyValue>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title={`Assignees (${task.assignees.length})`}
              level={3}
            />
            {task.assignees.length === 0 ? (
              <EmptyState compact title="Nobody is assigned" />
            ) : (
              <ul className="divide-y divide-border">
                {task.assignees.map((assignee) => (
                  <li key={assignee.id} className="p-3">
                    <div className="flex items-start gap-2.5">
                      <Avatar name={assignee.user.name} color={assignee.user.avatarColor} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Link
                            href={`/employees/${assignee.userId}`}
                            className="truncate text-xs font-semibold text-fg hover:text-primary hover:underline"
                          >
                            {assignee.user.name}
                          </Link>
                          {assignee.isPrimary ? <span className="chip bg-primary-soft text-primary-soft-fg">Owner</span> : null}
                          {!assignee.isRequired ? <span className="chip bg-surface-2 text-fg-subtle">Optional</span> : null}
                          {assignee.viaTeam ? <span className="chip bg-surface-2 text-fg-subtle">via team</span> : null}
                        </div>
                        <p className="mt-0.5 truncate text-[10px] text-fg-subtle">
                          {assignee.user.jobTitle ?? assignee.user.email}
                        </p>
                        <div className="mt-1.5">
                          <AssigneeStatusBadge status={assignee.status as AssigneeStatus} />
                        </div>
                        <div className="mt-2">
                          <ProgressBar
                            value={assignee.progress}
                            tone={assignee.status === "BLOCKED" ? "BLOCKED" : (assignee.status as string)}
                            size="sm"
                            showValue
                            label={`${assignee.user.name}: ${assignee.progress}%`}
                          />
                        </div>
                        <p className="mt-1.5 text-[10px] text-fg-subtle">
                          {assignee.lastUpdateAt
                            ? `Last update ${formatRelative(assignee.lastUpdateAt)}`
                            : "No update yet"}
                          {assignee.acknowledgedAt ? ` · acknowledged ${formatRelative(assignee.acknowledgedAt)}` : ""}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Dates" level={3} />
            <dl className="space-y-3 p-4">
              <KeyValue label="Start">{task.startDate ? formatDate(task.startDate, user.timezone) : "Not set"}</KeyValue>
              <KeyValue label="Deadline">
                {task.dueAt ? `${formatDateTime(task.dueAt, user.timezone)} (${user.timezone})` : "No deadline"}
              </KeyValue>
              {task.originalDueAt && task.dueAt && task.originalDueAt.getTime() !== task.dueAt.getTime() ? (
                <KeyValue label="Original deadline">
                  <span className="text-risk">{formatDateTime(task.originalDueAt, user.timezone)}</span>
                </KeyValue>
              ) : null}
              <KeyValue label="Estimated effort">
                {task.estimateHours !== null ? `${task.estimateHours} hours` : "Not estimated"}
              </KeyValue>
              {task.submittedAt ? (
                <KeyValue label="Submitted">{formatDateTime(task.submittedAt, user.timezone)}</KeyValue>
              ) : null}
              {task.completedAt ? (
                <KeyValue label="Completed">{formatDateTime(task.completedAt, user.timezone)}</KeyValue>
              ) : null}
            </dl>
            {task.deadlineChanges.length > 0 ? (
              <div className="border-t border-border p-4">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                  <History className="size-3.5" aria-hidden="true" />
                  Deadline history
                </p>
                <ul className="mt-2 space-y-2">
                  {task.deadlineChanges.map((change) => (
                    <li key={change.id} className="text-[11px] leading-relaxed text-fg-muted">
                      <span className="block">
                        {change.fromDueAt ? formatDate(change.fromDueAt, user.timezone) : "none"} →{" "}
                        <strong className="font-semibold text-fg">
                          {change.toDueAt ? formatDate(change.toDueAt, user.timezone) : "none"}
                        </strong>
                      </span>
                      <span className="block text-fg-subtle">
                        {change.changedBy.name}, {formatRelative(change.createdAt)}
                        {change.reason ? ` — ${change.reason}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>

          {task.reviews.length > 0 ? (
            <Card>
              <CardHeader title="Review history" level={3} />
              <ul className="divide-y divide-border">
                {task.reviews.map((entry) => (
                  <li key={entry.id} className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-fg">Round {entry.round}</p>
                      <span
                        className={`chip ${
                          entry.decision === "APPROVED"
                            ? "chip-COMPLETED"
                            : entry.decision === "CHANGES_REQUESTED"
                              ? "chip-CHANGES_REQUESTED"
                              : "chip-SUBMITTED_FOR_REVIEW"
                        }`}
                      >
                        {entry.decision === "PENDING" ? "Awaiting decision" : entry.decision === "APPROVED" ? "Approved" : "Changes requested"}
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] text-fg-subtle">
                      {entry.submittedBy.name} submitted {formatRelative(entry.submittedAt)}
                      {entry.decidedBy ? ` · ${entry.decidedBy.name} decided ${formatRelative(entry.decidedAt!)}` : ""}
                    </p>
                    {entry.summary ? (
                      <p className="mt-1.5 line-clamp-3 text-[11px] leading-relaxed text-fg-muted">{entry.summary}</p>
                    ) : null}
                    {entry.feedback ? (
                      <p className="mt-1.5 rounded bg-surface-2 p-2 text-[11px] leading-relaxed text-fg-muted">
                        <strong className="font-semibold text-fg">Feedback:</strong> {entry.feedback}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {task.extensions.length > 0 ? (
            <Card>
              <CardHeader title="Extension requests" level={3} />
              <ul className="divide-y divide-border">
                {task.extensions.map((extension) => (
                  <li key={extension.id} className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-fg">{extension.requestedBy.name}</p>
                      <span
                        className={`chip ${
                          extension.status === "APPROVED"
                            ? "chip-COMPLETED"
                            : extension.status === "REJECTED"
                              ? "chip-BLOCKED"
                              : "chip-CHANGES_REQUESTED"
                        }`}
                      >
                        {extension.status.toLowerCase()}
                      </span>
                    </div>
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-fg-muted">
                      <CalendarClock className="size-3" aria-hidden="true" />
                      {extension.currentDueAt ? formatDate(extension.currentDueAt, user.timezone) : "none"} →{" "}
                      {formatDate(extension.requestedDueAt, user.timezone)}
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-fg-muted">{extension.reason}</p>
                    {extension.decisionNote ? (
                      <p className="mt-1 text-[11px] text-fg-subtle">
                        {extension.decidedBy?.name}: {extension.decisionNote}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {task.updateRequests.length > 0 ? (
            <Card>
              <CardHeader title="Update requests" level={3} />
              <ul className="divide-y divide-border">
                {task.updateRequests.map((request) => (
                  <li key={request.id} className="p-3">
                    <p className="text-xs font-semibold text-fg">
                      {request.requestedBy.name} → {request.requestedOf.name}
                    </p>
                    {request.message ? (
                      <p className="mt-1 text-[11px] leading-relaxed text-fg-muted">&ldquo;{request.message}&rdquo;</p>
                    ) : null}
                    <p className="mt-1 text-[10px]">
                      {request.respondedAt ? (
                        <span className="text-track">Answered {formatRelative(request.respondedAt)}</span>
                      ) : (
                        <span className="text-risk">
                          Asked {formatRelative(request.createdAt)} · no reply yet
                        </span>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Context" level={3} />
            <dl className="space-y-3 p-4">
              <KeyValue label="Team">
                {task.team ? (
                  <Link href={`/teams/${task.team.id}`} className="hover:text-primary hover:underline">
                    {task.team.name}
                  </Link>
                ) : (
                  "No team"
                )}
              </KeyValue>
              <KeyValue label="Project">
                {task.project ? `${task.project.key} — ${task.project.name}` : "No project"}
              </KeyValue>
              <KeyValue label="Category">{task.category ?? "None"}</KeyValue>
              <KeyValue label="Created by">{task.createdBy.name}</KeyValue>
              <KeyValue label="Task code">
                <span className="tnum font-mono">{task.code}</span>
              </KeyValue>
            </dl>
            {task.status === "BLOCKED" ? (
              <div className="border-t border-border p-4">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-overdue">
                  <OctagonAlert className="size-3.5" aria-hidden="true" />
                  Blocked since {task.blockedAt ? formatRelative(task.blockedAt) : "recently"}
                </p>

              </div>
            ) : null}
          </Card>

          {task.attachments.length === 0 && task.progressUpdates.length === 0 ? (
            <Card>
              <EmptyState
                compact
                icon={<FileText className="size-5" aria-hidden="true" />}
                title="No reports or files yet"
              />
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
