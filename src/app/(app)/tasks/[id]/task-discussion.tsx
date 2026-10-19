"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  ExternalLink,
  Link2,
  ListChecks,
  MessageSquare,
  Paperclip,
  Plus,
  Reply,
  Trash2,
  Upload,
} from "lucide-react";

import {
  addCommentAction,
  addLinkAction,
  addSubtaskAction,
  deleteAttachmentAction,
  deleteCommentAction,
  deleteSubtaskAction,
  toggleSubtaskAction,
} from "@/app/actions/tasks";
import { Button } from "@/components/ui/button";
import { Field, TextArea, TextInput } from "@/components/ui/form";
import { Avatar, Card, CardHeader, EmptyState, ProgressBar } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import type { ProgressMode } from "@/lib/enums";
import { formatRelative } from "@/lib/dates";
import { cn, isValidHttpUrl, ratioPct } from "@/lib/utils";

type Subtask = {
  id: string;
  title: string;
  isDone: boolean;
  completedByName: string | null;
  completedAt: string | null;
};

type Attachment = {
  id: string;
  kind: string;
  filename: string;
  label: string | null;
  url: string | null;
  sizeBytes: number | null;
  mimeType: string | null;
  uploaderId: string;
  uploaderName: string;
  createdAt: string;
};

type Comment = {
  id: string;
  body: string;
  parentId: string | null;
  authorId: string;
  authorName: string;
  authorColor: string;
  createdAt: string;
  editedAt: string | null;
};

const MAX_UPLOAD_MB = 10;

/**
 * Checklist, files and discussion — all three kept on the task rather than
 * scattered across other pages.
 */
export function TaskDiscussion({
  taskId,
  canContribute,
  canComment,
  canModerate,
  viewerId,
  progressMode,
  subtasks,
  attachments,
  comments,
}: {
  taskId: string;
  canContribute: boolean;
  canComment: boolean;
  canModerate: boolean;
  viewerId: string;
  progressMode: ProgressMode;
  subtasks: Subtask[];
  attachments: Attachment[];
  comments: Comment[];
}) {
  const done = subtasks.filter((subtask) => subtask.isDone).length;

  return (
    <>
      <Card>
        <CardHeader
          title="Checklist"
          description={
            subtasks.length > 0
              ? progressMode === "CHECKLIST"
                ? `${done} of ${subtasks.length} done — drives the task percentage`
                : `${done} of ${subtasks.length} done`
              : "Break the work into steps."
          }
          action={
            subtasks.length > 0 ? (
              <span className="tnum text-xs font-semibold text-fg-muted">{ratioPct(done, subtasks.length)}%</span>
            ) : null
          }
        />
        {subtasks.length > 0 ? (
          <div className="px-4 pt-3">
            <ProgressBar value={ratioPct(done, subtasks.length)} tone="COMPLETED" size="sm" label="Checklist progress" />
          </div>
        ) : null}
        <ChecklistPanel taskId={taskId} subtasks={subtasks} canEdit={canContribute} />
      </Card>

      <Card>
        <CardHeader
          title="Files and deliverables"
          description="Private to people on this task."
        />
        <AttachmentsPanel
          taskId={taskId}
          attachments={attachments}
          canEdit={canContribute}
          canModerate={canModerate}
          viewerId={viewerId}
        />
      </Card>

      <Card>
        <CardHeader
          title={`Discussion (${comments.length})`}
          description={undefined}
        />
        <CommentsPanel
          taskId={taskId}
          comments={comments}
          canComment={canComment}
          canModerate={canModerate}
          viewerId={viewerId}
        />
      </Card>
    </>
  );
}

