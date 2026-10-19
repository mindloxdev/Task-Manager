"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { createProjectAction } from "@/app/actions/org";
import { Button } from "@/components/ui/button";
import { ErrorSummary, Field, Select, TextArea, TextInput } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { slugify } from "@/lib/utils";

export function CreateProjectButton({ teams }: { teams: { id: string; name: string }[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const submit = () => {
    setFieldErrors({});
    startTransition(async () => {
      const result = await createProjectAction({ name, key, description, teamId: teamId || null, color: "#4F46E5" });
      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? { _form: [result.error] });
        toast({ tone: "error", title: "Could not create the project", description: result.error });
        return;
      }
      toast({ tone: "success", title: `${name} created` });
      setOpen(false);
      setName("");
      setKey("");
      setDescription("");
      router.refresh();
    });
  };

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" aria-hidden="true" />
        New project
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create a project"
        description={undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={submit}
              loading={pending}
              disabled={name.trim().length === 0 || key.trim().length < 2}
            >
              Create project
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <ErrorSummary errors={fieldErrors} />
          <div id="field-name">
            <Field label="Project name" htmlFor="project-name" required error={fieldErrors.name}>
              <TextInput
                id="project-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  // Suggest a key from the name until the user edits it themselves.
                  if (!key || key === suggestKey(name)) setKey(suggestKey(event.target.value));
                }}
                placeholder="Platform foundations"
                invalid={Boolean(fieldErrors.name)}
              />
            </Field>
          </div>
          <div id="field-key">
            <Field
              label="Short key"
              htmlFor="project-key"
              required
              hint="2–8 letters or digits, unique."
              error={fieldErrors.key}
            >
              <TextInput
                id="project-key"
                value={key}
                onChange={(event) => setKey(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
                placeholder="PLAT"
                className="font-mono"
                invalid={Boolean(fieldErrors.key)}
              />
            </Field>
          </div>
          <Field label="Description" htmlFor="project-description" error={fieldErrors.description}>
            <TextArea
              id="project-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              placeholder="API, data model and infrastructure."
            />
          </Field>
          <Field label="Owning team" htmlFor="project-team">
            <Select id="project-team" value={teamId} onChange={(event) => setTeamId(event.target.value)}>
              <option value="">No owning team</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>
    </>
  );
}

function suggestKey(name: string): string {
  const words = slugify(name).split("-").filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return words
    .slice(0, 4)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}
