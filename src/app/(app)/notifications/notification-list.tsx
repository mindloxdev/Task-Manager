"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellOff, Check, Eye, EyeOff } from "lucide-react";

import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
  markNotificationUnreadAction,
} from "@/app/actions/org";
import { Button } from "@/components/ui/button";
import { Avatar, Card, CardHeader, EmptyState } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { formatRelative } from "@/lib/dates";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
  actorName: string | null;
  actorColor: string | null;
  taskCode: string | null;
};

export function NotificationList({
  notifications,
  unreadCount,
  unreadOnly,
}: {
  notifications: Row[];
  unreadCount: number;
  unreadOnly: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const toggleRead = (row: Row) => {
    startTransition(async () => {
      const result = row.readAt
        ? await markNotificationUnreadAction(row.id)
        : await markNotificationReadAction(row.id);
      if (result.ok) router.refresh();
      else toast({ tone: "error", title: "Could not update that notification", description: result.error });
    });
  };

  return (
    <Card>
      <CardHeader
        title={unreadOnly ? "Unread notifications" : "All notifications"}
        description={`${notifications.length} shown${unreadCount > 0 ? ` · ${unreadCount} unread` : ""}`}
        action={
          <div className="flex items-center gap-2">
            <Link
              href={unreadOnly ? "/notifications" : "/notifications?unread=true"}
              className="text-xs font-semibold text-primary hover:underline"
            >
              {unreadOnly ? "Show all" : "Unread only"}
            </Link>
            {unreadCount > 0 ? (
              <Button
                size="sm"
                variant="secondary"
                loading={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await markAllNotificationsReadAction();
                    if (result.ok) {
                      toast({ tone: "success", title: `Marked ${result.data.count} as read` });
                      router.refresh();
                    } else {
                      toast({ tone: "error", title: result.error });
                    }
                  })
                }
              >
                <Check className="size-3.5" aria-hidden="true" />
                Mark all read
              </Button>
            ) : null}
          </div>
        }
      />

      {notifications.length === 0 ? (
        <EmptyState
          icon={<BellOff className="size-5" aria-hidden="true" />}
          title={unreadOnly ? "Nothing unread" : "No notifications yet"}
          description={undefined}
        />
      ) : (
        <ul className="divide-y divide-border">
          {notifications.map((row) => (
            <li
              key={row.id}
              className={cn("flex items-start gap-3 p-3 transition-colors", !row.readAt && "bg-primary-soft/30")}
            >
              {row.actorName ? (
                <Avatar name={row.actorName} color={row.actorColor} size="md" />
              ) : (
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-subtle">
                  <BellOff className="size-3.5" aria-hidden="true" />
                </span>
              )}

              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5">
                  {row.href ? (
                    <Link
                      href={row.href}
                      onClick={() => {
                        if (!row.readAt) void markNotificationReadAction(row.id);
                      }}
                      className={cn(
                        "text-sm hover:text-primary hover:underline",
                        row.readAt ? "font-medium text-fg-muted" : "font-semibold text-fg",
                      )}
                    >
                      {row.title}
                    </Link>
                  ) : (
                    <span className={cn("text-sm", row.readAt ? "text-fg-muted" : "font-semibold text-fg")}>
                      {row.title}
                    </span>
                  )}
                  {!row.readAt ? <span className="size-1.5 rounded-full bg-accent" aria-label="Unread" /> : null}
                </p>
                {row.body ? <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{row.body}</p> : null}
                <p className="mt-1 flex items-center gap-1.5 text-[10px] text-fg-subtle">
                  <time dateTime={row.createdAt}>{formatRelative(row.createdAt)}</time>
                  {row.taskCode ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="tnum font-mono">{row.taskCode}</span>
                    </>
                  ) : null}
                  <span aria-hidden="true">·</span>
                  <span>{row.type.replace(/_/g, " ").toLowerCase()}</span>
                </p>
              </div>

              <button
                type="button"
                disabled={pending}
                onClick={() => toggleRead(row)}
                className="rounded-md p-2 text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
                aria-label={row.readAt ? `Mark "${row.title}" as unread` : `Mark "${row.title}" as read`}
              >
                {row.readAt ? <EyeOff className="size-3.5" aria-hidden="true" /> : <Eye className="size-3.5" aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
