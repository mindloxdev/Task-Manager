"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, BellOff, Check } from "lucide-react";

import { markAllNotificationsReadAction, markNotificationReadAction } from "@/app/actions/org";
import { useToast } from "@/components/ui/toast";
import { Avatar } from "@/components/ui/primitives";
import { formatRelative } from "@/lib/dates";
import { cn } from "@/lib/utils";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
  actor: { name: string; avatarColor: string } | null;
  task: { id: string; code: string; title: string } | null;
};

const POLL_INTERVAL_MS = 60_000;

export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const response = await fetch("/api/notifications?limit=10", {
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Could not load notifications");
      const payload = (await response.json()) as { ok: boolean; data?: { unread: number; items: NotificationItem[] } };
      if (payload.ok && payload.data) {
        setUnread(payload.data.unread);
        setItems(payload.data.items);
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        toast({ tone: "error", title: "Could not load notifications", description: "Check your connection and try again." });
      }
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Keep the badge honest without a full page reload.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    setUnread(initialUnread);
  }, [initialUnread]);

  useEffect(() => {
    if (open && items === null) void load();
  }, [open, items, load]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const onOpenItem = async (item: NotificationItem) => {
    setOpen(false);
    if (!item.readAt) {
      setUnread((current) => Math.max(0, current - 1));
      setItems((current) =>
        current ? current.map((row) => (row.id === item.id ? { ...row, readAt: new Date().toISOString() } : row)) : current,
      );
      await markNotificationReadAction(item.id);
    }
    if (item.href) router.push(item.href);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="relative rounded-md p-2 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
        aria-label={unread > 0 ? `Notifications: ${unread} unread` : "Notifications: none unread"}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell className="size-4" aria-hidden="true" />
        {unread > 0 ? (
          <span
            className="tnum absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-accent px-1 text-[9px] font-bold leading-4 text-accent-fg"
            aria-hidden="true"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-label="Notifications"
            className="rise absolute right-0 z-40 mt-1 flex max-h-[70vh] w-[22rem] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl"
          >
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
              <p className="text-xs font-semibold text-fg">
                Notifications{unread > 0 ? <span className="ml-1 text-fg-subtle">({unread} unread)</span> : null}
              </p>
              {unread > 0 ? (
                <button
                  type="button"
                  onClick={async () => {
                    const result = await markAllNotificationsReadAction();
                    if (result.ok) {
                      setUnread(0);
                      setItems((current) =>
                        current
                          ? current.map((row) => ({ ...row, readAt: row.readAt ?? new Date().toISOString() }))
                          : current,
                      );
                      toast({ tone: "success", title: `Marked ${result.data.count} as read` });
                    } else {
                      toast({ tone: "error", title: result.error });
                    }
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                >
                  <Check className="size-3" aria-hidden="true" />
                  Mark all read
                </button>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {loading && items === null ? (
                <div className="space-y-2 p-3">
                  {[0, 1, 2].map((index) => (
                    <div key={index} className="skeleton h-12" />
                  ))}
                </div>
              ) : items && items.length > 0 ? (
                <ul className="divide-y divide-border">
                  {items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => void onOpenItem(item)}
                        className={cn(
                          "flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-surface-2",
                          !item.readAt && "bg-primary-soft/40",
                        )}
                      >
                        {item.actor ? (
                          <Avatar name={item.actor.name} color={item.actor.avatarColor} size="sm" />
                        ) : (
                          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-3 text-fg-subtle">
                            <Bell className="size-3" aria-hidden="true" />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start gap-1.5">
                            <span className={cn("block flex-1 text-xs", !item.readAt ? "font-semibold text-fg" : "text-fg-muted")}>
                              {item.title}
                            </span>
                            {!item.readAt ? (
                              <span className="mt-1 size-1.5 shrink-0 rounded-full bg-accent" aria-label="Unread" />
                            ) : null}
                          </span>
                          {item.body ? (
                            <span className="mt-0.5 line-clamp-2 block text-[11px] text-fg-subtle">{item.body}</span>
                          ) : null}
                          <span className="mt-1 block text-[10px] text-fg-subtle">{formatRelative(item.createdAt)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                  <BellOff className="size-5 text-fg-subtle" aria-hidden="true" />
                  <p className="text-xs font-semibold text-fg">Nothing new</p>
                  <p className="text-[11px] text-fg-subtle">Assignments, reviews and blockers will appear here.</p>
                </div>
              )}
            </div>

            <div className="border-t border-border px-3 py-2">
              <Link
                href="/notifications"
                onClick={() => setOpen(false)}
                className="text-[11px] font-semibold text-primary hover:underline"
              >
                See all notifications
              </Link>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
