import Link from "next/link";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="card max-w-md p-6 text-center">
        <span className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-surface-2 text-fg-subtle">
          <FileQuestion className="size-5" aria-hidden="true" />
        </span>
        <h1 className="text-base font-bold text-fg">We could not find that page</h1>
        <p className="mt-2 text-sm text-fg-muted">
          The link may be out of date, or the record may have been archived or deleted.
        </p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm font-semibold text-primary hover:underline">
          Back to the dashboard
        </Link>
      </div>
    </main>
  );
}
