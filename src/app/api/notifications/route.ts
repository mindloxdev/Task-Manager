/**
 * GET /api/notifications — the signed-in user's notifications.
 *
 * Used by the header bell to refresh its badge without a full page reload.
 * Scoped to the caller: ids from the query string are never trusted.
 */
import type { NextRequest } from "next/server";

import { requireUser } from "@/server/auth";
import { jsonHandler } from "@/server/respond";
import { countUnread, listNotifications } from "@/server/services/notifications";

export async function GET(request: NextRequest) {
  return jsonHandler(async () => {
    const user = await requireUser();
    const params = request.nextUrl.searchParams;
    const limit = Math.min(Number.parseInt(params.get("limit") ?? "12", 10) || 12, 50);
    const unreadOnly = params.get("unreadOnly") === "true";

    const [{ items, nextCursor }, unread] = await Promise.all([
      listNotifications({ userId: user.id, limit, unreadOnly, cursor: params.get("cursor") }),
      countUnread(user.id),
    ]);

    return {
      unread,
      nextCursor,
      items: items.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        body: item.body,
        href: item.href,
        readAt: item.readAt,
        createdAt: item.createdAt,
        actor: item.actor ? { name: item.actor.name, avatarColor: item.actor.avatarColor } : null,
        task: item.task ? { id: item.task.id, code: item.task.code, title: item.task.title } : null,
      })),
    };
  });
}
