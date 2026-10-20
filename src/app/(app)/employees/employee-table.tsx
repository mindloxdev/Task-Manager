"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Search } from "lucide-react";

import { Avatar, EmptyState, Method, ProgressBar } from "@/components/ui/primitives";
import { TextInput } from "@/components/ui/form";
import type { EmployeeRow } from "@/server/services/users";
import { USER_ROLE_LABEL, USER_STATUS_LABEL, type UserRole, type UserStatus } from "@/lib/enums";
import { formatRelative } from "@/lib/dates";
import { cn, truncate } from "@/lib/utils";

type SortKey =
  | "name"
  | "activeTasks"
  | "completedTasks"
  | "overdueTasks"
  | "pendingUpdateRequests"
  | "workloadWeighted"
  | "onTimeRate";

const COLUMNS: { key: SortKey | null; label: string; numeric?: boolean; hideCompact?: boolean }[] = [
  { key: "name", label: "Person" },
  { key: null, label: "Teams", hideCompact: true },
  { key: "activeTasks", label: "Active", numeric: true },
  { key: "completedTasks", label: "Done", numeric: true },
  { key: "overdueTasks", label: "Overdue", numeric: true },
  { key: "pendingUpdateRequests", label: "Owes update", numeric: true },
  { key: "workloadWeighted", label: "Workload", numeric: true },
  { key: "onTimeRate", label: "On time", numeric: true, hideCompact: true },
  { key: null, label: "Latest update" },
];

/**
 * The searchable, sortable people table.
 *
 * Sorting and filtering happen in the browser here because the row set is one
 * company's staff — small, already authorised server-side, and better served by
 * an instant response than a round trip.
 */
