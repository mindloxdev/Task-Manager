"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { Select, TextInput } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";

const PRESETS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

const EXPORTS = [
  { kind: "tasks", label: "Tasks" },
  { kind: "employees", label: "People" },
  { kind: "teams", label: "Teams" },
  { kind: "progress", label: "Progress reports" },
  { kind: "blockers", label: "Blockers" },
  { kind: "late", label: "Late completions" },
] as const;

/**
 * Date range, scope and export controls.
 *
 * The range lives in the URL so a report can be bookmarked or sent to someone
 * else and show exactly the same numbers.
 */
export function ReportControls({
  teams,
  projects,
  from,
  to,
  teamId,
  projectId,
  exportQuery,
}: {
  teams: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  from: string;
  to: string;
  teamId: string | null;
  projectId: string | null;
  exportQuery: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [localFrom, setLocalFrom] = useState(from);
  const [localTo, setLocalTo] = useState(to);

  const apply = (changes: Record<string, string | null>) => {
    const params = new URLSearchParams();
    params.set("from", changes.from ?? localFrom);
    params.set("to", changes.to ?? localTo);
    const nextTeam = changes.teamId === undefined ? teamId : changes.teamId;
    const nextProject = changes.projectId === undefined ? projectId : changes.projectId;
    if (nextTeam) params.set("teamId", nextTeam);
    if (nextProject) params.set("projectId", nextProject);
    startTransition(() => router.push(`/reports?${params.toString()}`));
  };

  const preset = (days: number) => {
    const end = new Date();
    const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    const nextFrom = start.toISOString().slice(0, 10);
    const nextTo = end.toISOString().slice(0, 10);
    setLocalFrom(nextFrom);
    setLocalTo(nextTo);
    apply({ from: nextFrom, to: nextTo });
  };

  return (
    <Card>
      <div className="flex flex-wrap items-end gap-2.5 p-3">
        <div className="w-full sm:w-40">
          <label htmlFor="report-from" className="mb-1 block text-xs font-semibold text-fg">
            From
          </label>
          <TextInput
            id="report-from"
            type="date"
            value={localFrom}
            max={localTo}
            onChange={(event) => setLocalFrom(event.target.value)}
          />
        </div>
        <div className="w-full sm:w-40">
          <label htmlFor="report-to" className="mb-1 block text-xs font-semibold text-fg">
            To
          </label>
          <TextInput
            id="report-to"
            type="date"
            value={localTo}
            min={localFrom}
            onChange={(event) => setLocalTo(event.target.value)}
          />
        </div>
        <Button variant="primary" loading={pending} onClick={() => apply({})}>
          Apply range
        </Button>

        <div className="flex items-center gap-1.5">
          {PRESETS.map((item) => (
            <Button key={item.label} size="sm" variant="secondary" onClick={() => preset(item.days)}>
              {item.label}
            </Button>
          ))}
        </div>

        <div className="w-full sm:w-44">
          <label htmlFor="report-team" className="mb-1 block text-xs font-semibold text-fg">
            Team
          </label>
          <Select
            id="report-team"
            value={teamId ?? ""}
            onChange={(event) => apply({ teamId: event.target.value || null })}
          >
            <option value="">All teams I can see</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="w-full sm:w-44">
          <label htmlFor="report-project" className="mb-1 block text-xs font-semibold text-fg">
            Project
          </label>
          <Select
            id="report-project"
            value={projectId ?? ""}
            onChange={(event) => apply({ projectId: event.target.value || null })}
          >
            <option value="">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border p-3">
        <p className="mr-1 flex items-center gap-1.5 text-xs font-semibold text-fg">
          <FileSpreadsheet className="size-3.5" aria-hidden="true" />
          Export CSV
        </p>
        {EXPORTS.map((item) => (
          <a
            key={item.kind}
            href={`/api/reports/export?kind=${item.kind}&${exportQuery}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-xs font-semibold text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <Download className="size-3" aria-hidden="true" />
            {item.label}
          </a>
        ))}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto no-print"
          onClick={() => {
            toast({
              tone: "info",
              title: "Printing this page",
              description: "Use your browser's “Save as PDF” option in the print dialog.",
            });
            window.print();
          }}
        >
          <Printer className="size-3.5" aria-hidden="true" />
          Print / save as PDF
        </Button>
      </div>
    </Card>
  );
}
