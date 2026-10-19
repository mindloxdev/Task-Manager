"use client";

import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { AlertCircle } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Form primitives.
 *
 * Every control has a visible label (placeholders are never the only label),
 * help text sits under the label, and an error is announced next to the field
 * it belongs to rather than only in a summary at the top.
 */

const CONTROL =
  "w-full rounded-md border bg-surface px-3 text-sm text-fg transition-colors placeholder:text-fg-subtle " +
  "disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-fg-subtle";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | string[] | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const message = Array.isArray(error) ? error[0] : error;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-xs font-semibold text-fg">
        {label}
        {required ? (
          <span className="ml-1 text-overdue" aria-hidden="true">
            *
          </span>
        ) : (
          <span className="ml-1.5 font-normal text-fg-subtle">(optional)</span>
        )}
      </label>
      {hint ? <p className="text-xs text-fg-muted">{hint}</p> : null}
      {children}
      {message ? (
        <p className="flex items-start gap-1 text-xs font-medium text-overdue" role="alert">
          <AlertCircle className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
          {message}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({
  invalid,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      className={cn(CONTROL, "h-10", invalid ? "border-overdue" : "border-border hover:border-border-strong", className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}

export function TextArea({
  invalid,
  className,
  rows = 4,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      rows={rows}
      className={cn(
        CONTROL,
        "resize-y py-2 leading-relaxed",
        invalid ? "border-overdue" : "border-border hover:border-border-strong",
        className,
      )}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}

export function Select({
  invalid,
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select
      className={cn(
        CONTROL,
        "h-10 appearance-none bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat pr-9",
        invalid ? "border-overdue" : "border-border hover:border-border-strong",
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236a817e' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      }}
      aria-invalid={invalid || undefined}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Checkbox({
  label,
  description,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: ReactNode }) {
  const id = useId();
  return (
    <label
      htmlFor={rest.id ?? id}
      className={cn(
        "flex cursor-pointer items-start gap-2.5 rounded-md border border-border bg-surface p-2.5 transition-colors hover:border-border-strong hover:bg-surface-2",
        className,
      )}
    >
      <input
        type="checkbox"
        id={rest.id ?? id}
        className="mt-0.5 size-4 shrink-0 rounded border-border-strong text-primary accent-[var(--primary)]"
        {...rest}
      />
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-fg">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-fg-muted">{description}</span> : null}
      </span>
    </label>
  );
}

export function RadioCard({
  name,
  value,
  checked,
  onChange,
  title,
  description,
  disabled,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  title: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2.5 rounded-md border p-2.5 transition-colors",
        checked ? "border-primary bg-primary-soft" : "border-border bg-surface hover:border-border-strong hover:bg-surface-2",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
        className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
      />
      <span className="min-w-0">
        <span className={cn("block text-xs font-semibold", checked ? "text-primary-soft-fg" : "text-fg")}>{title}</span>
        {description ? (
          <span className={cn("mt-0.5 block text-xs", checked ? "text-primary-soft-fg/80" : "text-fg-muted")}>
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}

/** Error summary shown above a long form, linking to the offending fields. */
export function ErrorSummary({ errors }: { errors: Record<string, string[]> | null | undefined }) {
  const entries = Object.entries(errors ?? {}).filter(([, messages]) => messages.length > 0);
  if (entries.length === 0) return null;
  return (
    <div className="rounded-md border border-overdue/40 bg-overdue-bg p-3" role="alert" tabIndex={-1}>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-overdue">
        <AlertCircle className="size-3.5" aria-hidden="true" />
        {entries.length === 1 ? "There is a problem with one field" : `There are problems with ${entries.length} fields`}
      </p>
      <ul className="mt-1.5 space-y-0.5 pl-5 text-xs text-overdue">
        {entries.map(([field, messages]) => (
          <li key={field} className="list-disc">
            <a href={`#field-${field}`} className="underline underline-offset-2">
              {messages[0]}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FormActions({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4", className)}>
      {children}
    </div>
  );
}
