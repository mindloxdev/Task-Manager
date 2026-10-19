import type { Metadata } from "next";

import { TeamSummaryTable } from "@/app/(app)/teams/team-summary-table";
import { CreateTeamButton } from "@/app/(app)/teams/create-team";
import { TeamLoadChart } from "@/components/charts/charts";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { canCreateTeam } from "@/server/permissions";
import { listTeamSummaries } from "@/server/services/teams";

export const metadata: Metadata = { title: "Teams" };

export default async function TeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const { archived } = await searchParams;
  const user = await requireUser();
  const includeArchived = archived === "true";

  const [teams, people] = await Promise.all([
    listTeamSummaries(user, { includeArchived }),
    canCreateTeam(user)
      ? prisma.user.findMany({
          where: { status: { not: "DEACTIVATED" } },
          select: { id: true, name: true, jobTitle: true, avatarColor: true, role: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const chartData = teams
    .filter((team) => !team.archivedAt)
    .map((team) => ({
      team: team.name,
      assigned: team.activeTasks,
      completed: team.completedTasks,
      overdue: team.overdueTasks,
    }));

  return (
    <div className="mx-auto max-w-[100rem]">
      <PageHeader
        title="Teams"
        description={user.role === "OWNER" ? "Every team and the work it carries." : "The teams you belong to."}
        actions={canCreateTeam(user) ? <CreateTeamButton people={people} /> : null}
      />

      <Card>
        <CardHeader
          title={`${teams.length} ${teams.length === 1 ? "team" : "teams"}`}
          description={undefined}
          action={
            user.role === "OWNER" ? (
              <a
                href={includeArchived ? "/teams" : "/teams?archived=true"}
                className="text-xs font-semibold text-primary hover:underline"
              >
                {includeArchived ? "Hide archived" : "Show archived"}
              </a>
            ) : null
          }
        />
        <TeamSummaryTable teams={teams} />
      </Card>

      {chartData.length > 0 ? (
        <Card className="mt-4">
          <CardHeader title="Where the work sits" />
          <div className="p-3">
            <TeamLoadChart data={chartData} />
          </div>
        </Card>
      ) : (
        <Card className="mt-4">
          <EmptyState title="No team data to chart" />
        </Card>
      )}
    </div>
  );
}
