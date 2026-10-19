/**
 * Date helpers.
 *
 * Everything is stored and compared in UTC. Formatting for display accepts an
 * optional IANA time zone so a user in another zone sees their own wall clock,
 * while deadline comparisons stay absolute.
 */
import {
  differenceInCalendarDays,
  differenceInMinutes,
  endOfDay,
  endOfWeek,
  formatDistanceToNowStrict,
  startOfDay,
  startOfWeek,
} from "date-fns";

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(value: Date | string | null | undefined, timeZone?: string): string {
  const date = toDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timeZone || "UTC",
  }).format(date);
}

export function formatDate(value: Date | string | null | undefined, timeZone?: string): string {
  const date = toDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: timeZone || "UTC",
  }).format(date);
}

export function formatTime(value: Date | string | null | undefined, timeZone?: string): string {
  const date = toDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timeZone || "UTC",
  }).format(date);
}

export function formatRelative(value: Date | string | null | undefined): string {
  const date = toDate(value);
  if (!date) return "—";
  return `${formatDistanceToNowStrict(date, { addSuffix: true })}`;
}

/** "in 3 days", "4 hours left", "2 days overdue". */
export function formatDueDistance(dueAt: Date | string | null | undefined, now = new Date()): string {
  const date = toDate(dueAt);
  if (!date) return "No deadline";
  const minutes = differenceInMinutes(date, now);
  if (minutes === 0) return "Due now";
  const overdue = minutes < 0;
  const abs = Math.abs(minutes);
  let magnitude: string;
  if (abs < 60) magnitude = `${abs} min`;
  else if (abs < 60 * 48) magnitude = `${Math.round(abs / 60)} h`;
  else magnitude = `${Math.round(abs / (60 * 24))} days`;
  return overdue ? `${magnitude} overdue` : `${magnitude} left`;
}

export function daysUntil(value: Date | string | null | undefined, now = new Date()): number | null {
  const date = toDate(value);
  if (!date) return null;
  return differenceInCalendarDays(date, now);
}

export function isOverdue(dueAt: Date | string | null | undefined, now = new Date()): boolean {
  const date = toDate(dueAt);
  if (!date) return false;
  return date.getTime() < now.getTime();
}

/** Inclusive day window in local server time. */
export function dayRange(reference = new Date()): { from: Date; to: Date } {
  return { from: startOfDay(reference), to: endOfDay(reference) };
}

export function weekRange(reference = new Date()): { from: Date; to: Date } {
  return {
    from: startOfWeek(reference, { weekStartsOn: 1 }),
    to: endOfWeek(reference, { weekStartsOn: 1 }),
  };
}

/** Parse a `YYYY-MM-DD` or ISO string from a form into a Date, or null. */
export function parseDateInput(value: string | null | undefined): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // `datetime-local` gives "2026-01-02T15:04" with no zone; treat as UTC so
  // the stored instant is unambiguous and reproducible across environments.
  const normalised = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? `${trimmed}T00:00:00.000Z`
    : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)
      ? `${trimmed}:00.000Z`
      : trimmed;
  const date = new Date(normalised);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Format a Date for a `datetime-local` input (UTC wall clock). */
export function toDateTimeInputValue(value: Date | string | null | undefined): string {
  const date = toDate(value);
  if (!date) return "";
  return date.toISOString().slice(0, 16);
}

export function toDateInputValue(value: Date | string | null | undefined): string {
  const date = toDate(value);
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * HOUR_MS);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Stable bucket label used to make deadline reminders idempotent. */
export function reminderBucket(dueAt: Date, offsetHours: number): string {
  return `${dueAt.toISOString()}:${offsetHours}`;
}
