import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { TaskLine } from "@/components/task/task-card";
import { ButtonLink } from "@/components/ui/button";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/server/auth";
import { isOwner } from "@/server/permissions";
import { getCalendarTasks } from "@/server/services/dashboard";
import type { TaskListItem } from "@/server/services/tasks";
import { DAY_MS, formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Calendar" };

type View = "month" | "week" | "day";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; mine?: string }>;
}) {
  const params = await searchParams;
  const user = await requireUser();

  const view: View = params.view === "week" ? "week" : params.view === "day" ? "day" : "month";
  const anchor = parseAnchor(params.date);
  const mineOnly = params.mine === "true";

  const { from, to } = rangeFor(view, anchor);
  const all = await getCalendarTasks(user, from, to);
  const tasks = mineOnly ? all.filter((task) => task.assignees.some((a) => a.userId === user.id)) : all;

  const byDay = new Map<string, TaskListItem[]>();
  for (const task of tasks) {
    if (!task.dueAt) continue;
    const key = isoDay(task.dueAt);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(task);
    else byDay.set(key, [task]);
  }

  const shift = (direction: -1 | 1) => {
    const next = new Date(anchor);
    if (view === "month") next.setUTCMonth(next.getUTCMonth() + direction);
    else if (view === "week") next.setUTCDate(next.getUTCDate() + 7 * direction);
    else next.setUTCDate(next.getUTCDate() + direction);
    return isoDay(next);
  };

  const label =
    view === "month"
      ? new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(anchor)
      : view === "week"
        ? `Week of ${formatDate(from)}`
        : formatDate(anchor);

  const href = (changes: { view?: View; date?: string; mine?: string | null }) => {
    const next = new URLSearchParams();
    next.set("view", changes.view ?? view);
    next.set("date", changes.date ?? isoDay(anchor));
    const mine = changes.mine === undefined ? (mineOnly ? "true" : null) : changes.mine;
    if (mine) next.set("mine", mine);
    return `/calendar?${next.toString()}`;
  };

  return (
    <div className="mx-auto max-w-[100rem]">
      <PageHeader
        title="Calendar"
        description={undefined}
        actions={
          <>
            <Link
              href={href({ mine: mineOnly ? null : "true" })}
              className={cn(
                "inline-flex h-10 items-center rounded-md border px-3.5 text-sm font-semibold transition-colors",
                mineOnly
                  ? "border-primary bg-primary text-primary-fg"
                  : "border-border bg-surface text-fg-muted hover:bg-surface-2",
              )}
            >
              Only mine
            </Link>
            {isOwner(user) || user.ledTeamIds.length > 0 ? (
              <ButtonLink href="/tasks/new" variant="primary">
                New task
              </ButtonLink>
            ) : null}
          </>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-3">
          <div className="flex items-center gap-1.5">
            <Link
              href={href({ date: shift(-1) })}
              className="rounded-md border border-border p-2 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
              aria-label={`Previous ${view}`}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Link>
            <Link
              href={href({ date: isoDay(new Date()) })}
              className="inline-flex h-9 items-center rounded-md border border-border px-3 text-xs font-semibold text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              Today
            </Link>
            <Link
              href={href({ date: shift(1) })}
              className="rounded-md border border-border p-2 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
              aria-label={`Next ${view}`}
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
            <h2 className="ml-2 text-sm font-bold text-fg">{label}</h2>
          </div>

          <div className="flex items-center gap-1 rounded-md border border-border p-0.5" role="tablist" aria-label="Calendar view">
            {(["day", "week", "month"] as View[]).map((option) => (
              <Link
                key={option}
                href={href({ view: option })}
                role="tab"
                aria-selected={view === option}
                className={cn(
                  "rounded px-2.5 py-1.5 text-xs font-semibold capitalize transition-colors",
                  view === option ? "bg-primary-soft text-primary-soft-fg" : "text-fg-subtle hover:text-fg",
                )}
              >
                {option}
              </Link>
            ))}
          </div>
        </div>

        {view === "month" ? (
          <MonthGrid anchor={anchor} byDay={byDay} />
        ) : (
          <DayList from={from} to={to} byDay={byDay} userTimezone={user.timezone} />
        )}
      </Card>

      <p className="mt-3 text-xs text-fg-subtle">
        {tasks.length} {tasks.length === 1 ? "deadline" : "deadlines"} in this {view}
        {mineOnly ? ", assigned to you" : ""} · shown in UTC
      </p>
    </div>
  );
}

function MonthGrid({ anchor, byDay }: { anchor: Date; byDay: Map<string, TaskListItem[]> }) {
  const firstOfMonth = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
  // Monday-first grid.
  const offset = (firstOfMonth.getUTCDay() + 6) % 7;
  const gridStart = new Date(firstOfMonth.getTime() - offset * DAY_MS);
  const todayKey = isoDay(new Date());
  const monthIndex = anchor.getUTCMonth();

  return (
    <div className="scroll-x">
      <div className="min-w-[48rem]">
        <div className="grid grid-cols-7 border-b border-border">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
            <div key={day} className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-fg-subtle">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: 42 }).map((_, index) => {
            const day = new Date(gridStart.getTime() + index * DAY_MS);
            const key = isoDay(day);
            const items = byDay.get(key) ?? [];
            const inMonth = day.getUTCMonth() === monthIndex;
            const isToday = key === todayKey;
            return (
              <div
                key={key}
                className={cn(
                  "min-h-24 border-b border-r border-border p-1.5 last:border-r-0",
                  !inMonth && "bg-surface-2/50",
                  isToday && "bg-primary-soft/40",
                )}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className={cn(
                      "tnum text-[11px] font-semibold",
                      isToday ? "text-primary" : inMonth ? "text-fg-muted" : "text-fg-subtle",
                    )}
                  >
                    {day.getUTCDate()}
                  </span>
                  {items.length > 0 ? (
                    <span className="tnum text-[10px] font-semibold text-fg-subtle">{items.length}</span>
                  ) : null}
                </div>
                <ul className="space-y-0.5">
                  {items.slice(0, 3).map((task) => (
                    <li key={task.id}>
                      <Link
                        href={`/tasks/${task.id}`}
                        className={cn(
                          "block truncate rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors hover:brightness-95",
                          task.health === "OVERDUE"
                            ? "bg-overdue-bg text-overdue"
                            : task.health === "AT_RISK"
                              ? "bg-risk-bg text-risk"
                              : task.status === "COMPLETED"
                                ? "bg-track-bg text-track"
                                : "bg-surface-2 text-fg-muted",
                        )}
                        title={`${task.code} — ${task.title}`}
                      >
                        {task.title}
                      </Link>
                    </li>
                  ))}
                  {items.length > 3 ? (
                    <li className="px-1.5 text-[10px] text-fg-subtle">+{items.length - 3} more</li>
                  ) : null}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DayList({
  from,
  to,
  byDay,
  userTimezone,
}: {
  from: Date;
  to: Date;
  byDay: Map<string, TaskListItem[]>;
  userTimezone: string;
}) {
  const days: Date[] = [];
  for (let time = from.getTime(); time <= to.getTime(); time += DAY_MS) days.push(new Date(time));
  const todayKey = isoDay(new Date());
  const total = Array.from(byDay.values()).reduce((sum, items) => sum + items.length, 0);

  if (total === 0) {
    return (
      <EmptyState
        icon={<CalendarDays className="size-5" aria-hidden="true" />}
        title="No deadlines in this period"
        description={undefined}
      />
    );
  }

  return (
    <div className="divide-y divide-border">
      {days.map((day) => {
        const key = isoDay(day);
        const items = byDay.get(key) ?? [];
        if (items.length === 0) return null;
        return (
          <div key={key} className={cn("p-3", key === todayKey && "bg-primary-soft/30")}>
            <div className="pb-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
                {formatDate(day, userTimezone)}
                {key === todayKey ? <span className="chip bg-primary-soft text-primary-soft-fg">Today</span> : null}
              </h3>
              <p className="mt-0.5 text-xs text-fg-muted">
                {items.length} {items.length === 1 ? "deadline" : "deadlines"}
              </p>
            </div>
            <div className="space-y-0.5">
              {items.map((task) => (
                <TaskLine key={task.id} task={task} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseAnchor(value: string | undefined): Date {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const today = new Date();
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
}

function rangeFor(view: View, anchor: Date): { from: Date; to: Date } {
  if (view === "day") {
    return { from: anchor, to: new Date(anchor.getTime() + DAY_MS - 1) };
  }
  if (view === "week") {
    const offset = (anchor.getUTCDay() + 6) % 7;
    const start = new Date(anchor.getTime() - offset * DAY_MS);
    return { from: start, to: new Date(start.getTime() + 7 * DAY_MS - 1) };
  }
  const first = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const gridStart = new Date(first.getTime() - offset * DAY_MS);
  return { from: gridStart, to: new Date(gridStart.getTime() + 42 * DAY_MS - 1) };
}