function ChecklistPanel({
  taskId,
  subtasks,
  canEdit,
}: {
  taskId: string;
  subtasks: Subtask[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [newTitle, setNewTitle] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const toggle = (subtask: Subtask) => {
    setBusyId(subtask.id);
    startTransition(async () => {
      const result = await toggleSubtaskAction(subtask.id, { isDone: !subtask.isDone });
      setBusyId(null);
      if (result.ok) router.refresh();
      else toast({ tone: "error", title: "Could not update that item", description: result.error });
    });
  };

  return (
    <div className="p-4">
      {subtasks.length === 0 ? (
        <EmptyState
          compact
          icon={<ListChecks className="size-5" aria-hidden="true" />}
          title="No checklist yet"
          description={undefined}
        />
      ) : (
        <ul className="space-y-1">
          {subtasks.map((subtask) => (
            <li key={subtask.id} className="group flex items-start gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-surface-2">
              <input
                type="checkbox"
                checked={subtask.isDone}
                disabled={!canEdit || busyId === subtask.id}
                onChange={() => toggle(subtask)}
                className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
                aria-label={`Mark "${subtask.title}" as ${subtask.isDone ? "not done" : "done"}`}
              />
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm", subtask.isDone ? "text-fg-subtle line-through" : "text-fg")}>
                  {subtask.title}
                </span>
                {subtask.isDone && subtask.completedByName ? (
                  <span className="block text-[10px] text-fg-subtle">
                    {subtask.completedByName}
                    {subtask.completedAt ? `, ${formatRelative(subtask.completedAt)}` : ""}
                  </span>
                ) : null}
              </span>
              {canEdit ? (
                <button
                  type="button"
                  onClick={() =>
                    startTransition(async () => {
                      const result = await deleteSubtaskAction(subtask.id, taskId);
                      if (result.ok) router.refresh();
                      else toast({ tone: "error", title: "Could not remove it", description: result.error });
                    })
                  }
                  className="rounded p-1.5 text-fg-subtle opacity-0 transition-opacity hover:bg-overdue-bg hover:text-overdue focus-visible:opacity-100 group-hover:opacity-100"
                  aria-label={`Remove "${subtask.title}"`}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const title = newTitle.trim();
            if (!title) return;
            startTransition(async () => {
              const result = await addSubtaskAction(taskId, { title });
              if (result.ok) {
                setNewTitle("");
                router.refresh();
              } else {
                toast({ tone: "error", title: "Could not add that item", description: result.error });
              }
            });
          }}
        >
          <label htmlFor="new-subtask" className="sr-only">
            New checklist item
          </label>
          <TextInput
            id="new-subtask"
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder="Add a checklist item…"
            maxLength={200}
          />
          <Button type="submit" variant="secondary" loading={pending} disabled={newTitle.trim().length === 0}>
            <Plus className="size-3.5" aria-hidden="true" />
            Add
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function AttachmentsPanel({
  taskId,
  attachments,
  canEdit,
  canModerate,
  viewerId,
}: {
  taskId: string;
  attachments: Attachment[];
  canEdit: boolean;
  canModerate: boolean;
  viewerId: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [showLinkForm, setShowLinkForm] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      toast({
        tone: "error",
        title: "That file is too large",
        description: `The limit is ${MAX_UPLOAD_MB} MB. Link to it instead if it is bigger.`,
      });
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`/api/tasks/${taskId}/attachments`, { method: "POST", body });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        toast({ tone: "error", title: "Upload failed", description: payload.error ?? `Server returned ${response.status}` });
        return;
      }
      toast({ tone: "success", title: "File attached", description: file.name });
      router.refresh();
    } catch {
      toast({ tone: "error", title: "Upload failed", description: "Check your connection and try again." });
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <div className="p-4">
      {attachments.length === 0 ? (
        <EmptyState
          compact
          icon={<Paperclip className="size-5" aria-hidden="true" />}
          title="Nothing attached yet"
          description={undefined}
        />
      ) : (
        <ul className="space-y-1.5">
          {attachments.map((attachment) => {
            const canRemove = canModerate || attachment.uploaderId === viewerId;
            return (
              <li
                key={attachment.id}
                className="flex items-center gap-2.5 rounded-md border border-border p-2.5 transition-colors hover:bg-surface-2"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-2 text-fg-subtle">
                  {attachment.kind === "LINK" ? (
                    <Link2 className="size-4" aria-hidden="true" />
                  ) : (
                    <Paperclip className="size-4" aria-hidden="true" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-fg">
                    {attachment.label ?? attachment.filename}
                  </span>
                  <span className="block truncate text-[10px] text-fg-subtle">
                    {attachment.uploaderName} · {formatRelative(attachment.createdAt)}
                    {attachment.sizeBytes ? ` · ${formatBytes(attachment.sizeBytes)}` : ""}
                  </span>
                </span>
                {attachment.kind === "LINK" && attachment.url ? (
                  <a
                    href={attachment.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="rounded-md p-2 text-fg-subtle transition-colors hover:bg-surface-3 hover:text-fg"
                    aria-label={`Open ${attachment.label ?? attachment.filename} in a new tab`}
                  >
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                  </a>
                ) : (
                  <a
                    href={`/api/attachments/${attachment.id}/download`}
                    className="rounded-md p-2 text-fg-subtle transition-colors hover:bg-surface-3 hover:text-fg"
                    aria-label={`Download ${attachment.filename}`}
                  >
                    <Download className="size-3.5" aria-hidden="true" />
                  </a>
                )}
                {canRemove ? (
                  <button
                    type="button"
                    onClick={() =>
                      startTransition(async () => {
                        const result = await deleteAttachmentAction(attachment.id, taskId);
                        if (result.ok) router.refresh();
                        else toast({ tone: "error", title: "Could not remove it", description: result.error });
                      })
                    }
                    className="rounded-md p-2 text-fg-subtle transition-colors hover:bg-overdue-bg hover:text-overdue"
                    aria-label={`Remove ${attachment.filename}`}
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit ? (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInput}
              type="file"
              className="sr-only"
              id="attachment-input"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
              accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.svg,.txt,.csv,.md,.json,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
            />
            <Button
              type="button"
              variant="secondary"
              loading={uploading}
              onClick={() => fileInput.current?.click()}
            >
              <Upload className="size-3.5" aria-hidden="true" />
              Upload a file
            </Button>
            <Button type="button" variant="secondary" onClick={() => setShowLinkForm((current) => !current)}>
              <Link2 className="size-3.5" aria-hidden="true" />
              Add a link
            </Button>
          </div>
          <p className="text-[11px] text-fg-subtle">Up to {MAX_UPLOAD_MB} MB</p>

          {showLinkForm ? (
            <form
              className="flex flex-wrap items-end gap-2 rounded-md border border-border p-2.5"
              onSubmit={(event) => {
                event.preventDefault();
                if (!isValidHttpUrl(linkUrl.trim())) {
                  toast({ tone: "error", title: "That link is not valid", description: "Use a full http(s) address." });
                  return;
                }
                startTransition(async () => {
                  const result = await addLinkAction(taskId, { url: linkUrl.trim(), label: linkLabel.trim() || null });
                  if (result.ok) {
                    setLinkUrl("");
                    setLinkLabel("");
                    setShowLinkForm(false);
                    router.refresh();
                  } else {
                    toast({ tone: "error", title: "Could not add that link", description: result.error });
                  }
                });
              }}
            >
              <div className="w-full sm:w-40">
                <Field label="Label" htmlFor="link-label">
                  <TextInput
                    id="link-label"
                    value={linkLabel}
                    onChange={(event) => setLinkLabel(event.target.value)}
                    placeholder="Design file"
                  />
                </Field>
              </div>
              <div className="min-w-0 flex-1">
                <Field label="Address" htmlFor="link-url" required>
                  <TextInput
                    id="link-url"
                    type="url"
                    value={linkUrl}
                    onChange={(event) => setLinkUrl(event.target.value)}
                    placeholder="https://…"
                  />
                </Field>
              </div>
              <Button type="submit" variant="primary" loading={pending}>
                Add
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CommentsPanel({
  taskId,
  comments,
  canComment,
  canModerate,
  viewerId,
}: {
  taskId: string;
  comments: Comment[];
  canComment: boolean;
  canModerate: boolean;
  viewerId: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);

  const roots = comments.filter((comment) => comment.parentId === null);
  const repliesOf = (id: string) => comments.filter((comment) => comment.parentId === id);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const text = body.trim();
    if (!text) return;
    startTransition(async () => {
      const result = await addCommentAction(taskId, { body: text, parentId: replyTo?.id ?? null });
      if (result.ok) {
        setBody("");
        setReplyTo(null);
        router.refresh();
      } else {
        toast({ tone: "error", title: "Could not post that comment", description: result.error });
      }
    });
  };

  return (
    <div className="p-4">
      {roots.length === 0 ? (
        <EmptyState
          compact
          icon={<MessageSquare className="size-5" aria-hidden="true" />}
          title="No comments yet"
          description={undefined}
        />
      ) : (
        <ul className="space-y-3">
          {roots.map((comment) => (
            <li key={comment.id}>
              <CommentRow
                comment={comment}
                taskId={taskId}
                viewerId={viewerId}
                canModerate={canModerate}
                onReply={canComment ? () => setReplyTo(comment) : undefined}
              />
              {repliesOf(comment.id).length > 0 ? (
                <ul className="mt-2 space-y-2 border-l border-border pl-4">
                  {repliesOf(comment.id).map((reply) => (
                    <li key={reply.id}>
                      <CommentRow comment={reply} taskId={taskId} viewerId={viewerId} canModerate={canModerate} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canComment ? (
        <form className="mt-4 border-t border-border pt-3" onSubmit={submit}>
          {replyTo ? (
            <p className="mb-1.5 flex items-center justify-between gap-2 rounded-md bg-surface-2 px-2.5 py-1.5 text-[11px] text-fg-muted">
              <span>
                Replying to <strong className="font-semibold text-fg">{replyTo.authorName}</strong>
              </span>
              <button type="button" onClick={() => setReplyTo(null)} className="font-semibold text-primary hover:underline">
                Cancel reply
              </button>
            </p>
          ) : null}
          <label htmlFor="comment-body" className="sr-only">
            Add a comment
          </label>
          <TextArea
            id="comment-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={3}
            placeholder="Add a comment…"
            maxLength={5000}
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span />
            <Button type="submit" variant="primary" loading={pending} disabled={body.trim().length === 0}>
              Post comment
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function CommentRow({
  comment,
  taskId,
  viewerId,
  canModerate,
  onReply,
}: {
  comment: Comment;
  taskId: string;
  viewerId: string;
  canModerate: boolean;
  onReply?: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const canDelete = canModerate || comment.authorId === viewerId;

  return (
    <article className="group flex gap-2.5">
      <Avatar name={comment.authorName} color={comment.authorColor} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-fg">{comment.authorName}</span>
          <span className="text-[10px] text-fg-subtle">
            <time dateTime={comment.createdAt}>{formatRelative(comment.createdAt)}</time>
            {comment.editedAt ? " · edited" : ""}
          </span>
        </p>
        <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-fg-muted">{comment.body}</p>
        <div className="mt-1 flex items-center gap-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          {onReply ? (
            <button
              type="button"
              onClick={onReply}
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-fg-subtle hover:text-primary"
            >
              <Reply className="size-3" aria-hidden="true" />
              Reply
            </button>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await deleteCommentAction(comment.id, taskId);
                  if (result.ok) router.refresh();
                  else toast({ tone: "error", title: "Could not delete it", description: result.error });
                })
              }
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-fg-subtle hover:text-overdue"
            >
              <Trash2 className="size-3" aria-hidden="true" />
              Delete
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
