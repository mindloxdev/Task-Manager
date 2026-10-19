import type { Metadata } from "next";

import { NotificationList } from "@/app/(app)/notifications/notification-list";
import { ActivityFeed } from "@/components/activity-feed";
import { Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/server/auth";
import { listActivity } from "@/server/services/activity";
import { countUnread, listNotifications } from "@/server/services/notifications";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ unread?: string }>;
}) {
  const { unread: unreadParam } = await searchParams;
  const user = await requireUser();
  const unreadOnly = unreadParam === "true";

  const [{ items }, unread, activity] = await Promise.all([
    listNotifications({ userId: user.id, limit: 50, unreadOnly }),
    countUnread(user.id),
    listActivity({
      viewer: { id: user.id, role: user.role, teamIds: user.teams.map((t) => t.teamId) },
      limit: 30,
    }),
  ]);

  return (
    <div className="mx-auto max-w-[80rem]">
      <PageHeader
        title="Notifications"
        description={undefined}
        meta={
          <p className="text-xs text-fg-subtle">{unread === 0 ? "All read" : `${unread} unread`}</p>
        }
      />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <NotificationList
          notifications={items.map((item) => ({
            id: item.id,
            type: item.type,
            title: item.title,
            body: item.body,
            href: item.href,
            readAt: item.readAt ? item.readAt.toISOString() : null,
            createdAt: item.createdAt.toISOString(),
            actorName: item.actor?.name ?? null,
            actorColor: item.actor?.avatarColor ?? null,
            taskCode: item.task?.code ?? null,
          }))}
          unreadCount={unread}
          unreadOnly={unreadOnly}
        />

        <Card as="aside">
          <CardHeader
            title="Activity you can see"
            description={undefined}
          />
          <div className="p-3">
            <ActivityFeed items={activity.items} />
          </div>
        </Card>
      </div>
    </div>
  );
}
