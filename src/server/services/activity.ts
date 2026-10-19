/** Activity feed and audit trail writers. */
import type { TxClient } from "@/server/db";
import { prisma } from "@/server/db";
import type { ActivityAction } from "@/lib/enums";

export type ActivityInput = {
  action: ActivityAction;
  summary: string;
  taskId?: string | null;
  teamId?: string | null;
  actorId?: string | null;
  meta?: Record<string, unknown>;
};

export async function recordActivity(input: ActivityInput, db: TxClient = prisma): Promise<void> {
  await db.activityLog.create({
    data: {
      action: input.action,
      summary: input.summary,
      taskId: input.taskId ?? null,
      teamId: input.teamId ?? null,
      actorId: input.actorId ?? null,
      meta: input.meta ? JSON.stringify(input.meta) : null,
    },
  });
}

export type AuditInput = {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
};

/** Audit log for sensitive actions: role changes, deletions, settings, exports. */
export async function recordAudit(input: AuditInput, db: TxClient = prisma): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: input.before === undefined ? null : JSON.stringify(input.before),
      after: input.after === undefined ? null : JSON.stringify(input.after),
      ip: input.ip ?? null,
    },
  });
}

export type ActivityItem = {
  id: string;
  action: string;
  summary: string;
  createdAt: Date;
  actor: { id: string; name: string; avatarColor: string } | null;
  task: { id: string; code: string; title: string } | null;
  team: { id: string; name: string } | null;
};

/**
 * Recent activity, scoped to what the viewer may see.
 *
 * Owners see everything. Everyone else sees activity on tasks they can reach
 * (their own assignments, tasks they created, and their teams' tasks).
 */
export async function listActivity(params: {
  viewer: { id: string; role: string; teamIds: string[] };
  limit?: number;
  teamId?: string | null;
  taskId?: string | null;
  cursor?: string | null;
}): Promise<{ items: ActivityItem[]; nextCursor: string | null }> {
  const limit = Math.min(params.limit ?? 20, 100);
  const isOwner = params.viewer.role === "OWNER";

  const scopeFilter = isOwner
    ? {}
    : {
        OR: [
          { actorId: params.viewer.id },
          { teamId: { in: params.viewer.teamIds } },
          { task: { teamId: { in: params.viewer.teamIds } } },
          { task: { createdById: params.viewer.id } },
          { task: { assignees: { some: { userId: params.viewer.id } } } },
        ],
      };

  const rows = await prisma.activityLog.findMany({
    where: {
      AND: [
        scopeFilter,
        params.teamId ? { OR: [{ teamId: params.teamId }, { task: { teamId: params.teamId } }] } : {},
        params.taskId ? { taskId: params.taskId } : {},
      ],
    },
    include: {
      actor: { select: { id: true, name: true, avatarColor: true } },
      task: { select: { id: true, code: true, title: true } },
      team: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
  });

  const items = rows.slice(0, limit);
  return {
    items: items.map((row) => ({
      id: row.id,
      action: row.action,
      summary: row.summary,
      createdAt: row.createdAt,
      actor: row.actor,
      task: row.task,
      team: row.team,
    })),
    nextCursor: rows.length > limit ? items[items.length - 1].id : null,
  };
}
