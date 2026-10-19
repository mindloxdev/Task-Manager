import Link from "next/link";

import { AvatarStack, EmptyState, Method, ProgressBar } from "@/components/ui/primitives";
import type { TeamSummary } from "@/server/services/teams";

/**
 * Team scoreboard. Every column is a plain count except the completion rate,
 * which is explained underneath so nobody has to guess at the denominator.
 */
export function TeamSummaryTable({ teams }: { teams: TeamSummary[] }) {
  if (teams.length === 0) {
    return (
      <EmptyState
        compact
        title="No teams yet"
        description={undefined}
      />
    );
  }

  return (
    <div>
      <div className="scroll-x">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">Teams with their active, completed and overdue tasks</caption>
          <thead>
            <tr className="border-b border-border">
              {["Team", "Leads", "People", "Active", "Completed", "Overdue", "Blocked", "In review", "Completion"].map(
                (column, index) => (
                  <th
                    key={column}
                    scope="col"
                    className={`whitespace-nowrap px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-fg-subtle ${
                      index >= 2 ? "text-right" : ""
                    }`}
                  >
                    {column}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {teams.map((team) => (
              <tr key={team.id} className="row-hover border-b border-border last:border-0 hover:bg-surface-2">
                <td className="px-3 py-2.5">
                  <Link href={`/teams/${team.id}`} className="group flex items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: team.color }} aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-fg group-hover:text-primary group-hover:underline">
                        {team.name}
                        {team.archivedAt ? <span className="ml-1.5 text-[10px] font-normal text-fg-subtle">archived</span> : null}
                      </span>
                      {team.description ? (
                        <span className="block max-w-[18rem] truncate text-[10px] text-fg-subtle">{team.description}</span>
                      ) : null}
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-2.5">
                  {team.leads.length > 0 ? (
                    <AvatarStack people={team.leads} max={3} size="xs" />
                  ) : (
                    <span className="text-[11px] text-fg-subtle">No lead</span>
                  )}
                </td>
                <td className="tnum px-3 py-2.5 text-right text-xs text-fg-muted">{team.memberCount}</td>
                <td className="tnum px-3 py-2.5 text-right text-xs font-semibold text-fg">{team.activeTasks}</td>
                <td className="tnum px-3 py-2.5 text-right text-xs text-fg-muted">{team.completedTasks}</td>
                <td className="tnum px-3 py-2.5 text-right text-xs">
                  <span className={team.overdueTasks > 0 ? "font-bold text-overdue" : "text-fg-muted"}>
                    {team.overdueTasks}
                  </span>
                </td>
                <td className="tnum px-3 py-2.5 text-right text-xs">
                  <span className={team.blockedTasks > 0 ? "font-bold text-overdue" : "text-fg-muted"}>
                    {team.blockedTasks}
                  </span>
                </td>
                <td className="tnum px-3 py-2.5 text-right text-xs text-fg-muted">{team.awaitingReview}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-20">
                      <ProgressBar
                        value={team.completionRate}
                        tone="COMPLETED"
                        size="sm"
                        label={`${team.name}: ${team.completionRate}% of its tasks completed`}
                      />
                    </div>
                    <span className="tnum w-9 text-right text-xs font-semibold text-fg-muted">{team.completionRate}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-border px-3 pb-3">
        <Method>Completion = completed ÷ assigned. Drafts and cancelled work are excluded.</Method>
      </div>
    </div>
  );
}
