import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { STATUS_CONFIG, AUCTION_STATUS_CONFIG } from "@/lib/acc/config"
import type { PlayerStatus, AuctionStatus } from "@/lib/acc/types"
import type { AuctionSessionStatus } from "@/lib/auction/types"

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

const SESSION_INDICATOR_CONFIG: Record<
  AuctionSessionStatus,
  { label: string; dotClass: string; textClass: string; borderClass: string; bgClass: string; animate: boolean }
> = {
  not_started: {
    label: 'Not Started',
    dotClass: 'bg-zinc-400',
    textClass: 'text-zinc-400',
    borderClass: 'border-zinc-500/50',
    bgClass: 'bg-zinc-500/10',
    animate: false,
  },
  live: {
    label: 'Live',
    dotClass: 'bg-live',
    textClass: 'text-live',
    borderClass: 'border-live/50',
    bgClass: 'bg-live/10',
    animate: true,
  },
  paused: {
    label: 'Paused',
    dotClass: 'bg-amber-400',
    textClass: 'text-amber-400',
    borderClass: 'border-amber-500/50',
    bgClass: 'bg-amber-500/10',
    animate: false,
  },
  completed: {
    label: 'Ended',
    dotClass: 'bg-blue-400',
    textClass: 'text-blue-400',
    borderClass: 'border-blue-500/50',
    bgClass: 'bg-blue-500/10',
    animate: false,
  },
};

export function AuctionSessionIndicator({
  status,
  className,
}: {
  status: AuctionSessionStatus;
  className?: string;
}) {
  const config = SESSION_INDICATOR_CONFIG[status] || SESSION_INDICATOR_CONFIG.not_started;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide",
        config.borderClass,
        config.bgClass,
        config.textClass,
        className,
      )}
    >
      <span className="relative flex size-2">
        {config.animate && (
          <span className={cn("absolute inline-flex size-full animate-live-pulse rounded-full", config.dotClass)} />
        )}
        <span className={cn("relative inline-flex size-2 rounded-full", config.dotClass)} />
      </span>
      {config.label}
    </span>
  );
}

/**
 * @deprecated Use AuctionSessionIndicator with the real session status instead.
 * Kept temporarily for backwards compatibility during migration.
 */
export function LiveIndicator({ className }: { className?: string }) {
  return <AuctionSessionIndicator status="live" className={className} />;
}
