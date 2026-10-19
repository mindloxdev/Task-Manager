import { CardsSkeleton, Skeleton, TableSkeleton } from "@/components/ui/primitives";

/** Shown while a server page streams in, reserving the same space as the real layout. */
export default function AppLoading() {
  return (
    <div className="mx-auto max-w-[110rem]" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div className="mb-5 space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <CardsSkeleton count={8} />
      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <div className="card xl:col-span-2">
          <Skeleton className="m-3 h-56" />
        </div>
        <div className="card">
          <Skeleton className="m-3 h-56" />
        </div>
      </div>
      <div className="card mt-6">
        <TableSkeleton rows={6} columns={6} />
      </div>
    </div>
  );
}
