/**
 * POST /api/tasks/[id]/attachments — multipart file upload.
 *
 * Size and type are checked server-side before anything is written, and the
 * caller must be an assignee or a team lead on the task.
 */
import type { NextRequest } from "next/server";

import { requireUser } from "@/server/auth";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";
import { enforce } from "@/server/rate-limit";
import { jsonHandler } from "@/server/respond";
import { uploadAttachment } from "@/server/services/attachments";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return jsonHandler(async () => {
    const user = await requireUser();
    const { id } = await context.params;
    enforce(`upload:${user.id}`, 30, 10 * 60 * 1000);

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      throw new AppError("UNSUPPORTED_MEDIA_TYPE", "Send the file as multipart/form-data.");
    }

    // Reject oversized bodies before buffering them, when the length is known.
    const declaredLength = Number.parseInt(request.headers.get("content-length") ?? "0", 10);
    if (Number.isFinite(declaredLength) && declaredLength > env.maxUploadBytes + 8192) {
      throw new AppError(
        "PAYLOAD_TOO_LARGE",
        `Files must be ${Math.round(env.maxUploadBytes / (1024 * 1024))} MB or smaller.`,
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("VALIDATION", "Choose a file to upload.");

    const bytes = Buffer.from(await file.arrayBuffer());
    return uploadAttachment(user, id, {
      name: file.name,
      type: file.type,
      size: bytes.byteLength,
      bytes,
    });
  });
}
