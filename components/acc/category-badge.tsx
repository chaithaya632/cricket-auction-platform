import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { CATEGORY_CONFIG } from "@/lib/acc/config"
import type { Bucket } from "@/lib/acc/types"

export function CategoryBadge({
  bucket,
  withLabel = false,
  className,
}: {
  bucket: Bucket
  withLabel?: boolean
  className?: string
}) {
  const config = CATEGORY_CONFIG[bucket]
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 font-mono font-semibold tabular-nums",
        config.bgClass,
        config.textClass,
        config.borderClass,
        className,
      )}
    >
      {bucket}
      {withLabel && <span className="font-sans font-normal opacity-80">{config.description}</span>}
    </Badge>
  )
}

/** Larger square category chip used in category-grid displays. */
export function CategoryChip({ bucket, className }: { bucket: Bucket; className?: string }) {
  const config = CATEGORY_CONFIG[bucket]
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border p-4 text-center transition-colors",
        config.bgClass,
        config.borderClass,
        className,
      )}
    >
      <span className={cn("font-mono text-2xl font-bold", config.textClass)}>{bucket}</span>
      <span className="mt-1 text-xs text-muted-foreground">{config.description}</span>
    </div>
  )
}
