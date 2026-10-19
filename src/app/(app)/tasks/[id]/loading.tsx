import { Skeleton } from "@/components/ui/primitives";

export default function TaskLoading() {
  return (
    <div className="mx-auto max-w-[95rem]" aria-busy="true">
      <span className="sr-only">Loading the task…</span>
      <Skeleton className="h-3 w-40" />
      <Skeleton className="mt-3 h-8 w-2/3" />
      <div className="mt-3 flex gap-2">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-24" />
      </div>
      <Skeleton className="mt-4 h-2.5 w-full" />
      <Skeleton className="mt-4 h-10 w-full" />
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-64" />
          <Skeleton className="h-52" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-44" />
          <Skeleton className="h-64" />
        </div>
      </div>
    </div>
  );
}
