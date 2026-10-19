"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ListChecks, Link2, Plus, Save, Send, Trash2, Users } from "lucide-react";

import { createTaskAction } from "@/app/actions/tasks";
import { Button } from "@/components/ui/button";
import { Avatar, Card, CardHeader } from "@/components/ui/primitives";
import { Checkbox, ErrorSummary, Field, RadioCard, Select, TextArea, TextInput } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import {
  ASSIGNMENT_TYPE_LABEL,
  COMPLETION_RULES,
  COMPLETION_RULE_LABEL,
  PROGRESS_MODE_LABEL,
  RECURRENCES,
  RECURRENCE_LABEL,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  UPDATE_CADENCES,
  UPDATE_CADENCE_LABEL,
  type AssignmentType,
  type CompletionRule,
  type ProgressMode,
  type Recurrence,
  type TaskPriority,
  type UpdateCadence,
} from "@/lib/enums";
import { cn, isValidHttpUrl } from "@/lib/utils";

export type TeamOption = {
  id: string;
  name: string;
  color: string;
  memberships: { userId: string; role: string; user: { id: string; name: string; avatarColor: string; jobTitle: string | null } }[];
};

export type PersonOption = { id: string; name: string; jobTitle: string | null; avatarColor: string; email: string };

export type ProjectOption = { id: string; name: string; key: string; teamId: string | null };

type SubtaskDraft = { id: number; title: string };
type LinkDraft = { id: number; label: string; url: string };

/**
 * Task creation form.
 *
 * Long by necessity, so it is staged: the essentials are open, and planning,
 * accountability rules and the checklist are behind disclosures. Validation
 * happens on the server against the same schema; its messages land next to the
 * field they belong to, with a summary at the top for keyboard users.
 */
