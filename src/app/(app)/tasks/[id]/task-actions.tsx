"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  Ban,
  CalendarClock,
  Check,
  CircleDot,
  Hand,
  OctagonAlert,
  Radio,
  RotateCcw,
  Send,
  Settings2,
  TrendingUp,
  Undo2,
  UserCog,
} from "lucide-react";

import {
  acknowledgeTaskAction,
  archiveTaskAction,
  cancelTaskAction,
  changeDeadlineAction,
  clearBlockerAction,
  decideReviewAction,
  postProgressAction,
  publishTaskAction,
  reportBlockerAction,
  requestExtensionAction,
  requestUpdatesAction,
  restoreTaskAction,
  setAssigneesAction,
  startTaskAction,
  submitForReviewAction,
} from "@/app/actions/tasks";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Select, TextArea, TextInput } from "@/components/ui/form";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { Avatar, Card } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import type { AssigneeStatus, AssignmentType, ProgressMode, TaskStatus } from "@/lib/enums";
import { formatRelative } from "@/lib/dates";
import { cn } from "@/lib/utils";

type TaskSummary = {
  id: string;
  code: string;
  title: string;
  status: TaskStatus;
  progress: number;
  dueAt: string | null;
  progressMode: ProgressMode;
  reviewRequired: boolean;
  teamId: string | null;
  assignmentType: AssignmentType;
};

type Me = {
  id: string;
  isAssignee: boolean;
  assignmentStatus: AssigneeStatus | null;
  assignmentProgress: number;
  canReportProgress: boolean;
  canManage: boolean;
  canReview: boolean;
  isOwner: boolean;
};

type AssigneeRow = {
  userId: string;
  name: string;
  avatarColor: string;
  jobTitle: string | null;
  isRequired: boolean;
  isPrimary: boolean;
  status: AssigneeStatus;
};

type Dialog =
  | null
  | "progress"
  | "blocker"
  | "unblock"
  | "submit"
  | "extension"
  | "review"
  | "deadline"
  | "requestUpdate"
  | "reassign"
  | "cancel"
  | "archive";

/**
 * The action bar.
 *
 * Which buttons appear is decided by the server-side permission result passed
 * in, and every action is re-authorised on the server — this only decides what
 * is worth showing.
 */
