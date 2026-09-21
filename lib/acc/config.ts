import type { Bucket, PlayerStatus, AuctionStatus } from "./types"

export const SEASON = "ACC 2026"
export const STARTING_PURSE = 1000
export const MIN_PER_BUCKET = 2
export const TARGET_SQUAD = 15

/**
 * Presentation-only metadata for the six player categories.
 * The color token maps to a CSS variable defined in globals.css.
 */
export const CATEGORY_CONFIG: Record<
  Bucket,
  { label: string; description: string; token: string; textClass: string; bgClass: string; borderClass: string }
> = {
  B1: {
    label: "B1",
    description: "B.Tech · Year 1",
    token: "var(--cat-b1)",
    textClass: "text-[var(--cat-b1)]",
    bgClass: "bg-[var(--cat-b1)]/15",
    borderClass: "border-[var(--cat-b1)]/40",
  },
  B2: {
    label: "B2",
    description: "B.Tech · Year 2",
    token: "var(--cat-b2)",
    textClass: "text-[var(--cat-b2)]",
    bgClass: "bg-[var(--cat-b2)]/15",
    borderClass: "border-[var(--cat-b2)]/40",
  },
  B3: {
    label: "B3",
    description: "B.Tech · Year 3",
    token: "var(--cat-b3)",
    textClass: "text-[var(--cat-b3)]",
    bgClass: "bg-[var(--cat-b3)]/15",
    borderClass: "border-[var(--cat-b3)]/40",
  },
  B4: {
    label: "B4",
    description: "B.Tech · Year 4",
    token: "var(--cat-b4)",
    textClass: "text-[var(--cat-b4)]",
    bgClass: "bg-[var(--cat-b4)]/15",
    borderClass: "border-[var(--cat-b4)]/40",
  },
  B5: {
    label: "B5",
    description: "Diploma · All years",
    token: "var(--cat-b5)",
    textClass: "text-[var(--cat-b5)]",
    bgClass: "bg-[var(--cat-b5)]/15",
    borderClass: "border-[var(--cat-b5)]/40",
  },
  PG: {
    label: "PG",
    description: "Postgraduate",
    token: "var(--cat-pg)",
    textClass: "text-[var(--cat-pg)]",
    bgClass: "bg-[var(--cat-pg)]/15",
    borderClass: "border-[var(--cat-pg)]/40",
  },
}

export const BUCKET_ORDER: Bucket[] = ["B1", "B2", "B3", "B4", "B5", "PG"]

export const STATUS_CONFIG: Record<
  PlayerStatus,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive"; className: string }
> = {
  REGISTERED: { label: "Registered", variant: "outline", className: "" },
  UNDER_REVIEW: {
    label: "Under Review",
    variant: "outline",
    className: "border-warning/40 text-warning bg-warning/10",
  },
  APPROVED: {
    label: "Approved",
    variant: "outline",
    className: "border-accent/40 text-accent bg-accent/10",
  },
  IN_AUCTION: {
    label: "In Auction",
    variant: "outline",
    className: "border-primary/40 text-primary bg-primary/10",
  },
  SOLD: {
    label: "Sold",
    variant: "outline",
    className: "border-success/40 text-success bg-success/10",
  },
  UNSOLD: {
    label: "Unsold",
    variant: "outline",
    className: "border-destructive/40 text-destructive bg-destructive/10",
  },
}

export const AUCTION_STATUS_CONFIG: Record<
  AuctionStatus,
  { label: string; className: string }
> = {
  IDLE: { label: "Idle", className: "border-border text-muted-foreground bg-muted/40" },
  LIVE: { label: "Live", className: "border-live/50 text-live bg-live/10" },
  PAUSED: { label: "Paused", className: "border-warning/50 text-warning bg-warning/10" },
  SOLD: { label: "Sold", className: "border-success/50 text-success bg-success/10" },
  UNSOLD: { label: "Unsold", className: "border-destructive/50 text-destructive bg-destructive/10" },
}

/** Format an auction credit value. Values are in ACC credits displayed with ₹. */
export function formatCredits(value: number): string {
  return `₹${value.toLocaleString("en-IN")}`
}

/** §11 bid ladder — presentation helper only, backend is authoritative. */
export function nextBidValue(current: number): number {
  if (current < 100) return current + 10
  if (current < 200) return current + 20
  return current + 30
}
