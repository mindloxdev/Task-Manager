"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertOctagon, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Route-level error boundary for the signed-in area. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // The message itself is deliberately not rendered: it may contain internals.
    console.error("[cadence] page error", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-16">
      <div className="card p-6 text-center">
        <span className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-overdue-bg text-overdue">
          <AlertOctagon className="size-5" aria-hidden="true" />
        </span>
        <h1 className="text-base font-bold text-fg">Something went wrong on this page</h1>
        <p className="mt-2 text-sm text-fg-muted">
          Nothing you had already saved is affected. Try again, and if it keeps happening send your administrator the
          reference below.
        </p>
        {error.digest ? (
          <p className="mt-3 rounded-md bg-surface-2 px-3 py-2 font-mono text-[11px] text-fg-subtle">
            Reference: {error.digest}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Button variant="primary" onClick={reset}>
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Try again
          </Button>
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center rounded-md border border-border px-3.5 text-sm font-semibold text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            Back to the dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
