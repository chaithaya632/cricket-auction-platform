import { Skeleton } from "@/components/ui/skeleton"

export default function AdminAuctionLoading() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-9 w-32 rounded-lg" />
          <Skeleton className="h-9 w-36 rounded-lg" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-6">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
        <div className="lg:col-span-4 space-y-6">
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    </div>
  )
}
