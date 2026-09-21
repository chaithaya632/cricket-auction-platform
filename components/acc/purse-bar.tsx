import { cn } from "@/lib/utils"
import { formatCredits } from "@/lib/acc/config"

export function PurseBar({
  spent,
  total,
  className,
  showLabels = true,
}: {
  spent: number
  total: number
  className?: string
  showLabels?: boolean
}) {
  const remaining = total - spent
  const pct = Math.min(100, Math.max(0, (spent / total) * 100))
  const low = remaining / total < 0.2

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {showLabels && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Purse used</span>
          <span className={cn("font-semibold tabular-nums", low ? "text-destructive" : "text-foreground")}>
            {formatCredits(remaining)} left
          </span>
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", low ? "bg-destructive" : "bg-primary")}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabels && (
        <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
          <span>{formatCredits(spent)} spent</span>
          <span>{formatCredits(total)} total</span>
        </div>
      )}
    </div>
  )
}
