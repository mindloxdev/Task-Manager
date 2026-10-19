import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";

import { TaskForm } from "@/app/(app)/tasks/task-form";
import { ButtonLink } from "@/components/ui/button";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { isOwner } from "@/server/permissions";
import { listAssignableUsers, listTaskTargetTeams } from "@/server/services/teams";
import { getSettings } from "@/server/services/settings";
import type { UpdateCadence } from "@/lib/enums";

export const metadata: Metadata = { title: "New task" };

export default async function NewTaskPage() {
  const user = await requireUser();

  // Employees cannot assign work; the page says so rather than hiding and 404ing.
  const canAssign = isOwner(user) || (user.role === "MANAGER" && user.ledTeamIds.length > 0);
  if (!canAssign) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Assign work" />
        <Card>
          <EmptyState
            icon={<ShieldAlert className="size-5" aria-hidden="true" />}
            title="You cannot create tasks"
            description="Only an owner or a team lead can assign work."
            action={
              <ButtonLink href="/my-tasks" variant="primary">
                Back to my tasks
              </ButtonLink>
            }
          />
        </Card>
      </div>
    );
  }

  const [teams, people, projects, settings] = await Promise.all([
    listTaskTargetTeams(user),
    listAssignableUsers(user),
    prisma.project.findMany({
      where: {
        archivedAt: null,
        ...(isOwner(user) ? {} : { OR: [{ teamId: { in: user.ledTeamIds } }, { teamId: null }] }),
      },
      select: { id: true, name: true, key: true, teamId: true },
      orderBy: { name: "asc" },
    }),
    getSettings(),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Assign work"
        description="One task, however many people own it."
      />
      <TaskForm
        teams={teams}
        people={people.map((person) => ({
          id: person.id,
          name: person.name,
          jobTitle: person.jobTitle,
          avatarColor: person.avatarColor,
          email: person.email,
        }))}
        projects={projects}
        defaults={{
          reviewRequired: settings.defaultReviewRequired === "true",
          updateCadence: settings.defaultUpdateCadence as UpdateCadence,
        }}
      />
    </div>
  );
}
