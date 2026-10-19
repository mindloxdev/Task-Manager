/**
 * Attachments: private file storage and deliverable links.
 *
 * Files are written outside the web root (ATTACHMENT_DIR, default
 * ./storage/attachments) under a random storage key. The only way to read one
 * back is `/api/attachments/[id]/download`, which re-checks that the caller can
 * see the parent task. No attachment is ever served from a public path, and the
 * storage key is never sent to the browser.
 */
import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/server/db";
import { env } from "@/server/env";
import type { SessionUser } from "@/server/auth";
import { AppError, forbidden, notFound, validation } from "@/server/errors";
import { canManageTask, canViewTask, isAssignee, isOwner } from "@/server/permissions";
import { recordActivity } from "@/server/services/activity";
import { loadTaskScope, requireViewableTask } from "@/server/services/tasks";

/** Only these types may be uploaded — anything else is rejected outright. */
export const ALLOWED_UPLOAD_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "text/plain": "txt",
  "text/csv": "csv",
  "text/markdown": "md",
  "application/json": "json",
  "application/zip": "zip",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};

export const ALLOWED_UPLOAD_EXTENSIONS = Array.from(new Set(Object.values(ALLOWED_UPLOAD_TYPES)));

function storageRoot(): string {
  return path.resolve(process.cwd(), env.attachmentDir);
}

/** Strip any path information a client may have put in the filename. */
export function safeFilename(name: string): string {
  const base = path.basename(name).replace(/[^\w.\-() ]+/g, "_").trim();
  return base.length > 0 ? base.slice(0, 160) : "attachment";
}

function resolveStoragePath(storageKey: string): string {
  const root = storageRoot();
  const resolved = path.resolve(root, storageKey);
  // Defence in depth: a key must never escape the storage directory.
  if (!resolved.startsWith(root + path.sep)) {
    throw new AppError("FORBIDDEN", "Invalid storage key.");
  }
  return resolved;
}

export async function uploadAttachment(
  actor: SessionUser,
  taskId: string,
  file: { name: string; type: string; size: number; bytes: Buffer },
) {
  const scope = await requireViewableTask(actor, taskId);
  if (!isAssignee(actor, scope) && !canManageTask(actor, scope)) {
    throw forbidden("Only an assignee or a team lead can attach files to this task.");
  }

  const extension = ALLOWED_UPLOAD_TYPES[file.type];
  if (!extension) {
    throw new AppError(
      "UNSUPPORTED_MEDIA_TYPE",
      `That file type is not allowed. Accepted types: ${ALLOWED_UPLOAD_EXTENSIONS.join(", ")}.`,
    );
  }
  if (file.size <= 0) throw validation("That file is empty.");
  if (file.size > env.maxUploadBytes) {
    throw new AppError(
      "PAYLOAD_TOO_LARGE",
      `Files must be ${Math.round(env.maxUploadBytes / (1024 * 1024))} MB or smaller.`,
    );
  }
  // The declared size and the actual payload must agree.
  if (file.bytes.byteLength !== file.size) throw validation("The upload was truncated. Try again.");

  const id = randomUUID();
  const shard = id.slice(0, 2);
  const storageKey = path.join(shard, `${id}.${extension}`);
  const target = resolveStoragePath(storageKey);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, file.bytes, { flag: "wx" });

  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, select: { code: true, teamId: true } });

  const attachment = await prisma.$transaction(async (tx) => {
    const created = await tx.attachment.create({
      data: {
        taskId,
        uploaderId: actor.id,
        kind: "FILE",
        filename: safeFilename(file.name),
        mimeType: file.type,
        sizeBytes: file.size,
        storageKey: storageKey.split(path.sep).join("/"),
      },
    });
    await recordActivity(
      {
        action: "ATTACHMENT_ADDED",
        summary: `${actor.name} attached ${created.filename} to ${task.code}`,
        taskId,
        teamId: task.teamId,
        actorId: actor.id,
        meta: { attachmentId: created.id, checksum: createHash("sha256").update(file.bytes).digest("hex").slice(0, 16) },
      },
      tx,
    );
    return created;
  });

  return publicShape(attachment);
}

export async function addLinkAttachment(
  actor: SessionUser,
  taskId: string,
  input: { url: string; label: string | null },
) {
  const scope = await requireViewableTask(actor, taskId);
  if (!isAssignee(actor, scope) && !canManageTask(actor, scope)) {
    throw forbidden("Only an assignee or a team lead can add links to this task.");
  }
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, select: { code: true, teamId: true } });

  const attachment = await prisma.$transaction(async (tx) => {
    const created = await tx.attachment.create({
      data: {
        taskId,
        uploaderId: actor.id,
        kind: "LINK",
        filename: input.label ?? input.url,
        label: input.label,
        url: input.url,
      },
    });
    await recordActivity(
      {
        action: "ATTACHMENT_ADDED",
        summary: `${actor.name} added a deliverable link to ${task.code}`,
        taskId,
        teamId: task.teamId,
        actorId: actor.id,
      },
      tx,
    );
    return created;
  });

  return publicShape(attachment);
}

/** Read a file back after re-checking the caller may see its task. */
export async function readAttachment(actor: SessionUser, attachmentId: string) {
  const attachment = await prisma.attachment.findUnique({ where: { id: attachmentId } });
  if (!attachment) throw notFound("That attachment does not exist.");
  if (attachment.kind !== "FILE" || !attachment.storageKey) throw notFound("That attachment is a link, not a file.");

  const scope = await loadTaskScope(attachment.taskId);
  if (!canViewTask(actor, scope)) throw forbidden("You do not have access to that file.");

  let bytes: Buffer;
  try {
    bytes = await readFile(resolveStoragePath(attachment.storageKey));
  } catch {
    throw notFound("That file is no longer in storage.");
  }

  return {
    bytes,
    filename: attachment.filename,
    mimeType: attachment.mimeType ?? "application/octet-stream",
  };
}

export async function deleteAttachment(actor: SessionUser, attachmentId: string) {
  const attachment = await prisma.attachment.findUnique({ where: { id: attachmentId } });
  if (!attachment) throw notFound("That attachment does not exist.");
  const scope = await loadTaskScope(attachment.taskId);
  const allowed = attachment.uploaderId === actor.id || isOwner(actor) || canManageTask(actor, scope);
  if (!allowed) throw forbidden("You cannot remove that attachment.");

  await prisma.attachment.delete({ where: { id: attachmentId } });
  if (attachment.storageKey) {
    await unlink(resolveStoragePath(attachment.storageKey)).catch(() => {
      // The database row is the source of truth; a missing file is not an error.
    });
  }
}

export async function listAttachments(actor: SessionUser, taskId: string) {
  await requireViewableTask(actor, taskId);
  const rows = await prisma.attachment.findMany({
    where: { taskId },
    include: { uploader: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(publicShape);
}

/** Shape sent to the browser — the storage key never leaves the server. */
function publicShape<T extends { id: string; storageKey?: string | null }>(attachment: T) {
  const { storageKey: _storageKey, ...rest } = attachment;
  return { ...rest, downloadUrl: `/api/attachments/${attachment.id}/download` };
}
