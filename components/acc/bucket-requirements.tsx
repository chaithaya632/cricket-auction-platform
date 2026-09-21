import { cn } from "@/lib/utils"
import { CATEGORY_CONFIG, BUCKET_ORDER, MIN_PER_BUCKET } from "@/lib/acc/config"
import { CircleCheck } from "lucide-react"
import type { Bucket } from "@/lib/acc/types"

export function BucketRequirements({
  counts,
  min = MIN_PER_BUCKET,
  className,
}: {
  counts: Record<Bucket, number>
  min?: number
  className?: string
}) {
  return (
    <div className={cn("grid grid-cols-3 gap-2 sm:grid-cols-6", className)}>
      {BUCKET_ORDER.map((b) => {
        const count = counts[b]
        const met = count >= min
        const config = CATEGORY_CONFIG[b]
        return (
          <div
            key={b}
            className={cn(
              "flex flex-col items-center gap-1 rounded-lg border p-3 text-center",
              met ? "border-success/40 bg-success/5" : config.borderClass,
            )}
          >
            <span className={cn("font-mono text-sm font-bold", config.textClass)}>{b}</span>
            <span className="text-xl font-bold tabular-nums leading-none">{count}</span>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              {met && <CircleCheck className="size-3 text-success" />}
              min {min}
            </span>
          </div>
        )
      })}
    </div>
  )
}
