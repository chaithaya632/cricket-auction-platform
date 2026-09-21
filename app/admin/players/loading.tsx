import { Skeleton } from "@/components/ui/skeleton"

export default function AdminPlayersLoading() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-10 flex-1 rounded-md" />
        <Skeleton className="h-10 w-40 rounded-md" />
        <Skeleton className="h-10 w-44 rounded-md" />
      </div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  )
}
