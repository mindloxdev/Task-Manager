"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/lib/utils";

/**
 * Chart wrappers.
 *
 * Every chart is paired with a visible data table (`<ChartTable>`), because
 * colour and position alone are not an accessible way to convey numbers. Series
 * are also distinguished by line style, not hue alone.
 */

const AXIS_PROPS = {
  tick: { fill: "var(--fg-subtle)", fontSize: 10 },
  stroke: "var(--grid)",
  tickLine: false,
} as const;

const TOOLTIP_PROPS = {
  contentStyle: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "0.5rem",
    fontSize: "0.75rem",
    color: "var(--fg)",
  },
  labelStyle: { color: "var(--fg-muted)", fontWeight: 600 },
} as const;

export function ChartFrame({
  children,
  height = 220,
  className,
  label,
}: {
  children: React.ReactNode;
  height?: number;
  className?: string;
  label: string;
}) {
  return (
    <div className={cn("w-full", className)} role="img" aria-label={label} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

/** The accessible fallback that accompanies each chart. */
export function ChartTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: (string | number)[][];
}) {
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-[11px] font-semibold text-fg-subtle hover:text-fg">
        Show the numbers behind this chart
      </summary>
      <div className="scroll-x mt-2">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-border">
              {columns.map((column) => (
                <th key={column} scope="col" className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-fg-subtle">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-b border-border last:border-0">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="tnum px-2 py-1 text-[11px] text-fg-muted">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function AssignedVsCompletedChart({
  data,
}: {
  data: { date: string; assigned: number; completed: number }[];
}) {
  return (
    <>
      <ChartFrame label="Tasks assigned and completed per day" height={210}>
        <AreaChart data={data} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="fillAssigned" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="fillCompleted" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 4" stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="date" {...AXIS_PROPS} tickFormatter={(value: string) => value.slice(5)} />
          <YAxis {...AXIS_PROPS} allowDecimals={false} width={32} />
          <Tooltip {...TOOLTIP_PROPS} />
          <Legend wrapperStyle={{ fontSize: "0.6875rem", color: "var(--fg-muted)" }} />
          <Area
            type="monotone"
            dataKey="assigned"
            name="Assigned"
            stroke="var(--chart-2)"
            strokeWidth={2}
            strokeDasharray="4 3"
            fill="url(#fillAssigned)"
          />
          <Area
            type="monotone"
            dataKey="completed"
            name="Completed"
            stroke="var(--chart-1)"
            strokeWidth={2}
            fill="url(#fillCompleted)"
          />
        </AreaChart>
      </ChartFrame>
      <ChartTable
        caption="Tasks assigned and completed per day"
        columns={["Date", "Assigned", "Completed"]}
        rows={data.map((row) => [row.date, row.assigned, row.completed])}
      />
    </>
  );
}

export function StatusBreakdownChart({
  data,
}: {
  data: { label: string; count: number; color: string }[];
}) {
  const total = data.reduce((sum, row) => sum + row.count, 0);
  return (
    <>
      <ChartFrame label="Tasks by status" height={240}>
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="label"
            innerRadius={44}
            outerRadius={72}
            paddingAngle={2}
            stroke="var(--surface)"
            strokeWidth={2}
          >
            {data.map((row) => (
              <Cell key={row.label} fill={row.color} />
            ))}
          </Pie>
          <Tooltip
            {...TOOLTIP_PROPS}
            formatter={(value: number, name: string) => [
              `${value} (${total > 0 ? Math.round((value / total) * 100) : 0}%)`,
              name,
            ]}
          />
          <Legend
            wrapperStyle={{ fontSize: "0.6875rem", color: "var(--fg-muted)", paddingTop: "0.5rem" }}
            iconSize={8}
          />
        </PieChart>
      </ChartFrame>
      <ChartTable
        caption="Tasks by status"
        columns={["Status", "Tasks", "Share"]}
        rows={data.map((row) => [row.label, row.count, `${total > 0 ? Math.round((row.count / total) * 100) : 0}%`])}
      />
    </>
  );
}

export function PriorityBarChart({
  data,
}: {
  data: { priority: string; open: number; completed: number }[];
}) {
  return (
    <>
      <ChartFrame label="Open and completed tasks by priority" height={200}>
        <BarChart data={data} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="priority" {...AXIS_PROPS} />
          <YAxis {...AXIS_PROPS} allowDecimals={false} width={32} />
          <Tooltip {...TOOLTIP_PROPS} />
          <Legend wrapperStyle={{ fontSize: "0.6875rem", color: "var(--fg-muted)" }} />
          <Bar dataKey="open" name="Open" fill="var(--chart-3)" radius={[3, 3, 0, 0]} maxBarSize={28} />
          <Bar dataKey="completed" name="Completed" fill="var(--chart-1)" radius={[3, 3, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ChartFrame>
      <ChartTable
        caption="Open and completed tasks by priority"
        columns={["Priority", "Open", "Completed"]}
        rows={data.map((row) => [row.priority, row.open, row.completed])}
      />
    </>
  );
}

export function TeamLoadChart({
  data,
}: {
  data: { team: string; assigned: number; completed: number; overdue: number }[];
}) {
  return (
    <>
      <ChartFrame label="Assigned, completed and overdue tasks per team" height={Math.max(180, data.length * 46)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="var(--grid)" horizontal={false} />
          <XAxis type="number" {...AXIS_PROPS} allowDecimals={false} />
          <YAxis type="category" dataKey="team" {...AXIS_PROPS} width={110} />
          <Tooltip {...TOOLTIP_PROPS} />
          <Legend wrapperStyle={{ fontSize: "0.6875rem", color: "var(--fg-muted)" }} />
          <Bar dataKey="assigned" name="Assigned" fill="var(--chart-2)" radius={[0, 3, 3, 0]} maxBarSize={12} />
          <Bar dataKey="completed" name="Completed" fill="var(--chart-1)" radius={[0, 3, 3, 0]} maxBarSize={12} />
          <Bar dataKey="overdue" name="Overdue now" fill="var(--chart-3)" radius={[0, 3, 3, 0]} maxBarSize={12} />
        </BarChart>
      </ChartFrame>
      <ChartTable
        caption="Assigned, completed and overdue tasks per team"
        columns={["Team", "Assigned", "Completed", "Overdue now"]}
        rows={data.map((row) => [row.team, row.assigned, row.completed, row.overdue])}
      />
    </>
  );
}

export function ProgressTrendChart({
  data,
}: {
  data: { date: string; progress: number }[];
}) {
  return (
    <>
      <ChartFrame label="Reported progress over time" height={180}>
        <LineChart data={data} margin={{ top: 6, right: 10, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="date" {...AXIS_PROPS} tickFormatter={(value: string) => value.slice(5)} />
          <YAxis {...AXIS_PROPS} domain={[0, 100]} width={32} unit="%" />
          <Tooltip {...TOOLTIP_PROPS} formatter={(value: number) => [`${value}%`, "Reported"]} />
          <Line
            type="monotone"
            dataKey="progress"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={{ r: 2.5, fill: "var(--chart-1)" }}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ChartFrame>
      <ChartTable
        caption="Reported progress over time"
        columns={["Date", "Reported progress"]}
        rows={data.map((row) => [row.date, `${row.progress}%`])}
      />
    </>
  );
}
