"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, UserMinus, UserPlus } from "lucide-react";

import { changeRoleAction, deactivateUserAction, reactivateUserAction } from "@/app/actions/org";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { USER_ROLES, USER_ROLE_LABEL, type UserRole, type UserStatus } from "@/lib/enums";

/** Owner-only controls for one person: role, deactivation, reactivation. */
export function PersonAdmin({
  person,
}: {
  person: { id: string; name: string; role: UserRole; status: UserStatus };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [roleOpen, setRoleOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [role, setRole] = useState<UserRole>(person.role);

  const saveRole = () => {
    startTransition(async () => {
      const result = await changeRoleAction(person.id, { role });
      if (result.ok) {
        toast({
          tone: "success",
          title: `${person.name} is now ${USER_ROLE_LABEL[role].toLowerCase()}`,
          description: "Their existing sessions were signed out so the new role takes effect immediately.",
        });
        setRoleOpen(false);
        router.refresh();
      } else {
        toast({ tone: "error", title: "Could not change that role", description: result.error });
      }
    });
  };

  const deactivate = () => {
    startTransition(async () => {
      const result = await deactivateUserAction(person.id);
      if (result.ok) {
        toast({
          tone: result.data.openTasks > 0 ? "warning" : "success",
          title: `${person.name} deactivated`,
          description:
            result.data.openTasks > 0
              ? `They still hold ${result.data.openTasks} open ${result.data.openTasks === 1 ? "task" : "tasks"} — reassign them so the work is not orphaned.`
              : "They are signed out and cannot receive new assignments.",
        });
        setConfirmOpen(false);
        router.refresh();
      } else {
        toast({ tone: "error", title: "Could not deactivate them", description: result.error });
      }
    });
  };

  const reactivate = () => {
    startTransition(async () => {
      const result = await reactivateUserAction(person.id);
      if (result.ok) {
        toast({ tone: "success", title: `${person.name} reactivated` });
        router.refresh();
      } else {
        toast({ tone: "error", title: "Could not reactivate them", description: result.error });
      }
    });
  };

  return (
    <>
      <Button variant="secondary" onClick={() => setRoleOpen(true)}>
        <ShieldCheck className="size-3.5" aria-hidden="true" />
        Change role
      </Button>

      {person.status === "DEACTIVATED" ? (
        <Button variant="secondary" loading={pending} onClick={reactivate}>
          <UserPlus className="size-3.5" aria-hidden="true" />
          Reactivate
        </Button>
      ) : (
        <Button variant="danger" onClick={() => setConfirmOpen(true)}>
          <UserMinus className="size-3.5" aria-hidden="true" />
          Deactivate
        </Button>
      )}

      <Modal
        open={roleOpen}
        onClose={() => setRoleOpen(false)}
        title={`Change ${person.name}'s role`}
        description="They are signed out, so the new permissions apply immediately."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRoleOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" onClick={saveRole} loading={pending} disabled={role === person.role}>
              Save role
            </Button>
          </>
        }
      >
        <div>
          <label htmlFor="person-role" className="mb-1 block text-xs font-semibold text-fg">
            Role
          </label>
          <Select id="person-role" value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
            {USER_ROLES.map((option) => (
              <option key={option} value={option}>
                {USER_ROLE_LABEL[option]}
              </option>
            ))}
          </Select>
          <ul className="mt-3 space-y-1 text-[11px] text-fg-muted">
            <li>
              <strong className="font-semibold text-fg">Owner</strong> — everything, company-wide.
            </li>
            <li>
              <strong className="font-semibold text-fg">Manager</strong> — the teams they lead.
            </li>
            <li>
              <strong className="font-semibold text-fg">Employee</strong> — their own work.
            </li>
          </ul>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={deactivate}
        title={`Deactivate ${person.name}?`}
        message="They are signed out and cannot be given new work. Their history is kept, and this can be undone."
        confirmLabel="Deactivate"
        tone="danger"
        loading={pending}
      />
    </>
  );
}
