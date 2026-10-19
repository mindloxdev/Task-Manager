"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { createTeamAction } from "@/app/actions/org";
import { Button } from "@/components/ui/button";
import { ErrorSummary, Field, TextArea, TextInput } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { Avatar } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Person = { id: string; name: string; jobTitle: string | null; avatarColor: string; role: string };

const COLORS = ["#0F766E", "#1D4ED8", "#7E22CE", "#C2410C", "#B91C1C", "#15803D", "#0E7490", "#A16207"];

export function CreateTeamButton({ people }: { people: Person[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [leadIds, setLeadIds] = useState<string[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const reset = () => {
    setName("");
    setDescription("");
    setColor(COLORS[0]);
    setLeadIds([]);
    setMemberIds([]);
    setFieldErrors({});
  };

  const submit = () => {
    setFieldErrors({});
    startTransition(async () => {
      const result = await createTeamAction({ name, description, color, leadIds, memberIds });
      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? { _form: [result.error] });
        toast({ tone: "error", title: "Could not create the team", description: result.error });
        return;
      }
      toast({ tone: "success", title: `${name} created`, description: "Members have been notified." });
      setOpen(false);
      reset();
      router.push(`/teams/${result.data.id}`);
    });
  };

  const toggle = (list: string[], setList: (next: string[]) => void, id: string) => {
    setList(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  };

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" aria-hidden="true" />
        New team
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create a team"
        description={undefined}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} loading={pending} disabled={name.trim().length === 0}>
              Create team
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <ErrorSummary errors={fieldErrors} />

          <div id="field-name">
            <Field label="Team name" htmlFor="team-name" required error={fieldErrors.name}>
              <TextInput
                id="team-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Customer Success"
                maxLength={80}
                invalid={Boolean(fieldErrors.name)}
              />
            </Field>
          </div>

          <Field label="Description" htmlFor="team-description" error={fieldErrors.description}>
            <TextArea
              id="team-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              placeholder="Onboarding, support escalations and renewals."
            />
          </Field>

          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold text-fg">Colour</legend>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setColor(option)}
                  aria-label={`Use colour ${option}`}
                  aria-pressed={color === option}
                  className={cn(
                    "size-8 rounded-md border-2 transition-transform",
                    color === option ? "border-fg scale-110" : "border-transparent",
                  )}
                  style={{ backgroundColor: option }}
                />
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold text-fg">
              Team leads
            </legend>
            <PeopleGrid people={people} selected={leadIds} onToggle={(id) => toggle(leadIds, setLeadIds, id)} tone="primary" />
          </fieldset>

          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold text-fg">Members</legend>
            <PeopleGrid
              people={people.filter((person) => !leadIds.includes(person.id))}
              selected={memberIds}
              onToggle={(id) => toggle(memberIds, setMemberIds, id)}
              tone="neutral"
            />
          </fieldset>
        </div>
      </Modal>
    </>
  );
}

function PeopleGrid({
  people,
  selected,
  onToggle,
  tone,
}: {
  people: Person[];
  selected: string[];
  onToggle: (id: string) => void;
  tone: "primary" | "neutral";
}) {
  if (people.length === 0) {
    return <p className="rounded-md border border-border bg-surface-2 p-2.5 text-xs text-fg-muted">Nobody available.</p>;
  }
  return (
    <div className="grid max-h-48 gap-1.5 overflow-y-auto rounded-md border border-border p-1.5 sm:grid-cols-2">
      {people.map((person) => {
        const active = selected.includes(person.id);
        return (
          <button
            key={person.id}
            type="button"
            onClick={() => onToggle(person.id)}
            aria-pressed={active}
            className={cn(
              "flex items-center gap-2 rounded-md border p-2 text-left transition-colors",
              active
                ? tone === "primary"
                  ? "border-primary bg-primary-soft"
                  : "border-border-strong bg-surface-2"
                : "border-border bg-surface hover:bg-surface-2",
            )}
          >
            <Avatar name={person.name} color={person.avatarColor} size="sm" />
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold text-fg">{person.name}</span>
              <span className="block truncate text-[10px] text-fg-subtle">{person.jobTitle ?? person.role}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
