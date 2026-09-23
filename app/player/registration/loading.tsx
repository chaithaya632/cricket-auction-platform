import { Skeleton } from "@/components/ui/skeleton";

export default function PlayerRegistrationLoading() {
  return (
    <div className="space-y-6 p-6 max-w-4xl">
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-9 w-28 rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
      <div className="space-y-4 rounded-xl border border-border/50 bg-card p-6">
        <Skeleton className="h-6 w-48" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-10 rounded-md" />
          <Skeleton className="h-10 rounded-md" />
          <Skeleton className="h-10 rounded-md" />
          <Skeleton className="h-10 rounded-md" />
        </div>
        <div className="space-y-2 pt-4">
          <Skeleton className="h-24 rounded-md" />
        </div>
      </div>
    </div>
  );
}
