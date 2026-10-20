import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Info, OctagonAlert, RotateCcw } from "lucide-react";

import { ReportControls } from "@/app/(app)/reports/report-controls";
import { AssignedVsCompletedChart, StatusBreakdownChart, TeamLoadChart } from "@/components/charts/charts";
import {
  Avatar,
  Card,
  CardHeader,
  EmptyState,
  Method,
  PageHeader,
  ProgressBar,
  StatCard,
} from "@/components/ui/primitives";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { canViewReports, isOwner } from "@/server/permissions";
import { getReport } from "@/server/services/reports";
import { TASK_STATUS_LABEL, type TaskStatus } from "@/lib/enums";
import { DAY_MS, formatDate, parseDateInput } from "@/lib/dates";

export const metadata: Metadata = { title: "Reports" };

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

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; teamId?: string; projectId?: string }>;
}) {
  const params = await searchParams;
  const user = await requireUser();
  if (!canViewReports(user)) redirect("/dashboard");

  const to = parseDateInput(params.to) ?? new Date();
  const from = parseDateInput(params.from) ?? new Date(to.getTime() - 29 * DAY_MS);
  const teamId = params.teamId || null;
  const projectId = params.projectId || null;

  const [report, teams, projects] = await Promise.all([
    getReport(user, { from, to, teamId, projectId }),
    prisma.team.findMany({
      where: { archivedAt: null, ...(isOwner(user) ? {} : { id: { in: user.ledTeamIds } }) },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.project.findMany({
      where: { archivedAt: null, ...(isOwner(user) ? {} : { teamId: { in: user.ledTeamIds } }) },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const { headline, methodology } = report;
  const exportQuery = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
    ...(teamId ? { teamId } : {}),
    ...(projectId ? { projectId } : {}),
  }).toString();

  return (
    <div className="mx-auto max-w-[110rem]">
      <PageHeader
        title="Reports"
        description={undefined}
        meta={
          <p className="text-xs text-fg-subtle">
            {formatDate(from)} → {formatDate(to)}
            {teamId ? ` · ${teams.find((t) => t.id === teamId)?.name ?? "team"}` : " · all teams you can see"}
          </p>
        }
      />

      <ReportControls
        teams={teams}
        projects={projects}
        from={from.toISOString().slice(0, 10)}
        to={to.toISOString().slice(0, 10)}
        teamId={teamId}
        projectId={projectId}
        exportQuery={exportQuery}
      />

      {/* ---------------------------------------------------------------- */}
      <div className="enter mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Assigned in period" value={headline.assigned} hint={methodology.assigned} />
        <StatCard label="Completed in period" value={headline.completed} tone="success" hint={methodology.completed} />
        <StatCard
          label="Completion rate"
          value={`${headline.completionRate}%`}
          tone="primary"
          hint="Completed ÷ max(assigned, completed)"
        />
        <StatCard
          label="On-time rate"
          value={headline.completed > 0 ? `${headline.onTimeRate}%` : "—"}
          tone={headline.onTimeRate >= 80 ? "success" : headline.completed > 0 ? "warning" : "default"}
          hint={`${headline.onTime} on time, ${headline.late} late`}
        />
        <StatCard
          label="Avg days to complete"
          value={headline.averageCompletionDays ?? "—"}
          hint={headline.averageCycleDays !== null ? `${headline.averageCycleDays} days once started` : "From assignment"}
        />
        <StatCard
          label="Update compliance"
          value={`${headline.updateCompliance}%`}
          tone={headline.updateCompliance >= 80 ? "success" : "warning"}
          hint="Share of update requests answered"
        />
      </div>

      <div className="enter mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Overdue right now"
          value={headline.overdueNow}
          tone={headline.overdueNow > 0 ? "danger" : "default"}
        />
        <StatCard
          label="Blocked right now"
          value={headline.blockedNow}
          tone={headline.blockedNow > 0 ? "danger" : "default"}
        />
        <StatCard label="Awaiting review" value={headline.awaitingReview} />
        <StatCard
          label="Sent back at least once"
          value={headline.reopenedCount}
          tone={headline.reopenedCount > 0 ? "warning" : "default"}
        />
      </div>

      {/* ---------------------------------------------------------------- */}
      <div className="mt-4 grid items-start gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Assigned versus completed" description={undefined} />
          <div className="p-3">
            {report.completionTrend.length > 0 ? (
              <AssignedVsCompletedChart data={report.completionTrend} />
            ) : (
              <EmptyState compact title="No activity in this period" />
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Status mix" description={undefined} />
          <div className="p-3">
            {report.statusMix.length > 0 ? (
              <StatusBreakdownChart
                data={report.statusMix
                  .slice()
                  .sort((a, b) => b.count - a.count)
                  .map((row) => ({
                    label: TASK_STATUS_LABEL[row.status],
                    count: row.count,
                    color: STATUS_COLOR[row.status],
                  }))}
              />
            ) : (
              <EmptyState compact title="Nothing to chart" />
            )}
          </div>
        </Card>
      </div>

      {/* ---------------------------------------------------------------- */}
      <Card className="mt-4">
        <CardHeader title="By team" description={undefined} />
        {report.byTeam.length === 0 ? (
          <EmptyState compact title="No team activity in this period" />
        ) : (
          <>
            <div className="scroll-x">
              <table className="stack-table w-full border-collapse text-left">
                <caption className="sr-only">Team delivery over the selected period</caption>
                <thead>
                  <tr className="border-b border-border">
                    {["Team", "Assigned", "Completed", "On time", "Late", "Overdue now", "Avg days", "Completion"].map(
                      (column, index) => (
                        <th
                          key={column}
                          scope="col"
                          className={`whitespace-nowrap px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-fg-subtle ${
                            index > 0 ? "text-right" : ""
                          }`}
                        >
                          {column}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {report.byTeam.map((row) => (
                    <tr key={row.teamId} className="row-hover border-b border-border last:border-0 hover:bg-surface-2">
                      <td className="px-3 py-2.5">
                        <Link href={`/teams/${row.teamId}`} className="flex items-center gap-2 hover:text-primary hover:underline">
                          <span className="size-2.5 rounded-full" style={{ backgroundColor: row.color }} aria-hidden="true" />
                          <span className="text-xs font-semibold text-fg">{row.teamName}</span>
                        </Link>
                      </td>
                      <td data-label="Assigned" className="tnum px-3 py-2.5 text-right text-xs text-fg-muted">{row.assigned}</td>
                      <td data-label="Completed" className="tnum px-3 py-2.5 text-right text-xs font-semibold text-fg">{row.completed}</td>
                      <td data-label="On time" className="tnum px-3 py-2.5 text-right text-xs text-track">{row.onTime}</td>
                      <td data-label="Late" className="tnum px-3 py-2.5 text-right text-xs">
                        <span className={row.late > 0 ? "font-semibold text-risk" : "text-fg-muted"}>{row.late}</span>
                      </td>
                      <td data-label="Overdue now" className="tnum px-3 py-2.5 text-right text-xs">
                        <span className={row.overdue > 0 ? "font-bold text-overdue" : "text-fg-muted"}>{row.overdue}</span>
                      </td>
                      <td data-label="Avg days" className="tnum px-3 py-2.5 text-right text-xs text-fg-muted">
                        {row.averageCompletionDays ?? "—"}
                      </td>
                      <td data-label="Completion" className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-2 max-md:justify-start">
                          <div className="w-20">
                            <ProgressBar value={row.completionRate} tone="COMPLETED" size="sm" label={`${row.teamName}: ${row.completionRate}%`} />
                          </div>
                          <span className="tnum w-9 text-right text-xs font-semibold text-fg-muted">{row.completionRate}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-border p-3">
              <TeamLoadChart
                data={report.byTeam.map((row) => ({
                  team: row.teamName,
                  assigned: row.assigned,
                  completed: row.completed,
                  overdue: row.overdue,
                }))}
              />
            </div>
          </>
        )}
      </Card>

      {/* ---------------------------------------------------------------- */}
      <Card className="mt-4">
        <CardHeader
          title="By person"
          description="Shared tasks are split between their required assignees."
        />
        {report.byEmployee.length === 0 ? (
          <EmptyState compact title="No individual activity in this period" />
        ) : (
          <div className="scroll-x">
            <table className="stack-table w-full border-collapse text-left">
              <caption className="sr-only">Per-person load and responsiveness</caption>
              <thead>
                <tr className="border-b border-border">
                  {[
                    "Person",
                    "Assigned share",
                    "Completed share",
                    "On time",
                    "Overdue",
                    "Blocked",
                    "Updates posted",
                    "Answered requests",
                    "Weighted load",
                  ].map((column, index) => (
                    <th
                      key={column}
                      scope="col"
                      className={`whitespace-nowrap px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-fg-subtle ${
                        index > 0 ? "text-right" : ""
                      }`}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.byEmployee.map((row) => (
                  <tr key={row.userId} className="row-hover border-b border-border last:border-0 hover:bg-surface-2">
                    <td className="px-3 py-2.5">
                      <Link href={`/employees/${row.userId}`} className="flex items-center gap-2 group">
                        <Avatar name={row.name} color={row.avatarColor} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-semibold text-fg group-hover:text-primary group-hover:underline">
                            {row.name}
                          </span>
                          <span className="block truncate text-[10px] text-fg-subtle">
                            {row.teams.join(" / ") || "No team"}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td data-label="Assigned share" className="tnum px-3 py-2.5 text-right text-xs text-fg-muted">{row.assignedShare}</td>
                    <td data-label="Completed share" className="tnum px-3 py-2.5 text-right text-xs font-semibold text-fg">{row.completedShare}</td>
                    <td data-label="On time" className="tnum px-3 py-2.5 text-right text-xs text-fg-muted">{row.onTimeRate}%</td>
                    <td data-label="Overdue" className="tnum px-3 py-2.5 text-right text-xs">
                      <span className={row.overdue > 0 ? "font-bold text-overdue" : "text-fg-muted"}>{row.overdue}</span>
                    </td>
                    <td data-label="Blocked" className="tnum px-3 py-2.5 text-right text-xs">
                      <span className={row.blocked > 0 ? "font-semibold text-overdue" : "text-fg-muted"}>{row.blocked}</span>
                    </td>
                    <td data-label="Updates posted" className="tnum px-3 py-2.5 text-right text-xs text-fg-muted">{row.updatesPosted}</td>
                    <td data-label="Answered requests" className="tnum px-3 py-2.5 text-right text-xs">
                      <span className={row.updateComplianceRate < 70 ? "font-semibold text-risk" : "text-fg-muted"}>
                        {row.updateComplianceRate}%
                      </span>
                    </td>
                    <td data-label="Weighted load" className="tnum px-3 py-2.5 text-right text-xs font-semibold text-fg">{row.weightedLoad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-border px-3 pb-3">
          <Method>
            <Info className="mr-1 inline size-3" aria-hidden="true" />
            {methodology.perPerson}
          </Method>
        </div>
      </Card>

      {/* ---------------------------------------------------------------- */}
      <div className="mt-4 grid items-start gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader
            title="Blockers reported"
            description={undefined}
          />
          {report.blockers.length === 0 ? (
            <EmptyState compact icon={<OctagonAlert className="size-5" aria-hidden="true" />} title="No blockers reported" />
          ) : (
            <ul className="divide-y divide-border">
              {report.blockers.slice(0, 10).map((row, index) => (
                <li key={`${row.taskId}-${index}`} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/tasks/${row.taskId}`}
                      className="text-xs font-semibold text-fg hover:text-primary hover:underline"
                    >
                      <span className="tnum font-mono">{row.code}</span> — {row.title}
                    </Link>
                    <span className={`chip ${row.resolved ? "chip-COMPLETED" : "chip-BLOCKED"}`}>
                      {row.resolved ? "cleared" : "still blocked"}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-fg-muted">{row.reason}</p>
                  <p className="mt-1 text-[10px] text-fg-subtle">
                    {row.reportedBy} · {formatDate(row.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Sent back for changes" description={undefined} />
          {report.reopened.length === 0 ? (
            <EmptyState compact icon={<RotateCcw className="size-5" aria-hidden="true" />} title="Nothing was sent back" />
          ) : (
            <ul className="divide-y divide-border">
              {report.reopened.slice(0, 10).map((row) => (
                <li key={row.taskId} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/tasks/${row.taskId}`}
                      className="text-xs font-semibold text-fg hover:text-primary hover:underline"
                    >
                      <span className="tnum font-mono">{row.code}</span> — {row.title}
                    </Link>
                    <span className="chip chip-CHANGES_REQUESTED">
                      {row.rounds} {row.rounds === 1 ? "round" : "rounds"}
                    </span>
                  </div>
                  {row.lastFeedback ? (
                    <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-fg-muted">{row.lastFeedback}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Late completions" description={undefined} />
          {report.lateCompletions.length === 0 ? (
            <EmptyState
              compact
              icon={<AlertTriangle className="size-5" aria-hidden="true" />}
              title="Everything landed on time"
            />
          ) : (
            <ul className="divide-y divide-border">
              {report.lateCompletions.slice(0, 10).map((row) => (
                <li key={row.taskId} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/tasks/${row.taskId}`}
                      className="text-xs font-semibold text-fg hover:text-primary hover:underline"
                    >
                      <span className="tnum font-mono">{row.code}</span> — {row.title}
                    </Link>
                    <span className="chip chip-OVERDUE">{row.daysLate} days late</span>
                  </div>
                  <p className="mt-1 text-[10px] text-fg-subtle">
                    {row.assignees.join(", ")} · due {row.originalDueAt ? formatDate(row.originalDueAt) : "—"} ·
                    completed {row.completedAt ? formatDate(row.completedAt) : "—"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ---------------------------------------------------------------- */}
      <Card className="mt-4">
        <CardHeader title="How these figures are calculated" />
        <dl className="grid gap-3 p-4 sm:grid-cols-2">
          {Object.entries(methodology).map(([key, value]) => (
            <div key={key}>
              <dt className="text-xs font-semibold capitalize text-fg">{key.replace(/([A-Z])/g, " $1").toLowerCase()}</dt>
              <dd className="mt-0.5 text-xs leading-relaxed text-fg-muted">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
