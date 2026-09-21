import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { STATUS_CONFIG, AUCTION_STATUS_CONFIG } from "@/lib/acc/config"
import type { PlayerStatus, AuctionStatus } from "@/lib/acc/types"

export function PlayerStatusBadge({
  status,
  className,
}: {
  status: PlayerStatus
  className?: string
}) {
  const config = STATUS_CONFIG[status]
  return (
    <Badge variant="outline" className={cn(config.className, className)}>
      {config.label}
    </Badge>
  )
}

export function AuctionStatusBadge({
  status,
  className,
}: {
  status: AuctionStatus
  className?: string
}) {
  const config = AUCTION_STATUS_CONFIG[status]
  const isLive = status === "LIVE"
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 font-semibold uppercase tracking-wide", config.className, className)}
    >
      {isLive && (
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-live-pulse rounded-full bg-live" />
          <span className="relative inline-flex size-2 rounded-full bg-live" />
        </span>
      )}
      {config.label}
    </Badge>
  )
}

export function LiveIndicator({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-live/50 bg-live/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-live",
        className,
      )}
    >
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-live-pulse rounded-full bg-live" />
        <span className="relative inline-flex size-2 rounded-full bg-live" />
      </span>
      Live
    </span>
  )
}
