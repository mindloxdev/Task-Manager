import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  CheckCheck,
  Eye,
  Hand,
  OctagonAlert,
  Radio,
  RotateCcw,
} from "lucide-react";

import { TaskCard } from "@/components/task/task-card";
import { ProgressTimeline } from "@/app/(app)/tasks/[id]/progress-timeline";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader, EmptyState, PageHeader, StatCard } from "@/components/ui/primitives";
import { requireUser } from "@/server/auth";
import { getMyWorkspace } from "@/server/services/dashboard";

export const metadata: Metadata = { title: "My tasks" };

export default async function MyTasksPage() {
  const user = await requireUser();
  const data = await getMyWorkspace(user);
  const { summary } = data;

  return (
    <div className="mx-auto max-w-[100rem]">
      <PageHeader
        title="My tasks"
        actions={
          <ButtonLink href="/calendar" variant="secondary">
            My calendar
          </ButtonLink>
        }
      />

      <div className="enter grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Active" value={summary.active} hint="Assigned to you and still open" />
        <StatCard
          label="To acknowledge"
          value={summary.needsAcknowledgement}
          hint="Confirm you have seen them"
          tone={summary.needsAcknowledgement > 0 ? "primary" : "default"}
        />
        <StatCard
          label="Due today"
          value={summary.dueToday}
          hint={`${summary.dueThisWeek} due this week`}
          tone={summary.dueToday > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Overdue"
          value={summary.overdue}
          hint="Past the deadline"
          tone={summary.overdue > 0 ? "danger" : "default"}
        />
        <StatCard
          label="Blocked"
          value={summary.blocked}
          hint="You reported a blocker"
          tone={summary.blocked > 0 ? "danger" : "default"}
        />
        <StatCard
          label="Completed"
          value={summary.completed}
          hint={summary.completed > 0 ? `${summary.onTimeRate}% on time` : "Nothing finished yet"}
          tone="success"
        />
      </div>

      {/* ---------------------------------------------------------------- */}
      {data.updateRequests.length > 0 ? (
        <Card className="mt-5 border-risk/50">
          <CardHeader
            title="Updates requested from you"
          />
          <ul className="divide-y divide-border">
            {data.updateRequests.map((request) => (
              <li key={request.id} className="flex flex-wrap items-start justify-between gap-3 p-3">
                <div className="min-w-0">
                  <Link
                    href={`/tasks/${request.task.id}`}
                    className="text-xs font-semibold text-fg hover:text-primary hover:underline"
                  >
                    <span className="tnum font-mono">{request.task.code}</span> — {request.task.title}
                  </Link>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-fg-muted">
                    <Radio className="size-3 text-risk" aria-hidden="true" />
                    {request.requestedBy.name}
                    {request.message ? `: “${request.message}”` : " asked for an update"}
                  </p>
                </div>
                <ButtonLink href={`/tasks/${request.task.id}#progress`} size="sm" variant="primary">
                  Reply
                </ButtonLink>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      <div className="mt-5 space-y-5">
        <Group
          title="Acknowledge these"
          description="Confirm you have seen them."
          icon={<Hand className="size-5" aria-hidden="true" />}
          tasks={data.needsAcknowledgement}
          userId={user.id}
          emptyTitle="Nothing to acknowledge"
          emptyDescription={undefined}
        />

        <Group
          title="Returned for changes"
          description="Feedback is on the task."
          icon={<RotateCcw className="size-5" aria-hidden="true" />}
          tasks={data.changesRequested}
          userId={user.id}
          hideWhenEmpty
        />

        <Group
          title="Overdue"
          description="Past the deadline — ask for an extension if the date is no longer realistic."
          icon={<AlertTriangle className="size-5" aria-hidden="true" />}
          tasks={data.overdue}
          userId={user.id}
          hideWhenEmpty
        />

        <Group
          title="Due today"
          icon={<CalendarDays className="size-5" aria-hidden="true" />}
          tasks={data.dueToday}
          userId={user.id}
          hideWhenEmpty
        />

        <Group
          title="Blocked"
          description="Clear the blocker once it is resolved."
          icon={<OctagonAlert className="size-5" aria-hidden="true" />}
          tasks={data.blocked}
          userId={user.id}
          hideWhenEmpty
        />

        <Group
          title="Waiting on review"
          description="With a reviewer."
          icon={<Eye className="size-5" aria-hidden="true" />}
          tasks={data.awaitingReview}
          userId={user.id}
          hideWhenEmpty
        />

        <Group
          title="Upcoming"
          description="Due after today."
          icon={<CalendarDays className="size-5" aria-hidden="true" />}
          tasks={data.upcoming}
          userId={user.id}
          hideWhenEmpty
        />

        <Group
          title="All my open work"
          icon={<CheckCheck className="size-5" aria-hidden="true" />}
          tasks={data.active}
          userId={user.id}
          emptyTitle="You have no open tasks"
          emptyDescription={undefined}
        />
      </div>

      {/* ---------------------------------------------------------------- */}
      {data.teamTasks.length > 0 ? (
        <Card className="mt-5">
          <CardHeader
            title="Your teams' other work"
            description="Not assigned to you — context only."
            action={
              <ButtonLink href="/tasks?scope=MY_TEAMS" size="sm" variant="ghost">
                See all
              </ButtonLink>
            }
          />
          <div className="enter grid gap-2.5 p-3 md:grid-cols-2 2xl:grid-cols-3">
            {data.teamTasks.slice(0, 6).map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>

        </Card>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {data.myUpdates.length > 0 ? (
        <Card className="mt-5">
          <CardHeader title="Your recent reports" />
          <div className="p-4">
            <ProgressTimeline
              updates={data.myUpdates.map((update) => ({
                id: update.id,
                kind: update.kind,
                progress: update.progress,
                workCompleted: update.workCompleted,
                workRemaining: update.workRemaining,
                blockers: update.blockers,
                helpNeeded: update.helpNeeded,
                expectedCompletion: update.expectedCompletion,
                linkUrl: update.linkUrl,
                createdAt: update.createdAt,
                authorName: user.name,
                authorColor: user.avatarColor,
              }))}
            />
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function Group({
  title,
  description,
  icon,
  tasks,
  userId,
  emptyTitle,
  emptyDescription,
  hideWhenEmpty = false,
}: {
  title: string;
  description?: string;
  icon: React.ReactNode;
  tasks: Awaited<ReturnType<typeof getMyWorkspace>>["active"];
  userId: string;
  emptyTitle?: string;
  emptyDescription?: string;
  hideWhenEmpty?: boolean;
}) {
  if (tasks.length === 0 && hideWhenEmpty) return null;
  return (
    <Card>
      <CardHeader title={`${title} (${tasks.length})`} description={description} />
      {tasks.length === 0 ? (
        <EmptyState compact icon={icon} title={emptyTitle ?? `Nothing here`} description={emptyDescription} />
      ) : (
        <div className="enter grid gap-2.5 p-3 md:grid-cols-2 2xl:grid-cols-3">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} highlightUserId={userId} />
          ))}
        </div>
      )}
    </Card>
  );
}
