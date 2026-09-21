import { Skeleton } from "@/components/ui/skeleton"

export default function AdminSettingsLoading() {
  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-56" />
      </div>
      <div className="max-w-3xl space-y-4">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </div>
  )
}
