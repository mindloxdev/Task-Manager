/**
 * Shared result shapes for API routes and server actions, so the UI handles one
 * error format everywhere.
 */
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

import { AppError } from "@/server/errors";
import type { AppErrorCode } from "@/server/errors";

export type ActionFailure = {
  ok: false;
  code: AppErrorCode;
  error: string;
  /** Per-field messages, keyed by form field name. */
  fieldErrors?: Record<string, string[]>;
};

export type ActionSuccess<T> = { ok: true; data: T };
export type ActionResult<T> = ActionSuccess<T> | ActionFailure;

export function fail(error: unknown): ActionFailure {
  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const key = issue.path.join(".") || "_form";
      (fieldErrors[key] ||= []).push(issue.message);
    }
    const first = error.issues[0];
    return {
      ok: false,
      code: "VALIDATION",
      error: first ? first.message : "Please check the form and try again.",
      fieldErrors,
    };
  }
  if (error instanceof AppError) {
    return {
      ok: false,
      code: error.code,
      error: error.message,
      ...(error.details && typeof error.details === "object" && "fieldErrors" in error.details
        ? { fieldErrors: (error.details as { fieldErrors: Record<string, string[]> }).fieldErrors }
        : {}),
    };
  }
  // Anything unexpected is logged server-side and reported generically, so an
  // internal message never leaks to the browser.
  console.error("[cadence] unhandled error", error);
  return { ok: false, code: "INTERNAL", error: "Something went wrong. Please try again." };
}

export function ok<T>(data: T): ActionSuccess<T> {
  return { ok: true, data };
}

/** Wrap an API route handler so every failure answers the same way. */
export async function jsonHandler<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    return NextResponse.json({ ok: true, data: await fn() });
  } catch (error) {
    const failure = fail(error);
    const status = error instanceof AppError ? error.status : error instanceof ZodError ? 422 : 500;
    return NextResponse.json(failure, { status });
  }
}

export function parseWith<S extends ZodType>(schema: S, input: unknown): ReturnType<S["parse"]> {
  return schema.parse(input) as ReturnType<S["parse"]>;
}

/** Turn FormData into a plain object, collecting repeated keys into arrays. */
export function formToObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (value instanceof File) continue;
    const normalisedKey = key.endsWith("[]") ? key.slice(0, -2) : key;
    const existing = out[normalisedKey];
    if (key.endsWith("[]")) {
      out[normalisedKey] = Array.isArray(existing) ? [...existing, value] : [value];
    } else if (existing === undefined) {
      out[normalisedKey] = value;
    } else {
      out[normalisedKey] = Array.isArray(existing) ? [...existing, value] : [existing, value];
    }
  }
  return out;
}

/** HTML checkboxes send "on"/absent; normalise to booleans. */
export function asBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === "on" || value === "1";
}
