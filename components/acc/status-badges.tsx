import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { STATUS_CONFIG, AUCTION_STATUS_CONFIG } from "@/lib/acc/config"
import type { PlayerStatus, AuctionStatus } from "@/lib/acc/types"

const DEFAULT_PLAYER_STATUS_CONFIG = {
  label: "Under Review",
  variant: "outline" as const,
  className: "border-warning/40 text-warning bg-warning/10",
}

const DEFAULT_AUCTION_STATUS_CONFIG = {
  label: "Idle",
  className: "border-border text-muted-foreground bg-muted/40",
}

export function PlayerStatusBadge({
  status,
  className,
}: {
  status?: PlayerStatus | string | null
  className?: string
}) {
  const normalizedKey =
    typeof status === "string" && status.trim()
      ? (status.trim().toUpperCase().replace(/[\s-]+/g, "_") as PlayerStatus)
      : undefined

  const config =
    (normalizedKey && STATUS_CONFIG[normalizedKey]) ||
    (status && (STATUS_CONFIG as Record<string, any>)[status]) ||
    (status
      ? {
          label: String(status).replace(/_/g, " "),
          variant: "outline" as const,
          className: "border-muted-foreground/30 text-muted-foreground bg-muted/20",
        }
      : DEFAULT_PLAYER_STATUS_CONFIG)

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
  status?: AuctionStatus | string | null
  className?: string
}) {
  const normalizedKey =
    typeof status === "string" && status.trim()
      ? (status.trim().toUpperCase().replace(/[\s-]+/g, "_") as AuctionStatus)
      : undefined

  const config =
    (normalizedKey && AUCTION_STATUS_CONFIG[normalizedKey]) ||
    (status && (AUCTION_STATUS_CONFIG as Record<string, any>)[status]) ||
    (status
      ? {
          label: String(status).toUpperCase(),
          className: "border-border text-muted-foreground bg-muted/40",
        }
      : DEFAULT_AUCTION_STATUS_CONFIG)

  const isLive = normalizedKey === "LIVE"
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
