"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/server/auth";
import { fail, ok, type ActionResult } from "@/server/respond";
import {
  addSubtaskSchema,
  blockerSchema,
  changeDeadlineSchema,
  commentSchema,
  createTaskSchema,
  extensionDecisionSchema,
  extensionRequestSchema,
  linkAttachmentSchema,
  progressUpdateSchema,
  requestUpdateSchema,
  reviewDecisionSchema,
  setAssigneesSchema,
  submitForReviewSchema,
  toggleSubtaskSchema,
  transferTeamSchema,
  updateTaskSchema,
} from "@/lib/validation";
import {
  acknowledgeTask,
  addSubtask,
  archiveTask,
  cancelTask,
  changeDeadline,
  createTask,
  deleteSubtask,
  deleteTask,
  publishTask,
  restoreTask,
  setAssignees,
  startTask,
  toggleSubtask,
  transferTask,
  unarchiveTask,
  updateTask,
} from "@/server/services/tasks";
import { clearBlocker, postProgressUpdate, reportBlocker, requestUpdates } from "@/server/services/progress";
import { decideReview, submitForReview } from "@/server/services/reviews";
import { decideExtension, requestExtension } from "@/server/services/extensions";
import { addComment, deleteComment, editComment } from "@/server/services/comments";
import { addLinkAttachment, deleteAttachment } from "@/server/services/attachments";

/** Refresh every surface that shows task state. */
function revalidateTaskViews(taskId?: string): void {
  revalidatePath("/dashboard");
  revalidatePath("/my-tasks");
  revalidatePath("/tasks");
  revalidatePath("/calendar");
  revalidatePath("/teams");
  revalidatePath("/employees");
  revalidatePath("/reports");
  revalidatePath("/notifications");
  if (taskId) revalidatePath(`/tasks/${taskId}`);
}

export async function createTaskAction(input: unknown): Promise<ActionResult<{ id: string; code: string }>> {
  try {
    const actor = await requireUser();
    const parsed = createTaskSchema.parse(input);
    const task = await createTask(actor, parsed);
    revalidateTaskViews(task.id);
    return ok({ id: task.id, code: task.code });
  } catch (error) {
    return fail(error);
  }
}

export async function updateTaskAction(taskId: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    await updateTask(actor, taskId, updateTaskSchema.parse(input));
    revalidateTaskViews(taskId);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function publishTaskAction(taskId: string): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    await publishTask(actor, taskId);
    revalidateTaskViews(taskId);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function changeDeadlineAction(taskId: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    await changeDeadline(actor, taskId, changeDeadlineSchema.parse(input));
    revalidateTaskViews(taskId);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function setAssigneesAction(taskId: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    await setAssignees(actor, taskId, setAssigneesSchema.parse(input));
    revalidateTaskViews(taskId);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function transferTaskAction(taskId: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    await transferTask(actor, taskId, transferTeamSchema.parse(input));
    revalidateTaskViews(taskId);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function cancelTaskAction(taskId: string, note: string | null): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    await cancelTask(actor, taskId, note);
    revalidateTaskViews(taskId);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function restoreTaskAction(taskId: string): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    await restoreTask(actor, taskId);
    revalidateTaskViews(taskId);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function archiveTaskAction(taskId: string): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    await archiveTask(actor, taskId);
    revalidateTaskViews(taskId);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function unarchiveTaskAction(taskId: string): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    await unarchiveTask(actor, taskId);
    revalidateTaskViews(taskId);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function deleteTaskAction(taskId: string): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    await deleteTask(actor, taskId);
    revalidateTaskViews();
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

// --- assignee actions ------------------------------------------------------

export async function acknowledgeTaskAction(taskId: string): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    await acknowledgeTask(actor, taskId);
    revalidateTaskViews(taskId);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function startTaskAction(taskId: string): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    await startTask(actor, taskId);
    revalidateTaskViews(taskId);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function postProgressAction(taskId: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    await postProgressUpdate(actor, taskId, progressUpdateSchema.parse(input));
    revalidateTaskViews(taskId);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function reportBlockerAction(taskId: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    await reportBlocker(actor, taskId, blockerSchema.parse(input));
    revalidateTaskViews(taskId);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function clearBlockerAction(taskId: string, note: string | null): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    await clearBlocker(actor, taskId, note);
    revalidateTaskViews(taskId);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function submitForReviewAction(taskId: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    await submitForReview(actor, taskId, submitForReviewSchema.parse(input));
    revalidateTaskViews(taskId);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function decideReviewAction(taskId: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    await decideReview(actor, taskId, reviewDecisionSchema.parse(input));
    revalidateTaskViews(taskId);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function requestUpdatesAction(taskId: string, input: unknown): Promise<ActionResult<{ count: number }>> {
  try {
    const actor = await requireUser();
    const count = await requestUpdates(actor, taskId, requestUpdateSchema.parse(input));
    revalidateTaskViews(taskId);
    return ok({ count });
  } catch (error) {
    return fail(error);
  }
}

export async function requestExtensionAction(taskId: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    await requestExtension(actor, taskId, extensionRequestSchema.parse(input));
    revalidateTaskViews(taskId);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function decideExtensionAction(requestId: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    const decided = await decideExtension(actor, requestId, extensionDecisionSchema.parse(input));
    revalidateTaskViews(decided.taskId);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

// --- checklist, comments, links -------------------------------------------

export async function addSubtaskAction(taskId: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    const parsed = addSubtaskSchema.parse(input);
    await addSubtask(actor, taskId, parsed.title);
    revalidateTaskViews(taskId);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function toggleSubtaskAction(subtaskId: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    const parsed = toggleSubtaskSchema.parse(input);
    const subtask = await toggleSubtask(actor, subtaskId, parsed.isDone);
    revalidateTaskViews(subtask.taskId);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function deleteSubtaskAction(subtaskId: string, taskId: string): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    await deleteSubtask(actor, subtaskId);
    revalidateTaskViews(taskId);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function addCommentAction(taskId: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    await addComment(actor, taskId, commentSchema.parse(input));
    revalidateTaskViews(taskId);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function editCommentAction(commentId: string, taskId: string, body: string): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    const parsed = commentSchema.parse({ body, parentId: null });
    await editComment(actor, commentId, parsed.body);
    revalidateTaskViews(taskId);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function deleteCommentAction(commentId: string, taskId: string): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    await deleteComment(actor, commentId);
    revalidateTaskViews(taskId);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function addLinkAction(taskId: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    const parsed = linkAttachmentSchema.parse(input);
    await addLinkAttachment(actor, taskId, { url: parsed.url as string, label: parsed.label });
    revalidateTaskViews(taskId);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function deleteAttachmentAction(attachmentId: string, taskId: string): Promise<ActionResult<null>> {
  try {
    const actor = await requireUser();
    await deleteAttachment(actor, attachmentId);
    revalidateTaskViews(taskId);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}
