/**
 * GET /api/tasks — paginated, server-filtered task list.
 *
 * Accepts the same query parameters as the Tasks page, so the UI and any
 * integration read identical data through identical authorisation.
 */
import type { NextRequest } from "next/server";

import { requireUser } from "@/server/auth";
import { jsonHandler } from "@/server/respond";
import { listTasks } from "@/server/services/tasks";
import { taskFilterSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  return jsonHandler(async () => {
    const user = await requireUser();
    const params = request.nextUrl.searchParams;
    const filter = taskFilterSchema.parse({
      q: params.get("q"),
      status: params.get("status"),
      priority: params.get("priority"),
      teamId: params.get("teamId"),
      projectId: params.get("projectId"),
      assigneeId: params.get("assigneeId"),
      health: params.get("health"),
      scope: params.get("scope") ?? undefined,
      dueFrom: params.get("dueFrom"),
      dueTo: params.get("dueTo"),
      includeArchived: params.get("includeArchived") ?? undefined,
      sort: params.get("sort") ?? undefined,
      dir: params.get("dir") ?? undefined,
      page: params.get("page") ?? undefined,
      pageSize: params.get("pageSize") ?? undefined,
    });
    return listTasks(user, filter);
  });
}
