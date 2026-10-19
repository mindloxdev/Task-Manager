import type { Metadata } from "next";

import { EmployeeTable } from "@/app/(app)/employees/employee-table";
import { InvitePanel } from "@/app/(app)/employees/invite-panel";
import { Card, CardHeader, PageHeader, StatCard } from "@/components/ui/primitives";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { canInviteUsers, isOwner } from "@/server/permissions";
import { listEmployees } from "@/server/services/users";

export const metadata: Metadata = { title: "People" };

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ inactive?: string }>;
}) {
  const { inactive } = await searchParams;
  const user = await requireUser();
  const includeInactive = inactive === "true";

  const [employees, teams] = await Promise.all([
    listEmployees(user, { includeInactive }),
    canInviteUsers(user)
      ? prisma.team.findMany({ where: { archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
  ]);

  const active = employees.filter((row) => row.status === "ACTIVE");
  const invited = employees.filter((row) => row.status === "INVITED");
  const overloaded = active.filter((row) => row.overdueTasks > 0 || row.pendingUpdateRequests > 0);

  return (
    <div className="mx-auto max-w-[110rem]">
      <PageHeader
        title="People"
        description={isOwner(user) ? "Everyone, and what they are carrying." : "People in the teams you lead."}
        actions={canInviteUsers(user) ? <InvitePanel teams={teams} /> : null}
      />

      <div className="enter grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Active people" value={active.length} />
        <StatCard label="Invited, not yet signed in" value={invited.length} tone={invited.length > 0 ? "primary" : "default"} />
        <StatCard
          label="Carrying overdue work"
          value={active.filter((row) => row.overdueTasks > 0).length}
          tone={active.some((row) => row.overdueTasks > 0) ? "danger" : "default"}
        />
        <StatCard
          label="Owe an update"
          value={active.filter((row) => row.pendingUpdateRequests > 0).length}
          tone={active.some((row) => row.pendingUpdateRequests > 0) ? "warning" : "default"}
        />
      </div>

      {overloaded.length > 0 ? (
        <Card className="mt-4 border-risk/40">
          <CardHeader
            title="Who might need help"
            description="Carrying overdue work, or an unanswered update request."
          />
          <ul className="flex flex-wrap gap-2 p-3">
            {overloaded.map((row) => (
              <li key={row.id} className="chip bg-surface-2 text-fg-muted">
                <span className="size-1.5 rounded-full bg-risk" aria-hidden="true" />
                {row.name}
                {row.overdueTasks > 0 ? ` · ${row.overdueTasks} overdue` : ""}
                {row.pendingUpdateRequests > 0 ? ` · ${row.pendingUpdateRequests} update asked` : ""}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="mt-4">
        <CardHeader
          title="Everyone"
          description={undefined}
          action={
            isOwner(user) ? (
              <a
                href={includeInactive ? "/employees" : "/employees?inactive=true"}
                className="text-xs font-semibold text-primary hover:underline"
              >
                {includeInactive ? "Hide deactivated" : "Show deactivated"}
              </a>
            ) : null
          }
        />
        <EmployeeTable employees={employees} viewerRole={user.role} />
      </Card>
    </div>
  );
}
