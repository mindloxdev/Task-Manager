"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, MailWarning, UserPlus } from "lucide-react";

import { inviteUserAction } from "@/app/actions/org";
import { Button } from "@/components/ui/button";
import { Checkbox, ErrorSummary, Field, Select, TextInput } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { USER_ROLES, USER_ROLE_LABEL, type UserRole } from "@/lib/enums";

/**
 * Invite flow.
 *
 * No email provider is configured by default, so the dialog hands the owner the
 * invitation link to pass on — it never claims an email was sent.
 */
export function InvitePanel({ teams }: { teams: { id: string; name: string }[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [role, setRole] = useState<UserRole>("EMPLOYEE");
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [weeklyHours, setWeeklyHours] = useState("40");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [issued, setIssued] = useState<{ email: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setEmail("");
    setName("");
    setJobTitle("");
    setRole("EMPLOYEE");
    setTeamIds([]);
    setWeeklyHours("40");
    setFieldErrors({});
    setIssued(null);
    setCopied(false);
  };

  const submit = () => {
    setFieldErrors({});
    startTransition(async () => {
      const result = await inviteUserAction({ email, name, jobTitle, role, teamIds, weeklyHours, timezone: "UTC" });
      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? { _form: [result.error] });
        toast({ tone: "error", title: "Could not send that invitation", description: result.error });
        return;
      }
      const absolute = `${window.location.origin}${result.data.inviteUrl}`;
      setIssued({ email: result.data.email, url: absolute });
      toast({ tone: "success", title: "Invitation created", description: "Share the link with them to finish setup." });
      router.refresh();
    });
  };

  const copy = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.url);
      setCopied(true);
      toast({ tone: "success", title: "Link copied" });
    } catch {
      toast({ tone: "error", title: "Could not copy", description: "Select the link and copy it manually." });
    }
  };

  return (
    <>
      <Button
        variant="primary"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <UserPlus className="size-3.5" aria-hidden="true" />
        Invite someone
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={issued ? "Invitation ready" : "Invite someone"}
        description={issued ? "They cannot sign in until they set a password." : undefined}
        footer={
          issued ? (
            <Button variant="primary" onClick={() => setOpen(false)}>
              Done
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={submit}
                loading={pending}
                disabled={email.trim().length === 0 || name.trim().length === 0}
              >
                Create invitation
              </Button>
            </>
          )
        }
      >
        {issued ? (
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-surface-2 p-3">
              <p className="text-xs font-semibold text-fg">Invitation link for {issued.email}</p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  readOnly
                  value={issued.url}
                  onFocus={(event) => event.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2.5 py-2 font-mono text-[11px] text-fg"
                  aria-label="Invitation link"
                />
                <Button variant="secondary" onClick={copy}>
                  {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
            <p className="flex items-start gap-2 rounded-md border border-risk/40 bg-risk-bg p-3 text-xs text-fg-muted">
              <MailWarning className="mt-0.5 size-3.5 shrink-0 text-risk" aria-hidden="true" />
              No email was sent — no mail provider is configured. Share this link yourself.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <ErrorSummary errors={fieldErrors} />
            <div id="field-name">
              <Field label="Full name" htmlFor="invite-name" required error={fieldErrors.name}>
                <TextInput
                  id="invite-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ruth Nakamura"
                  invalid={Boolean(fieldErrors.name)}
                />
              </Field>
            </div>
            <div id="field-email">
              <Field label="Work email" htmlFor="invite-email" required error={fieldErrors.email}>
                <TextInput
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="ruth@company.com"
                  invalid={Boolean(fieldErrors.email)}
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Job title" htmlFor="invite-title" error={fieldErrors.jobTitle}>
                <TextInput
                  id="invite-title"
                  value={jobTitle}
                  onChange={(event) => setJobTitle(event.target.value)}
                  placeholder="Junior Designer"
                />
              </Field>
              <Field label="Contracted hours a week" htmlFor="invite-hours" error={fieldErrors.weeklyHours}>
                <TextInput
                  id="invite-hours"
                  type="number"
                  min={1}
                  max={80}
                  value={weeklyHours}
                  onChange={(event) => setWeeklyHours(event.target.value)}
                />
              </Field>
            </div>
            <Field
              label="Role"
              htmlFor="invite-role"
              required
              hint={undefined}
            >
              <Select id="invite-role" value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
                {USER_ROLES.map((option) => (
                  <option key={option} value={option}>
                    {USER_ROLE_LABEL[option]}
                  </option>
                ))}
              </Select>
            </Field>
            {teams.length > 0 ? (
              <fieldset>
                <legend className="mb-1.5 text-xs font-semibold text-fg">Add to teams</legend>
                <div className="grid max-h-40 gap-1.5 overflow-y-auto sm:grid-cols-2">
                  {teams.map((team) => (
                    <Checkbox
                      key={team.id}
                      label={team.name}
                      checked={teamIds.includes(team.id)}
                      onChange={(event) =>
                        setTeamIds((current) =>
                          event.target.checked ? [...current, team.id] : current.filter((id) => id !== team.id),
                        )
                      }
                    />
                  ))}
                </div>

              </fieldset>
            ) : null}
          </div>
        )}
      </Modal>
    </>
  );
}
