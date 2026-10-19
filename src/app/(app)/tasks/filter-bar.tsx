"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Filter, LayoutGrid, Rows3, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, TextInput } from "@/components/ui/form";
import {
  TASK_HEALTH_LABEL,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  TASK_HEALTHS,
} from "@/lib/enums";
import { cn } from "@/lib/utils";

export type FilterOption = { id: string; name: string; color?: string };

const SCOPES = [
  { value: "ALL", label: "Everything I can see" },
  { value: "ASSIGNED_TO_ME", label: "Assigned to me" },
  { value: "CREATED_BY_ME", label: "I assigned it" },
  { value: "MY_TEAMS", label: "My teams" },
  { value: "NEEDS_MY_ACTION", label: "Needs my action" },
  { value: "AWAITING_REVIEW", label: "Awaiting review" },
] as const;

/**
 * Filter bar for the task list.
 *
 * Filters live in the URL, so the server does the filtering, the view is
 * shareable, and the browser Back button steps through filter changes the way
 * people expect.
 */
export function TaskFilterBar({
  teams,
  projects,
  people,
  view,
  total,
}: {
  teams: FilterOption[];
  projects: FilterOption[];
  people: FilterOption[];
  view: "table" | "cards";
  total: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [showMore, setShowMore] = useState(
    Boolean(searchParams.get("health") || searchParams.get("projectId") || searchParams.get("dueFrom") || searchParams.get("dueTo")),
  );

  useEffect(() => {
    setQuery(searchParams.get("q") ?? "");
  }, [searchParams]);

  const update = (changes: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    // Any filter change returns to the first page.
    if (!("page" in changes)) params.delete("page");
    startTransition(() => router.push(`/tasks?${params.toString()}`));
  };

  const multi = (key: string) => (searchParams.get(key) ?? "").split(",").filter(Boolean);

  const toggleMulti = (key: string, value: string) => {
    const current = multi(key);
    const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
    update({ [key]: next.join(",") });
  };

  const activeCount = useMemo(() => {
    let count = 0;
    for (const key of ["q", "status", "priority", "teamId", "projectId", "assigneeId", "health", "dueFrom", "dueTo"]) {
      if (searchParams.get(key)) count += 1;
    }
    if ((searchParams.get("scope") ?? "ALL") !== "ALL") count += 1;
    if (searchParams.get("includeArchived") === "true") count += 1;
    return count;
  }, [searchParams]);

  const statuses = multi("status");
  const priorities = multi("priority");
  const healths = multi("health");

  return (
    <div className="card mb-4">
      <div className="flex flex-wrap items-end gap-2.5 p-3">
        <form
          className="min-w-[13rem] flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            update({ q: query.trim() || null });
          }}
        >
          <label htmlFor="task-search" className="mb-1 block text-xs font-semibold text-fg">
            Search
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle"
              aria-hidden="true"
            />
            <TextInput
              id="task-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Title, description or task code…"
              className="pl-8"
            />
          </div>
        </form>

        <div className="w-full sm:w-52">
          <label htmlFor="scope" className="mb-1 block text-xs font-semibold text-fg">
            Scope
          </label>
          <Select id="scope" value={searchParams.get("scope") ?? "ALL"} onChange={(event) => update({ scope: event.target.value })}>
            {SCOPES.map((scope) => (
              <option key={scope.value} value={scope.value}>
                {scope.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="w-full sm:w-44">
          <label htmlFor="team" className="mb-1 block text-xs font-semibold text-fg">
            Team
          </label>
          <Select id="team" value={searchParams.get("teamId") ?? ""} onChange={(event) => update({ teamId: event.target.value })}>
            <option value="">All teams</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="w-full sm:w-44">
          <label htmlFor="assignee" className="mb-1 block text-xs font-semibold text-fg">
            Assignee
          </label>
          <Select
            id="assignee"
            value={searchParams.get("assigneeId") ?? ""}
            onChange={(event) => update({ assigneeId: event.target.value })}
          >
            <option value="">Anyone</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </Select>
        </div>

        <Button variant="secondary" onClick={() => setShowMore((current) => !current)} aria-expanded={showMore}>
          <Filter className="size-3.5" aria-hidden="true" />
          {showMore ? "Fewer filters" : "More filters"}
        </Button>

        <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
          <button
            type="button"
            onClick={() => update({ view: null })}
            className={cn(
              "rounded px-2 py-1.5 transition-colors",
              view === "table" ? "bg-primary-soft text-primary-soft-fg" : "text-fg-subtle hover:text-fg",
            )}
            aria-label="Table view"
            aria-pressed={view === "table"}
          >
            <Rows3 className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => update({ view: "cards" })}
            className={cn(
              "rounded px-2 py-1.5 transition-colors",
              view === "cards" ? "bg-primary-soft text-primary-soft-fg" : "text-fg-subtle hover:text-fg",
            )}
            aria-label="Card view"
            aria-pressed={view === "cards"}
          >
            <LayoutGrid className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {showMore ? (
        <div className="space-y-3 border-t border-border p-3">
          <ChipGroup
            legend="Status"
            options={TASK_STATUSES.map((status) => ({ value: status, label: TASK_STATUS_LABEL[status] }))}
            selected={statuses}
            onToggle={(value) => toggleMulti("status", value)}
            chipClass={(value) => `chip-${value}`}
          />
          <ChipGroup
            legend="Health"
            options={TASK_HEALTHS.filter((health) => health !== "COMPLETED").map((health) => ({
              value: health,
              label: TASK_HEALTH_LABEL[health],
            }))}
            selected={healths}
            onToggle={(value) => toggleMulti("health", value)}
            chipClass={(value) => `chip-${value === "BLOCKED" ? "BLOCKED" : value}`}
          />
          <ChipGroup
            legend="Priority"
            options={TASK_PRIORITIES.map((priority) => ({ value: priority, label: TASK_PRIORITY_LABEL[priority] }))}
            selected={priorities}
            onToggle={(value) => toggleMulti("priority", value)}
            chipClass={(value) => `chip-${value}`}
          />

          <div className="flex flex-wrap items-end gap-2.5">
            <div className="w-full sm:w-44">
              <label htmlFor="project" className="mb-1 block text-xs font-semibold text-fg">
                Project
              </label>
              <Select
                id="project"
                value={searchParams.get("projectId") ?? ""}
                onChange={(event) => update({ projectId: event.target.value })}
              >
                <option value="">All projects</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-full sm:w-40">
              <label htmlFor="dueFrom" className="mb-1 block text-xs font-semibold text-fg">
                Due from
              </label>
              <TextInput
                id="dueFrom"
                type="date"
                value={searchParams.get("dueFrom") ?? ""}
                onChange={(event) => update({ dueFrom: event.target.value })}
              />
            </div>
            <div className="w-full sm:w-40">
              <label htmlFor="dueTo" className="mb-1 block text-xs font-semibold text-fg">
                Due to
              </label>
              <TextInput
                id="dueTo"
                type="date"
                value={searchParams.get("dueTo") ?? ""}
                onChange={(event) => update({ dueTo: event.target.value })}
              />
            </div>
            <label className="flex h-10 items-center gap-2 text-xs font-medium text-fg-muted">
              <input
                type="checkbox"
                checked={searchParams.get("includeArchived") === "true"}
                onChange={(event) => update({ includeArchived: event.target.checked ? "true" : null })}
                className="size-4 accent-[var(--primary)]"
              />
              Include archived
            </label>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2">
        <p className="text-xs text-fg-muted" aria-live="polite">
          {pending ? "Filtering…" : `${total} ${total === 1 ? "task" : "tasks"} match`}
          {activeCount > 0 ? ` · ${activeCount} ${activeCount === 1 ? "filter" : "filters"} applied` : ""}
        </p>
        {activeCount > 0 ? (
          <Button size="sm" variant="ghost" onClick={() => startTransition(() => router.push("/tasks"))}>
            <X className="size-3.5" aria-hidden="true" />
            Clear all
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ChipGroup({
  legend,
  options,
  selected,
  onToggle,
  chipClass,
}: {
  legend: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  chipClass: (value: string) => string;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs font-semibold text-fg">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const active = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onToggle(option.value)}
              aria-pressed={active}
              className={cn(
                "chip border transition-colors",
                active ? `${chipClass(option.value)} border-current` : "border-border bg-surface text-fg-muted hover:bg-surface-2",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