export function EmployeeTable({
  employees,
  viewerRole,
  compact = false,
}: {
  employees: EmployeeRow[];
  viewerRole: UserRole;
  compact?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("workloadWeighted");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const maxLoad = useMemo(
    () => Math.max(1, ...employees.map((row) => row.workloadWeighted)),
    [employees],
  );

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? employees.filter((row) =>
          [row.name, row.email, row.jobTitle ?? "", ...row.teams.map((t) => t.name)]
            .join(" ")
            .toLowerCase()
            .includes(needle),
        )
      : employees;

    const sorted = [...filtered].sort((a, b) => {
      const factor = dir === "asc" ? 1 : -1;
      if (sort === "name") return a.name.localeCompare(b.name) * factor;
      return ((a[sort] as number) - (b[sort] as number)) * factor;
    });
    return compact ? sorted.slice(0, 8) : sorted;
  }, [employees, query, sort, dir, compact]);

  const toggleSort = (key: SortKey) => {
    if (sort === key) {
      setDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      setDir(key === "name" ? "asc" : "desc");
    }
  };

  const columns = COLUMNS.filter((column) => !(compact && column.hideCompact));

  return (
    <div>
      {!compact ? (
        <div className="border-b border-border p-3">
          <label htmlFor="employee-search" className="sr-only">
            Search people by name, email, job title or team
          </label>
          <div className="relative max-w-sm">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle"
              aria-hidden="true"
            />
            <TextInput
              id="employee-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search people…"
              className="pl-8"
            />
          </div>
          <p className="mt-1.5 text-[11px] text-fg-subtle" aria-live="polite">
            {rows.length} of {employees.length} {employees.length === 1 ? "person" : "people"}
          </p>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          compact
          title="Nobody matches that search"
          description={undefined}
        />
      ) : (
        <div className="scroll-x">
          <table className="stack-table w-full border-collapse text-left">
            <caption className="sr-only">People, their workload and their recent reporting</caption>
            <thead>
              <tr className="border-b border-border">
                {columns.map((column) => {
                  const active = column.key !== null && column.key === sort;
                  return (
                    <th
                      key={column.label}
                      scope="col"
                      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
                      className={cn(
                        "whitespace-nowrap px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-fg-subtle",
                        column.numeric && "text-right",
                      )}
                    >
                      {column.key ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(column.key as SortKey)}
                          className={cn(
                            "inline-flex items-center gap-1 transition-colors hover:text-fg",
                            active && "text-primary",
                          )}
                        >
                          {column.label}
                          {active ? (
                            dir === "asc" ? (
                              <ArrowUp className="size-3" aria-hidden="true" />
                            ) : (
                              <ArrowDown className="size-3" aria-hidden="true" />
                            )
                          ) : null}
                        </button>
                      ) : (
                        column.label
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="row-hover border-b border-border last:border-0 hover:bg-surface-2">
                  <td className="px-3 py-2.5">
                    <Link href={`/employees/${row.id}`} className="flex items-center gap-2.5 group">
                      <Avatar name={row.name} color={row.avatarColor} size="md" />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold text-fg group-hover:text-primary group-hover:underline">
                          {row.name}
                        </span>
                        <span className="block truncate text-[10px] text-fg-subtle">
                          {row.jobTitle ?? USER_ROLE_LABEL[row.role as UserRole]}
                          {row.status !== "ACTIVE" ? ` · ${USER_STATUS_LABEL[row.status as UserStatus]}` : ""}
                        </span>
                      </span>
                    </Link>
                  </td>
                  {!compact ? (
                    <td data-label="Teams" className="px-3 py-2.5">
                      <span className="flex flex-wrap gap-1">
                        {row.teams.length === 0 ? (
                          <span className="text-[11px] text-fg-subtle">No team</span>
                        ) : (
                          row.teams.map((team) => (
                            <span
                              key={team.id}
                              className="chip bg-surface-2 text-fg-muted"
                              title={team.role === "LEAD" ? `${team.name} (lead)` : team.name}
                            >
                              <span className="size-1.5 rounded-full" style={{ backgroundColor: team.color }} aria-hidden="true" />
                              {team.name}
                              {team.role === "LEAD" ? " ★" : ""}
                            </span>
                          ))
                        )}
                      </span>
                    </td>
                  ) : null}
                  <td data-label="Active" className="tnum px-3 py-2.5 text-right text-xs font-semibold text-fg">{row.activeTasks}</td>
                  <td data-label="Done" className="tnum px-3 py-2.5 text-right text-xs text-fg-muted">{row.completedTasks}</td>
                  <td data-label="Overdue" className="tnum px-3 py-2.5 text-right text-xs">
                    <span className={row.overdueTasks > 0 ? "font-bold text-overdue" : "text-fg-muted"}>
                      {row.overdueTasks}
                    </span>
                  </td>
                  <td data-label="Owes update" className="tnum px-3 py-2.5 text-right text-xs">
                    <span className={row.pendingUpdateRequests > 0 ? "font-bold text-risk" : "text-fg-muted"}>
                      {row.pendingUpdateRequests}
                    </span>
                  </td>
                  <td data-label="Workload" className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-2 max-md:justify-start">
                      <div className="w-16">
                        <ProgressBar
                          value={(row.workloadWeighted / maxLoad) * 100}
                          tone="IN_PROGRESS"
                          size="sm"
                          label={`${row.name} workload: ${row.workloadWeighted} weighted open tasks`}
                        />
                      </div>
                      <span className="tnum w-8 text-right text-xs font-semibold text-fg-muted">{row.workloadWeighted}</span>
                    </div>
                  </td>
                  {!compact ? (
                    <td data-label="On time" className="tnum px-3 py-2.5 text-right text-xs text-fg-muted">
                      {row.completedTasks > 0 ? `${row.onTimeRate}%` : "—"}
                    </td>
                  ) : null}
                  <td data-label="Latest update" className="px-3 py-2.5">
                    {row.latestUpdate ? (
                      <div className="min-w-0 max-w-[16rem]">
                        <p className="truncate text-[11px] text-fg-muted">
                          {row.latestUpdate.excerpt ? truncate(row.latestUpdate.excerpt, 60) : `${row.latestUpdate.progress}%`}
                        </p>
                        <p className="text-[10px] text-fg-subtle">
                          <span className="tnum font-mono">{row.latestUpdate.taskCode}</span> ·{" "}
                          {formatRelative(row.latestUpdate.createdAt)}
                        </p>
                      </div>
                    ) : (
                      <p className="text-[11px] text-fg-subtle">No reports yet</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!compact ? (
        <div className="border-t border-border px-3 pb-3">
          <Method>
            Workload = open tasks weighted by priority (Low 1 → Urgent 4), split across shared tasks. On time is
            measured against the original deadline. Neither is a productivity score.
            {viewerRole === "MANAGER" ? " Showing the teams you lead." : ""}
          </Method>
        </div>
      ) : null}
    </div>
  );
}
