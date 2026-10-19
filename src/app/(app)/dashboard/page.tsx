import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  CheckCheck,
  CircleDot,
  Clock,
  Eye,
  OctagonAlert,
  Radio,
  SquareCheckBig,
} from "lucide-react";

import { ActivityFeed } from "@/components/activity-feed";
import { AssignedVsCompletedChart, PriorityBarChart, StatusBreakdownChart } from "@/components/charts/charts";
import { TaskCard, TaskLine } from "@/components/task/task-card";
import { ButtonLink } from "@/components/ui/button";
import {
  Avatar,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  SectionTitle,
  StatCard,
} from "@/components/ui/primitives";
import { requireUser } from "@/server/auth";
import { getDashboard } from "@/server/services/dashboard";
import { listEmployees } from "@/server/services/users";
import { listTeamSummaries } from "@/server/services/teams";
import { TASK_STATUS_LABEL, type TaskStatus } from "@/lib/enums";
import { formatRelative } from "@/lib/dates";
import { EmployeeTable } from "@/app/(app)/employees/employee-table";
import { TeamSummaryTable } from "@/app/(app)/teams/team-summary-table";
import { ReviewQueue } from "@/app/(app)/dashboard/review-queue";

export const metadata: Metadata = { title: "Dashboard" };

const STATUS_COLOR: Record<TaskStatus, string> = {
  DRAFT: "var(--st-draft)",
  ASSIGNED: "var(--st-assigned)",
  ACKNOWLEDGED: "var(--st-acknowledged)",
  IN_PROGRESS: "var(--st-progress)",
  BLOCKED: "var(--st-blocked)",
  SUBMITTED_FOR_REVIEW: "var(--st-review)",
  CHANGES_REQUESTED: "var(--st-changes)",
  COMPLETED: "var(--st-completed)",
  CANCELLED: "var(--st-cancelled)",
};

