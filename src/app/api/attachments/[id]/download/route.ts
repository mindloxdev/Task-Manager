/**
 * GET /api/attachments/[id]/download — the only route that reads a stored file.
 *
 * Authorisation is re-checked here: the caller must be able to see the task the
 * attachment belongs to. Files are served as downloads with a restrictive
 * Content-Security-Policy so an uploaded SVG or HTML-ish payload cannot execute
 * in the app's origin.
 */
import { NextResponse } from "next/server";

import { requireUser } from "@/server/auth";
import { AppError } from "@/server/errors";
import { fail } from "@/server/respond";
import { readAttachment } from "@/server/services/attachments";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const file = await readAttachment(user, id);

    return new NextResponse(new Uint8Array(file.bytes), {
      status: 200,
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(file.bytes.byteLength),
        "Content-Disposition": `attachment; filename="${file.filename.replace(/"/g, "")}"`,
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const failure = fail(error);
    const status = error instanceof AppError ? error.status : 500;
    return NextResponse.json(failure, { status });
  }
}