export function TaskActions({
  task,
  me,
  pendingReview,
  openUpdateRequest,
  pendingExtension,
  assignees,
}: {
  task: TaskSummary;
  me: Me;
  pendingReview: {
    id: string;
    round: number;
    submittedByName: string;
    submittedById: string;
    summary: string | null;
    submittedAt: string;
  } | null;
  openUpdateRequest: { id: string; message: string | null; requestedByName: string } | null;
  pendingExtension: boolean;
  assignees: AssigneeRow[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<Dialog>(null);

  // Form state for each dialog.
  const [progress, setProgress] = useState(me.assignmentProgress);
  const [workCompleted, setWorkCompleted] = useState("");
  const [workRemaining, setWorkRemaining] = useState("");
  const [blockersText, setBlockersText] = useState("");
  const [helpNeeded, setHelpNeeded] = useState("");
  const [expectedCompletion, setExpectedCompletion] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [summary, setSummary] = useState("");
  const [feedback, setFeedback] = useState("");
  const [newDueAt, setNewDueAt] = useState(task.dueAt ? task.dueAt.slice(0, 16) : "");
  const [deadlineReason, setDeadlineReason] = useState("");
  const [extensionDate, setExtensionDate] = useState("");
  const [extensionReason, setExtensionReason] = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const [requestTargets, setRequestTargets] = useState<string[]>(
    assignees.filter((a) => a.status !== "COMPLETED" && a.status !== "SUBMITTED").map((a) => a.userId),
  );
  const [reassignRequired, setReassignRequired] = useState(assignees.filter((a) => a.isRequired).map((a) => a.userId));
  const [reassignOptional, setReassignOptional] = useState(assignees.filter((a) => !a.isRequired).map((a) => a.userId));
  const [reassignPrimary, setReassignPrimary] = useState(assignees.find((a) => a.isPrimary)?.userId ?? "");
  const [cancelNote, setCancelNote] = useState("");

  const close = () => setDialog(null);

  const run = (
    label: string,
    operation: () => Promise<{ ok: boolean; error?: string }>,
    options?: { description?: string },
  ) => {
    startTransition(async () => {
      const result = await operation();
      if (result.ok) {
        toast({ tone: "success", title: label, description: options?.description });
        close();
        router.refresh();
      } else {
        toast({ tone: "error", title: "That did not work", description: result.error });
      }
    });
  };

  const closed = task.status === "COMPLETED" || task.status === "CANCELLED";
  const isDraft = task.status === "DRAFT";
  const myStatus = me.assignmentStatus;

  const showAcknowledge = me.isAssignee && !closed && !isDraft && myStatus === "ASSIGNED";
  const showStart = me.isAssignee && !closed && !isDraft && (myStatus === "ACKNOWLEDGED" || myStatus === "CHANGES_REQUESTED");
  const showProgress = me.canReportProgress && !closed && !isDraft && myStatus !== "SUBMITTED";
  const showBlocker = me.isAssignee && !closed && !isDraft && myStatus !== "BLOCKED" && myStatus !== "SUBMITTED";
  const showUnblock = !closed && (myStatus === "BLOCKED" || (me.canManage && task.status === "BLOCKED"));
  const showSubmit = me.isAssignee && !closed && !isDraft && myStatus !== "SUBMITTED";
  const showExtension = me.isAssignee && !closed && !isDraft && !pendingExtension;

  return (
    <>
      {openUpdateRequest ? (
        <Card className="mb-3 border-risk/50">
          <div className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                <Radio className="size-3.5 text-risk" aria-hidden="true" />
                {openUpdateRequest.requestedByName} has asked you for an update
              </p>
              {openUpdateRequest.message ? (
                <p className="mt-0.5 text-xs text-fg-muted">&ldquo;{openUpdateRequest.message}&rdquo;</p>
              ) : null}
            </div>
            <Button variant="primary" size="sm" onClick={() => setDialog("progress")}>
              Reply with an update
            </Button>
          </div>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {isDraft && me.canManage ? (
          <Button
            variant="primary"
            loading={pending}
            onClick={() =>
              run("Task assigned", () => publishTaskAction(task.id), {
                description: "Everyone involved has been notified.",
              })
            }
          >
            <Send className="size-3.5" aria-hidden="true" />
            Assign this task
          </Button>
        ) : null}

        {showAcknowledge ? (
          <Button
            variant="primary"
            loading={pending}
            onClick={() =>
              run("Acknowledged", () => acknowledgeTaskAction(task.id), {
                description: "The person who assigned it has been told.",
              })
            }
          >
            <Hand className="size-3.5" aria-hidden="true" />
            Acknowledge
          </Button>
        ) : null}

        {showStart ? (
          <Button
            variant={showAcknowledge ? "secondary" : "primary"}
            loading={pending}
            onClick={() => run("Marked as in progress", () => startTaskAction(task.id))}
          >
            <CircleDot className="size-3.5" aria-hidden="true" />
            {myStatus === "CHANGES_REQUESTED" ? "Resume work" : "Start work"}
          </Button>
        ) : null}

        {showProgress ? (
          <Button variant="secondary" onClick={() => setDialog("progress")}>
            <TrendingUp className="size-3.5" aria-hidden="true" />
            Update progress
          </Button>
        ) : null}

        {showSubmit ? (
          <Button variant="secondary" onClick={() => setDialog("submit")}>
            <Check className="size-3.5" aria-hidden="true" />
            {task.reviewRequired ? "Submit for review" : "Mark my part complete"}
          </Button>
        ) : null}

        {showBlocker ? (
          <Button variant="secondary" onClick={() => setDialog("blocker")}>
            <OctagonAlert className="size-3.5" aria-hidden="true" />
            Report a blocker
          </Button>
        ) : null}

        {showUnblock ? (
          <Button variant="secondary" onClick={() => setDialog("unblock")}>
            <Undo2 className="size-3.5" aria-hidden="true" />
            Clear the blocker
          </Button>
        ) : null}

        {showExtension ? (
          <Button variant="secondary" onClick={() => setDialog("extension")}>
            <CalendarClock className="size-3.5" aria-hidden="true" />
            Ask for more time
          </Button>
        ) : null}

        {me.canReview && pendingReview ? (
          <Button variant="primary" onClick={() => setDialog("review")}>
            <Check className="size-3.5" aria-hidden="true" />
            Review round {pendingReview.round}
          </Button>
        ) : null}

        {pendingReview && !me.canReview && pendingReview.submittedById === me.id ? (
          <p className="rounded-md border border-border bg-surface-2 px-2.5 py-2 text-xs text-fg-muted">
            Submitted {formatRelative(pendingReview.submittedAt)} — waiting for someone else to review it. You cannot
            approve your own work.
          </p>
        ) : null}

        {/* Manager controls */}
        {me.canManage ? (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {!closed ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => setDialog("requestUpdate")}>
                  <Radio className="size-3.5" aria-hidden="true" />
                  Request an update
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDialog("deadline")}>
                  <CalendarClock className="size-3.5" aria-hidden="true" />
                  Change deadline
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDialog("reassign")}>
                  <UserCog className="size-3.5" aria-hidden="true" />
                  Reassign
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDialog("cancel")}>
                  <Ban className="size-3.5" aria-hidden="true" />
                  Cancel
                </Button>
              </>
            ) : task.status === "CANCELLED" ? (
              <Button variant="secondary" size="sm" loading={pending} onClick={() => run("Task restored", () => restoreTaskAction(task.id))}>
                <RotateCcw className="size-3.5" aria-hidden="true" />
                Restore
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => setDialog("archive")}>
              <Archive className="size-3.5" aria-hidden="true" />
              Archive
            </Button>
          </div>
        ) : null}

        {!me.isAssignee && !me.canManage ? (
          <p className="flex items-center gap-1.5 text-xs text-fg-subtle">
            <Settings2 className="size-3.5" aria-hidden="true" />
            You can see and comment on this task, but only its assignees and team lead can change it.
          </p>
        ) : null}
      </div>

      {/* ----------------------------------------------------------------
          Progress update
          ---------------------------------------------------------------- */}
      <Modal
        open={dialog === "progress"}
        onClose={close}
        title={openUpdateRequest ? "Reply with a progress update" : "Update your progress"}
        description={undefined}
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={pending}
              onClick={() =>
                run("Progress reported", () =>
                  postProgressAction(task.id, {
                    progress,
                    workCompleted,
                    workRemaining,
                    blockers: blockersText,
                    helpNeeded,
                    expectedCompletion: expectedCompletion || null,
                    linkUrl: linkUrl || null,
                    updateRequestId: openUpdateRequest?.id ?? null,
                  }),
                )
              }
            >
              Post update
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {task.progressMode === "CHECKLIST" ? (
            <p className="rounded-md bg-primary-soft p-2.5 text-xs text-primary-soft-fg">
              This task&rsquo;s percentage is counted from its checklist, so it is not editable here. Tick items off in
              the checklist instead — your notes below are still recorded.
            </p>
          ) : (
            <Field
              label={`Completion: ${progress}%`}
              htmlFor="progress-range"
              required
              hint="Your share, not the whole task."
            >
              <div className="flex items-center gap-3">
                <input
                  id="progress-range"
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={progress}
                  onChange={(event) => setProgress(Number(event.target.value))}
                  className="h-10 w-full accent-[var(--primary)]"
                />
                <TextInput
                  type="number"
                  min={0}
                  max={100}
                  value={progress}
                  onChange={(event) => setProgress(Math.max(0, Math.min(100, Number(event.target.value))))}
                  className="w-20"
                  aria-label="Completion percentage"
                />
              </div>
            </Field>
          )}

          <Field label="What you finished since your last update" htmlFor="work-completed">
            <TextArea
              id="work-completed"
              value={workCompleted}
              onChange={(event) => setWorkCompleted(event.target.value)}
              rows={3}
              placeholder="Metadata exchange works end to end and is behind a feature flag."
            />
          </Field>

          <Field label="What is left" htmlFor="work-remaining">
            <TextArea
              id="work-remaining"
              value={workRemaining}
              onChange={(event) => setWorkRemaining(event.target.value)}
              rows={2}
              placeholder="Group mapping and the admin documentation."
            />
          </Field>

          <Field
            label="Anything slowing you down"
            htmlFor="blockers-note"
            hint="Filling this in marks you as blocked."
          >
            <TextArea
              id="blockers-note"
              value={blockersText}
              onChange={(event) => setBlockersText(event.target.value)}
              rows={2}
            />
          </Field>

          <Field label="Help you need" htmlFor="help-needed">
            <TextArea id="help-needed" value={helpNeeded} onChange={(event) => setHelpNeeded(event.target.value)} rows={2} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Expected completion" htmlFor="expected-completion">
              <TextInput
                id="expected-completion"
                type="date"
                value={expectedCompletion}
                onChange={(event) => setExpectedCompletion(event.target.value)}
              />
            </Field>
            <Field label="Link to the work" htmlFor="progress-link">
              <TextInput
                id="progress-link"
                type="url"
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
                placeholder="https://…"
              />
            </Field>
          </div>
        </div>
      </Modal>

      {/* ----------------------------------------------------------------
          Blocker
          ---------------------------------------------------------------- */}
      <Modal
        open={dialog === "blocker"}
        onClose={close}
        title="Report a blocker"
        description="Your team lead is notified."
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={pending}
              disabled={blockersText.trim().length === 0}
              onClick={() =>
                run("Blocker reported", () =>
                  reportBlockerAction(task.id, { reason: blockersText, helpNeeded, progress }),
                )
              }
            >
              Report it
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="What is blocking you" htmlFor="blocker-reason" required>
            <TextArea
              id="blocker-reason"
              value={blockersText}
              onChange={(event) => setBlockersText(event.target.value)}
              rows={4}
              placeholder="The staging database drops connections under load, so I cannot measure the change."
            />
          </Field>
          <Field label="What would unblock you" htmlFor="blocker-help">
            <TextArea
              id="blocker-help"
              value={helpNeeded}
              onChange={(event) => setHelpNeeded(event.target.value)}
              rows={2}
              placeholder="Someone from platform to raise the connection limit for a day."
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={dialog === "unblock"}
        onClose={close}
        title="Clear the blocker"
        description="The task returns to in progress."
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={pending}
              onClick={() => run("Blocker cleared", () => clearBlockerAction(task.id, workCompleted || null))}
            >
              Clear it
            </Button>
          </>
        }
      >
        <Field label="What changed" htmlFor="unblock-note">
          <TextArea
            id="unblock-note"
            value={workCompleted}
            onChange={(event) => setWorkCompleted(event.target.value)}
            rows={3}
            placeholder="Platform raised the connection limit this morning."
          />
        </Field>
      </Modal>

      {/* ----------------------------------------------------------------
          Submit for review
          ---------------------------------------------------------------- */}
      <Modal
        open={dialog === "submit"}
        onClose={close}
        title={task.reviewRequired ? "Submit for review" : "Mark your part complete"}
        description={task.reviewRequired ? "A reviewer will approve it or send it back." : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={pending}
              disabled={summary.trim().length === 0}
              onClick={() =>
                run(task.reviewRequired ? "Submitted for review" : "Marked complete", () =>
                  submitForReviewAction(task.id, { summary, linkUrl: linkUrl || null }),
                )
              }
            >
              {task.reviewRequired ? "Submit" : "Mark complete"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field
            label="Completion summary"
            htmlFor="submit-summary"
            required
            hint="What you did, and what to look at first."
          >
            <TextArea
              id="submit-summary"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              rows={5}
              placeholder="Everything in the description is done. Tests pass and the admin guide is updated. Two follow-ups are noted in the comments."
            />
          </Field>
          <Field label="Link to the deliverable" htmlFor="submit-link" hint={undefined}>
            <TextInput
              id="submit-link"
              type="url"
              value={linkUrl}
              onChange={(event) => setLinkUrl(event.target.value)}
              placeholder="https://…"
            />
          </Field>
        </div>
      </Modal>

      {/* ----------------------------------------------------------------
          Review decision
          ---------------------------------------------------------------- */}
      <Modal
        open={dialog === "review"}
        onClose={close}
        title={pendingReview ? `Review ${task.code}, round ${pendingReview.round}` : "Review"}
        description={pendingReview ? `${pendingReview.submittedByName} submitted ${formatRelative(pendingReview.submittedAt)}.` : undefined}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              loading={pending}
              disabled={feedback.trim().length === 0}
              onClick={() =>
                run("Sent back for changes", () => decideReviewAction(task.id, { decision: "CHANGES_REQUESTED", feedback }), {
                  description: "The assignee has been notified with your feedback.",
                })
              }
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              Request changes
            </Button>
            <Button
              variant="primary"
              loading={pending}
              onClick={() =>
                run("Approved", () => decideReviewAction(task.id, { decision: "APPROVED", feedback: feedback || null }), {
                  description: "The task is complete.",
                })
              }
            >
              <Check className="size-3.5" aria-hidden="true" />
              Approve
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {pendingReview?.summary ? (
            <div>
              <p className="text-xs font-semibold text-fg">Their completion summary</p>
              <p className="mt-1 whitespace-pre-wrap rounded-md bg-surface-2 p-3 text-sm leading-relaxed text-fg-muted">
                {pendingReview.summary}
              </p>
            </div>
          ) : null}
          <Field
            label="Feedback"
            htmlFor="review-note"
            hint={undefined}
          >
            <TextArea
              id="review-note"
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              rows={4}
              placeholder="Approved — thank you for the clear summary."
            />
          </Field>
        </div>
      </Modal>

      {/* ----------------------------------------------------------------
          Deadline
          ---------------------------------------------------------------- */}
      <Modal
        open={dialog === "deadline"}
        onClose={close}
        title="Change the deadline"
        description="The original is kept in the task history."
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={pending}
              onClick={() =>
                run("Deadline changed", () =>
                  changeDeadlineAction(task.id, { dueAt: newDueAt || null, reason: deadlineReason || null }),
                )
              }
            >
              Save new deadline
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="New deadline" htmlFor="new-deadline" hint={undefined}>
            <TextInput
              id="new-deadline"
              type="datetime-local"
              value={newDueAt}
              onChange={(event) => setNewDueAt(event.target.value)}
            />
          </Field>
          <Field label="Reason" htmlFor="deadline-reason" hint={undefined}>
            <TextArea
              id="deadline-reason"
              value={deadlineReason}
              onChange={(event) => setDeadlineReason(event.target.value)}
              rows={3}
            />
          </Field>
        </div>
      </Modal>

      {/* ----------------------------------------------------------------
          Extension request
          ---------------------------------------------------------------- */}
      <Modal
        open={dialog === "extension"}
        onClose={close}
        title="Ask for more time"
        description="Your team lead decides."
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={pending}
              disabled={!extensionDate || extensionReason.trim().length === 0}
              onClick={() =>
                run("Extension requested", () =>
                  requestExtensionAction(task.id, { requestedDueAt: extensionDate, reason: extensionReason }),
                )
              }
            >
              Send request
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="New deadline you need" htmlFor="extension-date" required>
            <TextInput
              id="extension-date"
              type="datetime-local"
              value={extensionDate}
              onChange={(event) => setExtensionDate(event.target.value)}
            />
          </Field>
          <Field label="Why" htmlFor="extension-reason" required hint={undefined}>
            <TextArea
              id="extension-reason"
              value={extensionReason}
              onChange={(event) => setExtensionReason(event.target.value)}
              rows={4}
              placeholder="Two sections need data I only get after the month-end close."
            />
          </Field>
        </div>
      </Modal>

      {/* ----------------------------------------------------------------
          Request an update
          ---------------------------------------------------------------- */}
      <Modal
        open={dialog === "requestUpdate"}
        onClose={close}
        title="Request a progress update"
        description={undefined}
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={pending}
              disabled={requestTargets.length === 0}
              onClick={() =>
                run("Update requested", () =>
                  requestUpdatesAction(task.id, { userIds: requestTargets, message: requestMessage, dueAt: null }),
                )
              }
            >
              Send request
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold text-fg">Who to ask</legend>
            <div className="space-y-1.5">
              {assignees.map((assignee) => (
                <Checkbox
                  key={assignee.userId}
                  label={assignee.name}
                  description={assignee.jobTitle ?? undefined}
                  checked={requestTargets.includes(assignee.userId)}
                  onChange={(event) =>
                    setRequestTargets((current) =>
                      event.target.checked
                        ? [...current, assignee.userId]
                        : current.filter((id) => id !== assignee.userId),
                    )
                  }
                />
              ))}
            </div>
          </fieldset>
          <Field label="Message" htmlFor="request-message">
            <TextArea
              id="request-message"
              value={requestMessage}
              onChange={(event) => setRequestMessage(event.target.value)}
              rows={3}
              placeholder="Where has this got to? I need a realistic finish date before Thursday."
            />
          </Field>
        </div>
      </Modal>

      {/* ----------------------------------------------------------------
          Reassign
          ---------------------------------------------------------------- */}
      <Modal
        open={dialog === "reassign"}
        onClose={close}
        title="Change who is accountable"
        description="Past progress reports are kept."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={pending}
              disabled={reassignRequired.length === 0}
              onClick={() =>
                run("Assignees updated", () =>
                  setAssigneesAction(task.id, {
                    assigneeIds: reassignRequired,
                    optionalAssigneeIds: reassignOptional,
                    primaryOwnerId: reassignPrimary || null,
                  }),
                )
              }
            >
              Save assignees
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="rounded-md bg-surface-2 p-2.5 text-xs text-fg-muted">
            Only the people already on this task can be toggled here. To bring in somebody new, add them to the team
            first, then reassign.
          </p>
          <ul className="space-y-1.5">
            {assignees.map((assignee) => {
              const required = reassignRequired.includes(assignee.userId);
              const optional = reassignOptional.includes(assignee.userId);
              return (
                <li
                  key={assignee.userId}
                  className={cn(
                    "flex flex-wrap items-center gap-2 rounded-md border p-2.5",
                    required ? "border-primary bg-primary-soft" : "border-border",
                  )}
                >
                  <Avatar name={assignee.name} color={assignee.avatarColor} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-xs font-semibold", required ? "text-primary-soft-fg" : "text-fg")}>
                      {assignee.name}
                    </span>
                    <span className="block truncate text-[10px] text-fg-subtle">{assignee.status.toLowerCase().replace(/_/g, " ")}</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant={required ? "primary" : "secondary"}
                      onClick={() => {
                        setReassignRequired((current) =>
                          current.includes(assignee.userId)
                            ? current.filter((id) => id !== assignee.userId)
                            : [...current, assignee.userId],
                        );
                        setReassignOptional((current) => current.filter((id) => id !== assignee.userId));
                      }}
                    >
                      Required
                    </Button>
                    <Button
                      size="sm"
                      variant={optional ? "accent" : "secondary"}
                      onClick={() => {
                        setReassignOptional((current) =>
                          current.includes(assignee.userId)
                            ? current.filter((id) => id !== assignee.userId)
                            : [...current, assignee.userId],
                        );
                        setReassignRequired((current) => current.filter((id) => id !== assignee.userId));
                      }}
                    >
                      Optional
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          <Field label="Primary owner" htmlFor="reassign-primary" hint="The one person answerable for the final result.">
            <Select id="reassign-primary" value={reassignPrimary} onChange={(event) => setReassignPrimary(event.target.value)}>
              <option value="">No single owner</option>
              {assignees
                .filter((a) => reassignRequired.includes(a.userId) || reassignOptional.includes(a.userId))
                .map((assignee) => (
                  <option key={assignee.userId} value={assignee.userId}>
                    {assignee.name}
                  </option>
                ))}
            </Select>
          </Field>
        </div>
      </Modal>

      {/* ----------------------------------------------------------------
          Cancel / archive
          ---------------------------------------------------------------- */}
      <Modal
        open={dialog === "cancel"}
        onClose={close}
        title={`Cancel ${task.code}`}
        description="The assignees are told. This can be undone."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={pending}>
              Keep it open
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() => run("Task cancelled", () => cancelTaskAction(task.id, cancelNote || null))}
            >
              Cancel the task
            </Button>
          </>
        }
      >
        <Field label="Reason" htmlFor="cancel-note" hint="Included in the notification to the assignees.">
          <TextArea id="cancel-note" value={cancelNote} onChange={(event) => setCancelNote(event.target.value)} rows={3} />
        </Field>
      </Modal>

      <ConfirmDialog
        open={dialog === "archive"}
        onClose={close}
        onConfirm={() => run("Task archived", () => archiveTaskAction(task.id))}
        title={`Archive ${task.code}?`}
        message="It drops out of lists but keeps its full history."
        confirmLabel="Archive"
        loading={pending}
      />
    </>
  );
}
