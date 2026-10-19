"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Star, UserMinus, UserPlus } from "lucide-react";

import { addMemberAction, removeMemberAction, setMemberRoleAction } from "@/app/actions/org";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { Avatar, Card, CardHeader, EmptyState } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { TEAM_ROLE_LABEL, USER_STATUS_LABEL, type TeamRole, type UserStatus } from "@/lib/enums";

type Member = {
  id: string;
  userId: string;
  name: string;
  jobTitle: string | null;
  avatarColor: string;
  role: string;
  status: string;
  email: string;
};

type Candidate = { id: string; name: string; jobTitle: string | null; avatarColor: string; role: string };

/** Team roster: add, promote and remove members. */
export function MemberManager({
  teamId,
  canManage,
  canAppointLeads,
  viewerId,
  members,
  addable,
}: {
  teamId: string;
  canManage: boolean;
  canAppointLeads: boolean;
  viewerId: string;
  members: Member[];
  addable: Candidate[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [chosenId, setChosenId] = useState("");
  const [chosenRole, setChosenRole] = useState<TeamRole>("MEMBER");
  const [removing, setRemoving] = useState<Member | null>(null);

  const leads = members.filter((member) => member.role === "LEAD");

  const add = () => {
    if (!chosenId) return;
    startTransition(async () => {
      const result = await addMemberAction(teamId, { userId: chosenId, role: chosenRole });
      if (result.ok) {
        toast({ tone: "success", title: "Member added", description: "They have been notified." });
        setAddOpen(false);
        setChosenId("");
        setChosenRole("MEMBER");
        router.refresh();
      } else {
        toast({ tone: "error", title: "Could not add them", description: result.error });
      }
    });
  };

  const remove = () => {
    if (!removing) return;
    const member = removing;
    startTransition(async () => {
      const result = await removeMemberAction(teamId, member.userId);
      if (result.ok) {
        toast({ tone: "success", title: `${member.name} removed from the team` });
        setRemoving(null);
        router.refresh();
      } else {
        // The service refuses while they still hold open work for this team.
        toast({ tone: "error", title: "Cannot remove them yet", description: result.error });
      }
    });
  };

  const changeRole = (member: Member, role: TeamRole) => {
    startTransition(async () => {
      const result = await setMemberRoleAction(teamId, member.userId, role);
      if (result.ok) {
        toast({
          tone: "success",
          title: role === "LEAD" ? `${member.name} is now a team lead` : `${member.name} is now a member`,
        });
        router.refresh();
      } else {
        toast({ tone: "error", title: "Could not change that role", description: result.error });
      }
    });
  };

  return (
    <Card>
      <CardHeader
        title={`Members (${members.length})`}
        description={leads.length > 0 ? `Led by ${leads.map((lead) => lead.name).join(", ")}` : "No lead appointed yet"}
        level={3}
        action={
          canManage && addable.length > 0 ? (
            <Button size="sm" variant="secondary" onClick={() => setAddOpen(true)}>
              <UserPlus className="size-3.5" aria-hidden="true" />
              Add
            </Button>
          ) : null
        }
      />

      {members.length === 0 ? (
        <EmptyState compact title="No members" description="Add people so work can be assigned to this team." />
      ) : (
        <ul className="divide-y divide-border">
          {members.map((member) => (
            <li key={member.id} className="flex items-start gap-2.5 p-3">
              <Avatar name={member.name} color={member.avatarColor} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Link
                    href={`/employees/${member.userId}`}
                    className="truncate text-xs font-semibold text-fg hover:text-primary hover:underline"
                  >
                    {member.name}
                  </Link>
                  {member.role === "LEAD" ? (
                    <span className="chip bg-primary-soft text-primary-soft-fg">
                      <Star className="size-2.5" aria-hidden="true" />
                      Lead
                    </span>
                  ) : null}
                  {member.status !== "ACTIVE" ? (
                    <span className="chip bg-surface-2 text-fg-subtle">
                      {USER_STATUS_LABEL[member.status as UserStatus]}
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 truncate text-[10px] text-fg-subtle">{member.jobTitle ?? member.email}</p>
              </div>
              {canManage ? (
                <div className="flex shrink-0 items-center gap-1">
                  {canAppointLeads ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => changeRole(member, member.role === "LEAD" ? "MEMBER" : "LEAD")}
                      title={member.role === "LEAD" ? "Demote to member" : "Promote to team lead"}
                    >
                      {member.role === "LEAD" ? "Demote" : "Make lead"}
                    </Button>
                  ) : null}
                  {member.userId !== viewerId ? (
                    <button
                      type="button"
                      onClick={() => setRemoving(member)}
                      className="rounded-md p-2 text-fg-subtle transition-colors hover:bg-overdue-bg hover:text-overdue"
                      aria-label={`Remove ${member.name} from the team`}
                    >
                      <UserMinus className="size-3.5" aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add someone to this team"
        description={undefined}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" onClick={add} loading={pending} disabled={!chosenId}>
              Add to team
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="member-choice" className="mb-1 block text-xs font-semibold text-fg">
              Person
            </label>
            <Select id="member-choice" value={chosenId} onChange={(event) => setChosenId(event.target.value)}>
              <option value="">Choose someone…</option>
              {addable.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                  {candidate.jobTitle ? ` — ${candidate.jobTitle}` : ""}
                </option>
              ))}
            </Select>
          </div>
          {canAppointLeads ? (
            <div>
              <label htmlFor="member-role" className="mb-1 block text-xs font-semibold text-fg">
                Role in this team
              </label>
              <Select
                id="member-role"
                value={chosenRole}
                onChange={(event) => setChosenRole(event.target.value as TeamRole)}
              >
                <option value="MEMBER">{TEAM_ROLE_LABEL.MEMBER}</option>
                <option value="LEAD">{TEAM_ROLE_LABEL.LEAD}</option>
              </Select>

            </div>
          ) : null}
        </div>
      </Modal>

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        title={removing ? `Remove ${removing.name}?` : "Remove member"}
        message="They lose access to this team's tasks. Open work must be reassigned first."
        confirmLabel="Remove"
        tone="danger"
        loading={pending}
      />
    </Card>
  );
}
