import { Skeleton } from "@/components/ui/skeleton";

export default function PlayerAuctionLoading() {
  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-7 w-24 rounded-full" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Skeleton className="h-[420px] rounded-2xl" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-[220px] rounded-2xl" />
          <Skeleton className="h-[280px] rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
