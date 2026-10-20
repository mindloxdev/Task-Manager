"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, Eye, RotateCcw } from "lucide-react";

import { decideExtensionAction, decideReviewAction } from "@/app/actions/tasks";
import { Button } from "@/components/ui/button";
import { Field, TextArea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { SectionTitle } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatRelative } from "@/lib/dates";

type ReviewRow = {
  id: string;
  taskId: string;
  code: string;
  title: string;
  submittedByName: string;
  submittedAt: Date;
  summary: string | null;
  teamName: string | null;
};

type ExtensionRow = {
  id: string;
  reason: string;
  requestedDueAt: Date;
  currentDueAt: Date | null;
  requestedBy: { id: string; name: string };
  task: { id: string; code: string; title: string };
};

/**
 * The reviewer's inbox: approve or send back submitted work, and decide
 * extension requests, without leaving the dashboard.
 */
export function ReviewQueue({ reviews, extensions }: { reviews: ReviewRow[]; extensions: ExtensionRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [changesFor, setChangesFor] = useState<ReviewRow | null>(null);
  const [feedback, setFeedback] = useState("");
  const [extensionFor, setExtensionFor] = useState<ExtensionRow | null>(null);
  const [extensionNote, setExtensionNote] = useState("");

  const approve = (row: ReviewRow) => {
    startTransition(async () => {
      const result = await decideReviewAction(row.taskId, { decision: "APPROVED", feedback: null });
      if (result.ok) {
        toast({ tone: "success", title: `${row.code} approved`, description: "The task is now complete." });
        router.refresh();
      } else {
        toast({ tone: "error", title: "Could not approve", description: result.error });
      }
    });
  };

  const requestChanges = () => {
    if (!changesFor) return;
    const row = changesFor;
    startTransition(async () => {
      const result = await decideReviewAction(row.taskId, { decision: "CHANGES_REQUESTED", feedback });
      if (result.ok) {
        toast({ tone: "success", title: `Sent ${row.code} back`, description: "The assignee has been notified." });
        setChangesFor(null);
        setFeedback("");
        router.refresh();
      } else {
        toast({ tone: "error", title: "Could not send it back", description: result.error });
      }
    });
  };

  const decideExtension = (row: ExtensionRow, decision: "APPROVED" | "REJECTED") => {
    startTransition(async () => {
      const result = await decideExtensionAction(row.id, { decision, note: extensionNote || null });
      if (result.ok) {
        toast({
          tone: "success",
          title: decision === "APPROVED" ? "Extension approved" : "Extension rejected",
          description:
            decision === "APPROVED"
              ? `The ${row.task.code} deadline moved to ${formatDate(row.requestedDueAt)}.`
              : `${row.requestedBy.name} has been told the deadline stands.`,
        });
        setExtensionFor(null);
        setExtensionNote("");
        router.refresh();
      } else {
        toast({ tone: "error", title: "Could not record that decision", description: result.error });
      }
    });
  };

  if (reviews.length === 0 && extensions.length === 0) return null;

  return (
    <>
      {reviews.length > 0 ? (
        <div className="p-3">
          <SectionTitle hint={`${reviews.length} waiting`}>Submitted for your review</SectionTitle>
          <ul className="space-y-2">
            {reviews.map((row) => (
              <li key={row.id} className="rounded-md border border-border bg-surface-2/60 p-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 basis-60">
                    <Link
                      href={`/tasks/${row.taskId}`}
                      className="text-xs font-semibold text-fg hover:text-primary hover:underline"
                    >
                      <span className="tnum font-mono">{row.code}</span> — {row.title}
                    </Link>
                    <p className="mt-0.5 text-[11px] text-fg-subtle">
                      {row.submittedByName} submitted {formatRelative(row.submittedAt)}
                      {row.teamName ? ` · ${row.teamName}` : ""}
                    </p>
                    {row.summary ? (
                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-fg-muted">{row.summary}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button size="sm" variant="primary" loading={pending} onClick={() => approve(row)}>
                      <Check className="size-3.5" aria-hidden="true" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      onClick={() => {
                        setChangesFor(row);
                        setFeedback("");
                      }}
                    >
                      <RotateCcw className="size-3.5" aria-hidden="true" />
                      Changes
                    </Button>
                    <Link
                      href={`/tasks/${row.taskId}`}
                      className="rounded-md p-2 text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
                      aria-label={`Open ${row.code} in full`}
                    >
                      <Eye className="size-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {extensions.length > 0 ? (
        <div className="p-3">
          <SectionTitle hint={`${extensions.length} pending`}>Extension requests</SectionTitle>
          <ul className="space-y-2">
            {extensions.map((row) => (
              <li key={row.id} className="rounded-md border border-risk/40 bg-risk-bg/50 p-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 basis-60">
                    <Link
                      href={`/tasks/${row.task.id}`}
                      className="text-xs font-semibold text-fg hover:text-primary hover:underline"
                    >
                      <span className="tnum font-mono">{row.task.code}</span> — {row.task.title}
                    </Link>
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-fg-muted">
                      <CalendarClock className="size-3" aria-hidden="true" />
                      {row.requestedBy.name} asks to move{" "}
                      {row.currentDueAt ? formatDate(row.currentDueAt) : "the deadline"} →{" "}
                      <strong className="font-semibold text-fg">{formatDate(row.requestedDueAt)}</strong>
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-fg-muted">&ldquo;{row.reason}&rdquo;</p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => {
                      setExtensionFor(row);
                      setExtensionNote("");
                    }}
                  >
                    Decide
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Modal
        open={changesFor !== null}
        onClose={() => setChangesFor(null)}
        title={changesFor ? `Request changes on ${changesFor.code}` : "Request changes"}
        description="The task returns to the assignee."
        footer={
          <>
            <Button variant="secondary" onClick={() => setChangesFor(null)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" onClick={requestChanges} loading={pending} disabled={feedback.trim().length === 0}>
              Send back
            </Button>
          </>
        }
      >
        <Field
          label="What needs changing"
          htmlFor="review-feedback"
          required
          hint={undefined}
        >
          <TextArea
            id="review-feedback"
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            rows={5}
            placeholder="The fix works, but there is no regression test for the reassign path…"
          />
        </Field>
      </Modal>

      <Modal
        open={extensionFor !== null}
        onClose={() => setExtensionFor(null)}
        title={extensionFor ? `Extension on ${extensionFor.task.code}` : "Extension request"}
        description={
          extensionFor ? `${extensionFor.requestedBy.name} asked for ${formatDate(extensionFor.requestedDueAt)}` : undefined
        }
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => extensionFor && decideExtension(extensionFor, "REJECTED")}
              loading={pending}
            >
              Reject
            </Button>
            <Button
              variant="primary"
              onClick={() => extensionFor && decideExtension(extensionFor, "APPROVED")}
              loading={pending}
            >
              Approve new deadline
            </Button>
          </>
        }
      >
        {extensionFor ? (
          <div className="space-y-3">
            <p className="rounded-md bg-surface-2 p-2.5 text-xs leading-relaxed text-fg-muted">
              &ldquo;{extensionFor.reason}&rdquo;
            </p>
            <Field label="Note back to them" htmlFor="extension-note">
              <TextArea
                id="extension-note"
                value={extensionNote}
                onChange={(event) => setExtensionNote(event.target.value)}
                rows={3}
                placeholder="Approved, but let me know by Friday if it slips again."
              />
            </Field>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