export function TaskForm({
  teams,
  people,
  projects,
  defaults,
}: {
  teams: TeamOption[];
  people: PersonOption[];
  projects: ProjectOption[];
  defaults: { reviewRequired: boolean; updateCadence: UpdateCadence };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [instruction, setInstruction] = useState("");
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [projectId, setProjectId] = useState("");
  const [assignmentType, setAssignmentType] = useState<AssignmentType>("INDIVIDUAL");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [optionalAssigneeIds, setOptionalAssigneeIds] = useState<string[]>([]);
  const [primaryOwnerId, setPrimaryOwnerId] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("NORMAL");
  const [startDate, setStartDate] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [estimateHours, setEstimateHours] = useState("");
  const [category, setCategory] = useState("");
  const [reviewRequired, setReviewRequired] = useState(defaults.reviewRequired);
  const [completionRule, setCompletionRule] = useState<CompletionRule>("ALL_REQUIRED");
  const [progressMode, setProgressMode] = useState<ProgressMode>("MANUAL");
  const [updateCadence, setUpdateCadence] = useState<UpdateCadence>(defaults.updateCadence);
  const [recurrence, setRecurrence] = useState<Recurrence>("NONE");
  const [subtasks, setSubtasks] = useState<SubtaskDraft[]>([]);
  const [links, setLinks] = useState<LinkDraft[]>([]);
  const [showPlanning, setShowPlanning] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showExtras, setShowExtras] = useState(false);

  const selectedTeam = teams.find((team) => team.id === teamId);

  // Candidates are the chosen team's active members; owners may also pick from
  // the whole company when no team is set.
  const candidates = useMemo(() => {
    if (selectedTeam) {
      const ids = new Set(selectedTeam.memberships.map((m) => m.userId));
      return people.filter((person) => ids.has(person.id));
    }
    return people;
  }, [selectedTeam, people]);

  const teamProjects = useMemo(
    () => projects.filter((project) => !project.teamId || project.teamId === teamId),
    [projects, teamId],
  );

  const chosen = assignmentType === "TEAM" ? candidates.map((person) => person.id) : assigneeIds;

  const toggleAssignee = (id: string) => {
    setFieldErrors((current) => ({ ...current, assigneeIds: [] }));
    if (assignmentType === "INDIVIDUAL") {
      setAssigneeIds([id]);
      setPrimaryOwnerId(id);
      return;
    }
    setAssigneeIds((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      if (!next.includes(primaryOwnerId)) setPrimaryOwnerId("");
      return next;
    });
  };

  const submit = (asDraft: boolean) => {
    setFieldErrors({});
    setFormError(null);

    const badLink = links.find((link) => link.url.trim().length > 0 && !isValidHttpUrl(link.url.trim()));
    if (badLink) {
      setFieldErrors({ links: ["Enter full http(s) links, or remove the row."] });
      return;
    }

    startTransition(async () => {
      const result = await createTaskAction({
        title,
        description,
        instruction,
        priority,
        assignmentType,
        completionRule,
        progressMode,
        updateCadence,
        recurrence,
        reviewRequired,
        teamId: teamId || null,
        projectId: projectId || null,
        assigneeIds: assignmentType === "TEAM" ? [] : assigneeIds,
        optionalAssigneeIds,
        primaryOwnerId: primaryOwnerId || null,
        startDate: startDate || null,
        dueAt: dueAt || null,
        estimateHours: estimateHours === "" ? null : estimateHours,
        category,
        subtasks: subtasks.filter((row) => row.title.trim()).map((row) => ({ title: row.title.trim(), isDone: false })),
        links: links
          .filter((row) => row.url.trim())
          .map((row) => ({ url: row.url.trim(), label: row.label.trim() || null })),
        asDraft,
      });

      if (!result.ok) {
        setFormError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        // Put the keyboard back where the problem is.
        document.getElementById("task-form-errors")?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }

      toast({
        tone: "success",
        title: asDraft ? `Draft ${result.data.code} saved` : `${result.data.code} assigned`,
        description: asDraft
          ? "It stays private until you assign it."
          : "Everyone involved has been notified in the app.",
      });
      router.push(`/tasks/${result.data.id}`);
    });
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit(false);
      }}
      noValidate
    >
      <div id="task-form-errors">
        <ErrorSummary errors={fieldErrors} />
        {formError && Object.keys(fieldErrors).length === 0 ? (
          <div className="rounded-md border border-overdue/40 bg-overdue-bg p-3 text-xs font-medium text-overdue" role="alert">
            {formError}
          </div>
        ) : null}
      </div>

      {/* ---------------------------------------------------------------- */}
      <Card>
        <CardHeader title="The work" description={undefined} />
        <div className="space-y-4 p-4">
          <div id="field-title">
            <Field label="Task title" htmlFor="title" required error={fieldErrors.title}>
              <TextInput
                id="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ship SSO support for enterprise accounts"
                maxLength={160}
                required
                autoFocus
                invalid={Boolean(fieldErrors.title)}
              />
            </Field>
          </div>

          <div id="field-description">
            <Field
              label="Description"
              htmlFor="description"
              hint={undefined}
              error={fieldErrors.description}
            >
              <TextArea
                id="description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={5}
                placeholder="Enterprise customers need SAML sign-in. Implement the identity provider handshake, map groups to roles, and document the setup flow."
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div id="field-priority">
              <Field label="Priority" htmlFor="priority" required>
                <Select id="priority" value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>
                  {TASK_PRIORITIES.map((option) => (
                    <option key={option} value={option}>
                      {TASK_PRIORITY_LABEL[option]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div id="field-category">
              <Field label="Category" htmlFor="category" hint={undefined} error={fieldErrors.category}>
                <TextInput
                  id="category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  placeholder="Platform, Bug, Campaign…"
                  maxLength={80}
                />
              </Field>
            </div>
          </div>
        </div>
      </Card>

      {/* ---------------------------------------------------------------- */}
      <Card>
        <CardHeader title="Who is accountable" description={undefined} />
        <div className="space-y-4 p-4">
          <div id="field-teamId">
            <Field
              label="Team"
              htmlFor="teamId"
              required={assignmentType === "TEAM"}
              hint={undefined}
              error={fieldErrors.teamId}
            >
              <Select
                id="teamId"
                value={teamId}
                onChange={(event) => {
                  setTeamId(event.target.value);
                  setAssigneeIds([]);
                  setOptionalAssigneeIds([]);
                  setPrimaryOwnerId("");
                  setProjectId("");
                }}
                invalid={Boolean(fieldErrors.teamId)}
              >
                <option value="">No team</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name} ({team.memberships.length} active)
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold text-fg">Assignment type</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {(["INDIVIDUAL", "MULTIPLE", "TEAM"] as AssignmentType[]).map((option) => (
                <RadioCard
                  key={option}
                  name="assignmentType"
                  value={option}
                  checked={assignmentType === option}
                  onChange={(value) => {
                    const next = value as AssignmentType;
                    setAssignmentType(next);
                    if (next === "INDIVIDUAL") {
                      setAssigneeIds((current) => current.slice(0, 1));
                      setCompletionRule("ALL_REQUIRED");
                    }
                    if (next === "TEAM") setAssigneeIds([]);
                  }}
                  title={ASSIGNMENT_TYPE_LABEL[option]}
                  description={
                    option === "INDIVIDUAL"
                      ? "One accountable owner."
                      : option === "MULTIPLE"
                        ? "Each reports their own progress."
                        : "Everyone active in the team."
                  }
                  disabled={option === "TEAM" && !teamId}
                />
              ))}
            </div>
          </fieldset>

          {assignmentType === "TEAM" ? (
            <div className="rounded-md border border-primary/30 bg-primary-soft p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-primary-soft-fg">
                <Users className="size-3.5" aria-hidden="true" />
                {selectedTeam ? `All ${candidates.length} active members of ${selectedTeam.name}` : "Choose a team first"}
              </p>
              <p className="mt-1 text-[11px] text-primary-soft-fg/85">
                Each person&rsquo;s progress is tracked separately.
              </p>
              {candidates.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {candidates.map((person) => (
                    <li key={person.id} className="chip bg-surface text-fg-muted">
                      <Avatar name={person.name} color={person.avatarColor} size="xs" />
                      {person.name}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <div id="field-assigneeIds">
              <Field
                label={assignmentType === "INDIVIDUAL" ? "Assignee" : "Assignees"}
                required
                hint={
                  assignmentType === "INDIVIDUAL" ? undefined : "Everyone here must finish their part."
                }
                error={fieldErrors.assigneeIds}
              >
                {candidates.length === 0 ? (
                  <p className="rounded-md border border-border bg-surface-2 p-3 text-xs text-fg-muted">
                    {teamId
                      ? "That team has no active members. Add people to the team first."
                      : "No active people are available to you."}
                  </p>
                ) : (
                  <div
                    role={assignmentType === "INDIVIDUAL" ? "radiogroup" : "group"}
                    className="grid max-h-72 gap-1.5 overflow-y-auto rounded-md border border-border p-1.5 sm:grid-cols-2"
                  >
                    {candidates.map((person) => {
                      const selected = assigneeIds.includes(person.id);
                      const optional = optionalAssigneeIds.includes(person.id);
                      return (
                        <div
                          key={person.id}
                          className={cn(
                            "flex items-center gap-2 rounded-md border p-2 transition-colors",
                            selected
                              ? "border-primary bg-primary-soft"
                              : optional
                                ? "border-border-strong bg-surface-2"
                                : "border-border bg-surface hover:bg-surface-2",
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => toggleAssignee(person.id)}
                            aria-pressed={selected}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          >
                            <Avatar name={person.name} color={person.avatarColor} size="sm" />
                            <span className="min-w-0">
                              <span
                                className={cn(
                                  "block truncate text-xs font-semibold",
                                  selected ? "text-primary-soft-fg" : "text-fg",
                                )}
                              >
                                {person.name}
                              </span>
                              <span className="block truncate text-[10px] text-fg-subtle">
                                {person.jobTitle ?? person.email}
                              </span>
                            </span>
                          </button>
                          {assignmentType === "MULTIPLE" && !selected ? (
                            <button
                              type="button"
                              onClick={() =>
                                setOptionalAssigneeIds((current) =>
                                  current.includes(person.id)
                                    ? current.filter((item) => item !== person.id)
                                    : [...current, person.id],
                                )
                              }
                              aria-pressed={optional}
                              className="chip border border-border text-[10px] text-fg-muted hover:bg-surface-3"
                              title="Add as an optional collaborator — they can help but are not required to finish"
                            >
                              {optional ? "Optional ✓" : "Optional"}
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Field>
            </div>
          )}

          {chosen.length > 1 ? (
            <div id="field-primaryOwnerId">
              <Field
                label="Primary owner"
                htmlFor="primaryOwnerId"
                hint="Answerable for the final result."
                error={fieldErrors.primaryOwnerId}
              >
                <Select
                  id="primaryOwnerId"
                  value={primaryOwnerId}
                  onChange={(event) => setPrimaryOwnerId(event.target.value)}
                  invalid={Boolean(fieldErrors.primaryOwnerId)}
                >
                  <option value="">No single owner</option>
                  {candidates
                    .filter((person) => chosen.includes(person.id))
                    .map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                </Select>
              </Field>
            </div>
          ) : null}
        </div>
      </Card>

      {/* ---------------------------------------------------------------- */}
      <Card>
        <CardHeader title="Dates and effort" description={undefined} />
        <div className="grid gap-4 p-4 sm:grid-cols-3">
          <div id="field-startDate">
            <Field label="Start date" htmlFor="startDate" error={fieldErrors.startDate}>
              <TextInput id="startDate" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </Field>
          </div>
          <div id="field-dueAt">
            <Field
              label="Deadline"
              htmlFor="dueAt"
              hint="UTC"
              error={fieldErrors.dueAt}
            >
              <TextInput
                id="dueAt"
                type="datetime-local"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
                invalid={Boolean(fieldErrors.dueAt)}
              />
            </Field>
          </div>
          <div id="field-estimateHours">
            <Field label="Estimated hours" htmlFor="estimateHours" error={fieldErrors.estimateHours}>
              <TextInput
                id="estimateHours"
                type="number"
                min={0}
                step={0.5}
                value={estimateHours}
                onChange={(event) => setEstimateHours(event.target.value)}
                placeholder="16"
              />
            </Field>
          </div>
        </div>
      </Card>

      {/* ---------------------------------------------------------------- */}
      <Disclosure
        open={showRules}
        onToggle={() => setShowRules((current) => !current)}
        title="Accountability rules"
        summary={`${reviewRequired ? "Review required" : "No review"} · ${UPDATE_CADENCE_LABEL[updateCadence]} · ${PROGRESS_MODE_LABEL[progressMode]}`}
      >
        <div className="space-y-4">
          <Checkbox
            label="Require my review before this counts as complete"
            description="Nobody can approve their own submission."
            checked={reviewRequired}
            onChange={(event) => setReviewRequired(event.target.checked)}
          />

          {chosen.length > 1 ? (
            <Field label="Completion rule" htmlFor="completionRule" hint={undefined}>
              <Select
                id="completionRule"
                value={completionRule}
                onChange={(event) => setCompletionRule(event.target.value as CompletionRule)}
              >
                {COMPLETION_RULES.map((rule) => (
                  <option key={rule} value={rule}>
                    {COMPLETION_RULE_LABEL[rule]}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Field
            label="How progress is measured"
            htmlFor="progressMode"
            hint={undefined}
          >
            <Select
              id="progressMode"
              value={progressMode}
              onChange={(event) => setProgressMode(event.target.value as ProgressMode)}
            >
              <option value="MANUAL">{PROGRESS_MODE_LABEL.MANUAL}</option>
              <option value="CHECKLIST">{PROGRESS_MODE_LABEL.CHECKLIST}</option>
            </Select>
          </Field>

          <Field label="Update expectations" htmlFor="updateCadence" hint={undefined}>
            <Select
              id="updateCadence"
              value={updateCadence}
              onChange={(event) => setUpdateCadence(event.target.value as UpdateCadence)}
            >
              {UPDATE_CADENCES.map((cadence) => (
                <option key={cadence} value={cadence}>
                  {UPDATE_CADENCE_LABEL[cadence]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Repeat" htmlFor="recurrence" hint="The next occurrence opens on approval.">
            <Select id="recurrence" value={recurrence} onChange={(event) => setRecurrence(event.target.value as Recurrence)}>
              {RECURRENCES.map((option) => (
                <option key={option} value={option}>
                  {RECURRENCE_LABEL[option]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Disclosure>

      {/* ---------------------------------------------------------------- */}
      <Disclosure
        open={showPlanning}
        onToggle={() => setShowPlanning((current) => !current)}
        title="Project and instructions"
        summary={projectId ? (teamProjects.find((p) => p.id === projectId)?.name ?? "Project set") : "No project"}
      >
        <div className="space-y-4">
          <Field label="Project" htmlFor="projectId">
            <Select id="projectId" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">No project</option>
              {teamProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.key} — {project.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Additional instructions"
            htmlFor="instruction"
            hint={undefined}
            error={fieldErrors.instruction}
          >
            <TextArea
              id="instruction"
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              rows={3}
              placeholder="Post a short update at the end of each day, even if the answer is no change."
            />
          </Field>
        </div>
      </Disclosure>

      {/* ---------------------------------------------------------------- */}
      <Disclosure
        open={showExtras}
        onToggle={() => setShowExtras((current) => !current)}
        title="Checklist and reference links"
        summary={`${subtasks.length} checklist ${subtasks.length === 1 ? "item" : "items"} · ${links.length} ${links.length === 1 ? "link" : "links"}`}
      >
        <div className="space-y-5">
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-fg">
              <ListChecks className="size-3.5" aria-hidden="true" />
              Checklist
            </p>
            {progressMode === "CHECKLIST" ? (
              <p className="mb-2 rounded-md bg-primary-soft p-2 text-[11px] text-primary-soft-fg">
                Progress is counted from these items.
              </p>
            ) : null}
            <ul className="space-y-1.5">
              {subtasks.map((subtask, index) => (
                <li key={subtask.id} className="flex items-center gap-2">
                  <span className="tnum w-5 text-right text-[10px] text-fg-subtle">{index + 1}.</span>
                  <TextInput
                    value={subtask.title}
                    onChange={(event) =>
                      setSubtasks((current) =>
                        current.map((row) => (row.id === subtask.id ? { ...row, title: event.target.value } : row)),
                      )
                    }
                    placeholder="Metadata exchange"
                    maxLength={200}
                    aria-label={`Checklist item ${index + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => setSubtasks((current) => current.filter((row) => row.id !== subtask.id))}
                    className="rounded-md p-2 text-fg-subtle transition-colors hover:bg-overdue-bg hover:text-overdue"
                    aria-label={`Remove checklist item ${index + 1}`}
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="mt-2"
              onClick={() => setSubtasks((current) => [...current, { id: Date.now(), title: "" }])}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              Add checklist item
            </Button>
          </div>

          <div id="field-links">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-fg">
              <Link2 className="size-3.5" aria-hidden="true" />
              Reference links
            </p>
            {fieldErrors.links ? (
              <p className="mb-2 text-xs font-medium text-overdue" role="alert">
                {fieldErrors.links[0]}
              </p>
            ) : null}
            <ul className="space-y-1.5">
              {links.map((link, index) => (
                <li key={link.id} className="flex flex-wrap items-center gap-2">
                  <TextInput
                    value={link.label}
                    onChange={(event) =>
                      setLinks((current) => current.map((row) => (row.id === link.id ? { ...row, label: event.target.value } : row)))
                    }
                    placeholder="Label"
                    className="w-full sm:w-40"
                    aria-label={`Link ${index + 1} label`}
                  />
                  <TextInput
                    value={link.url}
                    onChange={(event) =>
                      setLinks((current) => current.map((row) => (row.id === link.id ? { ...row, url: event.target.value } : row)))
                    }
                    placeholder="https://…"
                    type="url"
                    className="min-w-0 flex-1"
                    aria-label={`Link ${index + 1} address`}
                  />
                  <button
                    type="button"
                    onClick={() => setLinks((current) => current.filter((row) => row.id !== link.id))}
                    className="rounded-md p-2 text-fg-subtle transition-colors hover:bg-overdue-bg hover:text-overdue"
                    aria-label={`Remove link ${index + 1}`}
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="mt-2"
              onClick={() => setLinks((current) => [...current, { id: Date.now(), label: "", url: "" }])}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              Add a link
            </Button>
            <p className="mt-2 text-[11px] text-fg-subtle">Files can be attached once the task exists.</p>
          </div>
        </div>
      </Disclosure>

      {/* ---------------------------------------------------------------- */}
      <div className="sticky bottom-0 -mx-3 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface/95 px-3 py-3 backdrop-blur sm:-mx-5 sm:px-5">
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button type="button" variant="secondary" onClick={() => submit(true)} loading={pending}>
          <Save className="size-3.5" aria-hidden="true" />
          Save as draft
        </Button>
        <Button type="submit" variant="primary" size="lg" loading={pending}>
          <Send className="size-4" aria-hidden="true" />
          Assign now
        </Button>
      </div>
    </form>
  );
}

function Disclosure({
  open,
  onToggle,
  title,
  summary,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-fg">{title}</span>
          <span className="mt-0.5 block truncate text-xs text-fg-muted">{summary}</span>
        </span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-fg-subtle transition-transform duration-200", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      {open ? <div className="border-t border-border p-4">{children}</div> : null}
    </Card>
  );
}
