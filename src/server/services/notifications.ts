/**
 * In-app notifications.
 *
 * Rules enforced here:
 *  - A user never receives a notification they switched off in preferences.
 *  - Nobody is notified about their own action.
 *  - Reminders carry a `dedupeKey`, so re-running the reminder sweep (or a cron
 *    firing twice) cannot notify the same person about the same window twice.
 *  - Email is attempted only when a provider is configured; when it is not, the
 *    notification is still delivered in-app and no claim is made about mail.
 */
import type { TxClient } from "@/server/db";
import { prisma } from "@/server/db";
import { NOTIFICATION_PREFERENCE_KEY, type NotificationType } from "@/lib/enums";
import { isEmailConfigured, sendEmail } from "@/server/email";
import { env } from "@/server/env";

export type NotifyInput = {
  userIds: string[];
  type: NotificationType;
  title: string;
  body?: string | null;
  taskId?: string | null;
  actorId?: string | null;
  href?: string | null;
  /** Unique suffix; combined with user id to make the dedupe key. */
  dedupe?: string | null;
  /** Also attempt email for recipients who enabled it. */
  email?: { subject: string; text: string } | null;
};

export type NotifyResult = {
  created: number;
  skippedByPreference: number;
  skippedDuplicate: number;
  emailsSent: number;
  emailsSkipped: number;
};

export async function notify(input: NotifyInput, db: TxClient = prisma): Promise<NotifyResult> {
  const result: NotifyResult = {
    created: 0,
    skippedByPreference: 0,
    skippedDuplicate: 0,
    emailsSent: 0,
    emailsSkipped: 0,
  };

  const recipientIds = Array.from(new Set(input.userIds)).filter((id) => id && id !== input.actorId);
  if (recipientIds.length === 0) return result;

  const recipients = await db.user.findMany({
    where: { id: { in: recipientIds }, status: "ACTIVE" },
    select: { id: true, email: true, name: true, preferences: true },
  });

  const prefKey = NOTIFICATION_PREFERENCE_KEY[input.type];

  for (const recipient of recipients) {
    const prefs = recipient.preferences;
    if (prefs && !prefs.inAppEnabled) {
      result.skippedByPreference += 1;
      continue;
    }
    if (prefs && prefKey && prefs[prefKey] === false) {
      result.skippedByPreference += 1;
      continue;
    }

    const dedupeKey = input.dedupe ? `${recipient.id}:${input.dedupe}` : null;
    if (dedupeKey) {
      const existing = await db.notification.findUnique({ where: { dedupeKey } });
      if (existing) {
        result.skippedDuplicate += 1;
        continue;
      }
    }

    try {
      await db.notification.create({
        data: {
          userId: recipient.id,
          type: input.type,
          title: input.title,
          body: input.body ?? null,
          taskId: input.taskId ?? null,
          actorId: input.actorId ?? null,
          href: input.href ?? null,
          dedupeKey,
        },
      });
      result.created += 1;
    } catch {
      // A unique-constraint race on dedupeKey means someone else just created
      // the same reminder — that is the desired outcome, so treat it as a skip.
      result.skippedDuplicate += 1;
      continue;
    }

    if (input.email && prefs?.emailEnabled) {
      if (!isEmailConfigured()) {
        result.emailsSkipped += 1;
      } else {
        const sent = await sendEmail({
          to: recipient.email,
          subject: input.email.subject,
          text: `${input.email.text}\n\n${env.appUrl}${input.href ?? "/dashboard"}`,
        });
        if (sent.sent) result.emailsSent += 1;
        else result.emailsSkipped += 1;
      }
    }
  }

  return result;
}

export async function countUnread(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function listNotifications(params: {
  userId: string;
  unreadOnly?: boolean;
  limit?: number;
  cursor?: string | null;
}) {
  const limit = Math.min(params.limit ?? 25, 100);
  const rows = await prisma.notification.findMany({
    where: { userId: params.userId, ...(params.unreadOnly ? { readAt: null } : {}) },
    include: {
      actor: { select: { id: true, name: true, avatarColor: true } },
      task: { select: { id: true, code: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
  });
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? items[items.length - 1].id : null };
}

/** Mark one notification read. Scoped by user id so ids cannot be guessed. */
export async function markRead(userId: string, notificationId: string): Promise<boolean> {
  const updated = await prisma.notification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data: { readAt: new Date() },
  });
  return updated.count > 0;
}

export async function markUnread(userId: string, notificationId: string): Promise<boolean> {
  const updated = await prisma.notification.updateMany({
    where: { id: notificationId, userId, readAt: { not: null } },
    data: { readAt: null },
  });
  return updated.count > 0;
}

export async function markAllRead(userId: string): Promise<number> {
  const updated = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return updated.count;
}

export async function getPreferences(userId: string) {
  const existing = await prisma.notificationPreference.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.notificationPreference.create({ data: { userId } });
}

export async function updatePreferences(
  userId: string,
  data: Partial<{
    inAppEnabled: boolean;
    emailEnabled: boolean;
    notifyAssignment: boolean;
    notifyProgress: boolean;
    notifyBlocker: boolean;
    notifyReview: boolean;
    notifyDeadline: boolean;
    notifyComments: boolean;
    reminderOffsets: string;
  }>,
) {
  await getPreferences(userId);
  return prisma.notificationPreference.update({ where: { userId }, data });
}
