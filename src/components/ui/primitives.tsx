import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn, initials, pct } from "@/lib/utils";

/* ==========================================================================
   Layout primitives
   ========================================================================== */

export function Card({
  children,
  className,
  id,
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  /** Set when the card is a link target, e.g. `#progress`. */
  id?: string;
  as?: "section" | "div" | "article" | "aside";
}) {
  return (
    <Tag id={id} className={cn("card", className)}>
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
  level = 2,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  level?: 2 | 3;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3", className)}>
      <div className="min-w-0">
        <Heading className="text-sm font-semibold text-fg">{title}</Heading>
        {description ? <p className="mt-0.5 text-xs text-fg-muted">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-fg sm:text-2xl">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-fg-muted">{description}</p> : null}
        {meta ? <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">{children}</h2>
      {hint ? <span className="text-xs text-fg-subtle">{hint}</span> : null}
    </div>
  );
}

/* ==========================================================================
   Avatars
   ========================================================================== */

export function Avatar({
  name,
  color,
  size = "md",
  title,
}: {
  name: string;
  color?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  title?: string;
}) {
  const dimension = {
    xs: "size-5 text-[9px]",
    sm: "size-6 text-[10px]",
    md: "size-8 text-xs",
    lg: "size-11 text-sm",
  }[size];

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-1 ring-black/5",
        dimension,
      )}
      style={{ backgroundColor: color || "#0F766E" }}
      title={title ?? name}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({
  people,
  max = 4,
  size = "sm",
}: {
  people: { name: string; avatarColor?: string | null }[];
  max?: number;
  size?: "xs" | "sm" | "md";
}) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <span className="flex items-center">
      <span className="flex -space-x-1.5">
        {shown.map((person, index) => (
          <Avatar key={`${person.name}-${index}`} name={person.name} color={person.avatarColor} size={size} />
        ))}
      </span>
      {extra > 0 ? <span className="ml-1.5 text-xs font-medium text-fg-muted">+{extra}</span> : null}
      <span className="sr-only">{people.map((p) => p.name).join(", ")}</span>
    </span>
  );
}

/* ==========================================================================
   Progress
   ========================================================================== */

export function ProgressBar({
  value,
  tone = "IN_PROGRESS",
  size = "md",
  label,
  showValue = false,
}: {
  value: number;
  tone?: string;
  size?: "sm" | "md" | "lg";
  label?: string;
  showValue?: boolean;
}) {
  const safe = pct(value);
  const height = { sm: "h-1", md: "h-1.5", lg: "h-2.5" }[size];
  return (
    <div className="flex items-center gap-2">
      <div
        className={cn("relative w-full overflow-hidden rounded-full bg-surface-3", height)}
        role="progressbar"
        aria-valuenow={safe}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? `Progress: ${safe}%`}
      >
        <div
          className={cn("bar-fill h-full rounded-full transition-[width] duration-300 ease-out", `bar-${tone}`)}
          style={{ width: `${safe}%` }}
        />
      </div>
      {showValue ? <span className="tnum w-9 shrink-0 text-right text-xs font-semibold text-fg-muted">{safe}%</span> : null}
    </div>
  );
}

/* ==========================================================================
   Stats
   ========================================================================== */

export function StatCard({
  label,
  value,
  hint,
  tone,
  href,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "danger" | "warning" | "success" | "primary";
  href?: string;
  icon?: ReactNode;
}) {
  const accent = {
    default: "border-border",
    primary: "border-primary/40",
    danger: "border-overdue/50",
    warning: "border-risk/50",
    success: "border-track/50",
  }[tone ?? "default"];

  const valueTone = {
    default: "text-fg",
    primary: "text-primary",
    danger: "text-overdue",
    warning: "text-risk",
    success: "text-track",
  }[tone ?? "default"];

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-fg-muted">{label}</p>
        {icon ? <span className="text-fg-subtle">{icon}</span> : null}
      </div>
      <p className={cn("tnum mt-1.5 text-2xl font-bold leading-none", valueTone)}>{value}</p>
      {hint ? <p className="mt-1.5 text-xs text-fg-subtle">{hint}</p> : null}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          "lift group relative block rounded-lg border bg-surface p-3.5 shadow-[var(--shadow-sm)] hover:border-border-strong",
          accent,
        )}
      >
        {body}
        {/* Absolutely positioned so the hidden affordance reserves no height —
            otherwise linked cards stretch the whole stat row. */}
        <span
          className="pointer-events-none absolute bottom-2.5 right-2.5 text-primary opacity-0 transition-opacity duration-150 group-hover:opacity-100"
          aria-hidden="true"
        >
          <ChevronRight className="size-3.5" />
        </span>
      </Link>
    );
  }

  return <div className={cn("rounded-lg border bg-surface p-3.5 shadow-[var(--shadow-sm)]", accent)}>{body}</div>;
}

/* ==========================================================================
   Empty states and skeletons
   ========================================================================== */

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "px-4 py-8" : "px-6 py-14")}>
      {icon ? (
        <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-surface-2 text-fg-subtle">{icon}</div>
      ) : null}
      <p className="text-sm font-semibold text-fg">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-xs text-fg-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden="true" />;
}

export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-2 p-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-3">
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <Skeleton
              key={columnIndex}
              className={cn("h-7", columnIndex === 0 ? "w-[28%]" : "flex-1")}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className="h-24" />
      ))}
    </div>
  );
}

/* ==========================================================================
   Misc
   ========================================================================== */

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "primary" | "accent" | "danger" | "success" | "outline";
  className?: string;
}) {
  const styles = {
    neutral: "bg-surface-2 text-fg-muted",
    primary: "bg-primary-soft text-primary-soft-fg",
    accent: "bg-accent-soft text-accent-soft-fg",
    danger: "bg-overdue-bg text-overdue",
    success: "bg-track-bg text-track",
    outline: "border border-border text-fg-muted",
  }[tone];
  return <span className={cn("chip", styles, className)}>{children}</span>;
}

export function Dot({ className }: { className?: string }) {
  return <span className={cn("size-1.5 rounded-full", className)} aria-hidden="true" />;
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 text-sm text-fg">{children}</dd>
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-t border-border", className)} />;
}

/** Inline help text that explains how a number is calculated. */
export function Method({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-xs leading-relaxed text-fg-subtle">{children}</p>;
}