export default async function DashboardPage() {
  const user = await requireUser();
  const [data, teams, employees] = await Promise.all([
    getDashboard(user),
    listTeamSummaries(user),
    user.role === "EMPLOYEE" ? Promise.resolve([]) : listEmployees(user),
  ]);

  const { summary } = data;
  const isLead = user.role === "OWNER" || user.role === "MANAGER";
  const canAssign = user.role === "OWNER" || user.ledTeamIds.length > 0;

  return (
    <div className="mx-auto max-w-[110rem]">
      <PageHeader
        title={isLead ? "Team progress" : "Your work"}
        description={
          isLead
            ? "Task accountability — who owes what, and by when."
            : "Task accountability — what you own, and what is due."
        }
        actions={
          <>
            <ButtonLink href="/my-tasks" variant="secondary">
              My tasks
            </ButtonLink>
            {canAssign ? (
              <ButtonLink href="/tasks/new" variant="primary">
                Assign work
              </ButtonLink>
            ) : null}
          </>
        }
      />

      {/* ---------------------------------------------------------------- */}
      <div className="enter grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-8">
        <StatCard
          label="Active tasks"
          value={summary.activeTasks}
          hint="Assigned through to awaiting review"
          icon={<SquareCheckBig className="size-4" aria-hidden="true" />}
          href="/tasks?scope=ALL"
        />
        <StatCard
          label="In progress"
          value={summary.inProgress}
          hint="Someone is actively working"
          tone="primary"
          icon={<CircleDot className="size-4" aria-hidden="true" />}
          href="/tasks?status=IN_PROGRESS"
        />
        <StatCard
          label="Completed this week"
          value={summary.completedThisWeek}
          hint="Approved since Monday"
          tone="success"
          icon={<CheckCheck className="size-4" aria-hidden="true" />}
          href="/tasks?status=COMPLETED"
        />
        <StatCard
          label="Overdue"
          value={summary.overdue}
          hint="Deadline has passed"
          tone={summary.overdue > 0 ? "danger" : "default"}
          icon={<AlertTriangle className="size-4" aria-hidden="true" />}
          href="/tasks?health=OVERDUE"
        />
        <StatCard
          label="At risk"
          value={summary.atRisk}
          hint="Behind schedule or due within 24h"
          tone={summary.atRisk > 0 ? "warning" : "default"}
          icon={<Clock className="size-4" aria-hidden="true" />}
          href="/tasks?health=AT_RISK"
        />
        <StatCard
          label="Blocked"
          value={summary.blocked}
          hint="An assignee reported a blocker"
          tone={summary.blocked > 0 ? "danger" : "default"}
          icon={<OctagonAlert className="size-4" aria-hidden="true" />}
          href="/tasks?status=BLOCKED"
        />
        <StatCard
          label="Awaiting review"
          value={summary.awaitingReview}
          hint="Submitted, not yet decided"
          tone={summary.awaitingReview > 0 ? "primary" : "default"}
          icon={<Eye className="size-4" aria-hidden="true" />}
          href="/tasks?scope=AWAITING_REVIEW"
        />
        <StatCard
          label="No recent update"
          value={summary.silentAssignees}
          hint="People who have not reported progress"
          tone={summary.silentAssignees > 0 ? "warning" : "default"}
          icon={<Radio className="size-4" aria-hidden="true" />}
        />
      </div>

      {/* ---------------------------------------------------------------- */}
      <div className="mt-6 grid items-start gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Assigned versus completed"
            description="Last 14 days"
          />
          <div className="p-3">
            <AssignedVsCompletedChart data={data.completionTrend} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Status mix" />
          <div className="p-3">
            {data.byStatus.length > 0 ? (
              <StatusBreakdownChart
                data={data.byStatus
                  .slice()
                  .sort((a, b) => b.count - a.count)
                  .map((row) => ({
                    label: TASK_STATUS_LABEL[row.status],
                    count: row.count,
                    color: STATUS_COLOR[row.status],
                  }))}
              />
            ) : (
              <EmptyState compact title="Nothing to chart yet" description="Assign a task and this fills in." />
            )}
          </div>
        </Card>
      </div>

      {/* ---------------------------------------------------------------- */}
      <div className="mt-6 grid items-start gap-4 xl:grid-cols-3">
        {/* Needs action */}
        <Card className="xl:col-span-2">
          <CardHeader
            title={isLead ? "Waiting on you" : "Needs your attention"}
            description={isLead ? "Reviews, extensions and update requests." : "Acknowledge, resume or answer."}
            action={
              <ButtonLink href="/tasks?scope=NEEDS_MY_ACTION" size="sm" variant="ghost">
                See all
              </ButtonLink>
            }
          />
          <div className="divide-y divide-border">
            <ReviewQueue reviews={data.awaitingMyReview} extensions={data.pendingExtensions} />

            {data.openUpdateRequests.length > 0 ? (
              <div className="p-3">
                <SectionTitle>Updates asked of you</SectionTitle>
                <ul className="space-y-1.5">
                  {data.openUpdateRequests.map((request) => (
                    <li key={request.id} className="rounded-md border border-risk/40 bg-risk-bg/50 p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link
                            href={`/tasks/${request.task.id}`}
                            className="text-xs font-semibold text-fg hover:text-primary hover:underline"
                          >
                            {request.task.code} — {request.task.title}
                          </Link>
                          {request.message ? (
                            <p className="mt-0.5 text-[11px] text-fg-muted">
                              {request.requestedBy.name}: &ldquo;{request.message}&rdquo;
                            </p>
                          ) : null}
                        </div>
                        <ButtonLink href={`/tasks/${request.task.id}#progress`} size="sm" variant="secondary">
                          Reply
                        </ButtonLink>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {data.myAssignments.needsMyAction.length > 0 ? (
              <div className="p-3">
                <SectionTitle>Your tasks needing a move</SectionTitle>
                <div className="enter grid gap-2.5 md:grid-cols-2">
                  {data.myAssignments.needsMyAction.slice(0, 4).map((task) => (
                    <TaskCard key={task.id} task={task} highlightUserId={user.id} />
                  ))}
                </div>
              </div>
            ) : null}

            {data.awaitingMyReview.length === 0 &&
            data.pendingExtensions.length === 0 &&
            data.openUpdateRequests.length === 0 &&
            data.myAssignments.needsMyAction.length === 0 ? (
              <EmptyState
                icon={<CheckCheck className="size-5" aria-hidden="true" />}
                title="Nothing is waiting on you"
              />
            ) : null}
          </div>
        </Card>

        {/* Deadlines */}
        <Card>
          <CardHeader title="Deadlines" description="Overdue first" />
          <div className="divide-y divide-border">
            <DeadlineGroup label="Overdue" tasks={data.deadlines.overdue} tone="danger" />
            <DeadlineGroup label="Due today" tasks={data.deadlines.today} tone="warning" />
            <DeadlineGroup label="Due tomorrow" tasks={data.deadlines.tomorrow} />
            <DeadlineGroup label="Rest of this week" tasks={data.deadlines.thisWeek} />
            <DeadlineGroup label="Later" tasks={data.deadlines.later} />
            {data.deadlines.overdue.length === 0 &&
            data.deadlines.today.length === 0 &&
            data.deadlines.tomorrow.length === 0 &&
            data.deadlines.thisWeek.length === 0 &&
            data.deadlines.later.length === 0 ? (
              <EmptyState
                compact
                icon={<CalendarClock className="size-5" aria-hidden="true" />}
                title="No upcoming deadlines"
              />
            ) : null}
          </div>
        </Card>
      </div>

      {/* ---------------------------------------------------------------- */}
      {summary.silentAssignees > 0 ? (
        <Card className="mt-6">
          <CardHeader
            title="People with no recent update"
            description="Either someone asked for an update and got no reply, or the task's check-in schedule has passed."
          />
          <div className="scroll-x">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">People who have not reported progress</caption>
              <thead>
                <tr className="border-b border-border">
                  {["Person", "Task", "Last update", "Requested"].map((column) => (
                    <th
                      key={column}
                      scope="col"
                      className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-fg-subtle"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.silentAssignees.map((row) => (
                  <tr key={`${row.userId}-${row.taskId}`} className="row-hover border-b border-border last:border-0 hover:bg-surface-2">
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2">
                        <Avatar name={row.name} color={row.avatarColor} size="sm" />
                        <span className="text-xs font-medium text-fg">{row.name}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/tasks/${row.taskId}`}
                        className="text-xs text-fg-muted hover:text-primary hover:underline"
                      >
                        <span className="tnum font-mono">{row.taskCode}</span> — {row.taskTitle}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs text-fg-muted">
                      {row.lastUpdateAt ? formatRelative(row.lastUpdateAt) : "Never"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {row.requestedAt ? (
                        <span className="chip chip-CHANGES_REQUESTED">
                          <Radio className="size-3" aria-hidden="true" />
                          asked {formatRelative(row.requestedAt)}
                        </span>
                      ) : (
                        <span className="text-fg-subtle">check-in overdue</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </Card>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {isLead ? (
        <>
          <Card className="mt-6">
            <CardHeader
              title="Team overview"
              description="Work carried by each team"
              action={
                <ButtonLink href="/teams" size="sm" variant="ghost">
                  Manage teams
                </ButtonLink>
              }
            />
            <TeamSummaryTable teams={teams} />
          </Card>

          <Card className="mt-6">
            <CardHeader
              title="Employee overview"
              description="Workload is weighted by priority and split across shared tasks."
              action={
                <ButtonLink href="/employees" size="sm" variant="ghost">
                  Manage people
                </ButtonLink>
              }
            />
            <EmployeeTable employees={employees} viewerRole={user.role} compact />
          </Card>
        </>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      <div className="mt-6 grid items-start gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Priority mix" />
          <div className="p-3">
            <PriorityBarChart
              data={data.byPriority.map((row) => ({
                priority: row.priority.charAt(0) + row.priority.slice(1).toLowerCase(),
                open: row.count,
                completed: row.completed,
              }))}
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Activity"
            description="Recent events"
            action={
              <ButtonLink href="/notifications" size="sm" variant="ghost">
                Notifications
              </ButtonLink>
            }
          />
          <div className="p-3">
            <ActivityFeed items={data.activity} compact />
          </div>
        </Card>
      </div>

      {/* ---------------------------------------------------------------- */}
      {data.myAssignments.assignedToMe.length > 0 ? (
        <Card className="mt-6">
          <CardHeader
            title="Assigned to you"
            description="Your own progress on each"
            action={
              <ButtonLink href="/my-tasks" size="sm" variant="ghost">
                Open my tasks
              </ButtonLink>
            }
          />
          <div className="enter grid gap-2.5 p-3 md:grid-cols-2 2xl:grid-cols-3">
            {data.myAssignments.assignedToMe.slice(0, 6).map((task) => (
              <TaskCard key={task.id} task={task} highlightUserId={user.id} />
            ))}
          </div>
        </Card>
      ) : null}

      {isLead && data.myAssignments.createdByMe.length > 0 ? (
        <Card className="mt-6">
          <CardHeader title="Work you assigned" />
          <div className="enter grid gap-2.5 p-3 md:grid-cols-2 2xl:grid-cols-3">
            {data.myAssignments.createdByMe.slice(0, 6).map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function DeadlineGroup({
  label,
  tasks,
  tone,
}: {
  label: string;
  tasks: Awaited<ReturnType<typeof getDashboard>>["deadlines"]["today"];
  tone?: "danger" | "warning";
}) {
  if (tasks.length === 0) return null;
  const toneClass = tone === "danger" ? "text-overdue" : tone === "warning" ? "text-risk" : "text-fg-subtle";
  return (
    <div className="p-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className={`text-[10px] font-bold uppercase tracking-wider ${toneClass}`}>{label}</h3>
        <span className="tnum text-[10px] font-semibold text-fg-subtle">{tasks.length}</span>
      </div>
      <div className="space-y-0.5">
        {tasks.map((task) => (
          <TaskLine key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
}
