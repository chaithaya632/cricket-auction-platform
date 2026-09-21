"use client"

import { useState } from "react"
import { DashboardShell } from "@/components/acc/dashboard-shell"
import { PageHeader } from "@/components/acc/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CategoryBadge } from "@/components/acc/category-badge"
import { SkillBadges } from "@/components/acc/skill-badges"
import { PlayerStatusBadge } from "@/components/acc/status-badges"
import { formatCredits } from "@/lib/acc/config"
import { PLAYERS, AUCTION_STATE, getPlayer } from "@/lib/acc/mock-data"
import { GripVertical, Play } from "lucide-react"
import { selectLotAction } from "@/lib/auction/actions"
import { toast } from "sonner"
import type { SessionUser } from "@/lib/acc/session"

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
}

export function LotQueueManager({ sessionUser }: { sessionUser: SessionUser }) {
  const [currentPlayerId, setCurrentPlayerId] = useState(AUCTION_STATE.currentPlayerId)
  const [lotNumber, setLotNumber] = useState(AUCTION_STATE.lotNumber)

  const current = getPlayer(currentPlayerId)
  const upcoming = PLAYERS.filter(
    (p) => (p.status === "APPROVED" || p.status === "IN_AUCTION") && p.id !== currentPlayerId,
  )

  async function sendToBlock(playerId: string) {
    setCurrentPlayerId(playerId)
    setLotNumber((n) => n + 1)
    try {
      const res = await selectLotAction(playerId)
      if (res && !res.success) {
        toast.info(res.error || "Preview mode: lot updated in console")
      } else if (res && res.success) {
        toast.success("Player moved to auction block")
      }
    } catch {
      toast.info("Preview mode: lot updated in console")
    }
  }

  return (
    <DashboardShell role="admin" user={sessionUser} breadcrumb="Lot Queue">
      <PageHeader
        eyebrow="Auction"
        title="Lot queue"
        description="Ordered list of players queued for the auction floor. Drag to re-sequence lots."
      />

      {current && (
        <Card className="overflow-hidden border-primary/40">
          <div className="h-1 w-full bg-primary" />
          <CardContent className="flex items-center gap-4 p-4">
            <span className="font-mono text-xs font-semibold uppercase tracking-widest text-primary">
              On the block
            </span>
            <Avatar className="size-11 rounded-lg border">
              <AvatarImage src={current.photoUrl || "/placeholder.svg"} alt={current.fullName} />
              <AvatarFallback className="rounded-lg">{initials(current.fullName)}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold">{current.fullName}</span>
              <span className="font-mono text-xs text-muted-foreground">Lot #{lotNumber}</span>
            </div>
            <CategoryBadge bucket={current.bucket} />
            <span className="font-semibold tabular-nums text-primary">{formatCredits(AUCTION_STATE.currentPrice)}</span>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-2">
        {upcoming.map((p, i) => (
          <Card key={p.id} className="group py-0 transition-colors hover:border-primary/30">
            <CardContent className="flex items-center gap-3 p-3">
              <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground/60" />
              <span className="w-8 shrink-0 text-center font-mono text-sm font-semibold text-muted-foreground">
                {i + 1}
              </span>
              <Avatar className="size-10 rounded-lg border">
                <AvatarImage src={p.photoUrl || "/placeholder.svg"} alt={p.fullName} />
                <AvatarFallback className="rounded-lg text-xs">{initials(p.fullName)}</AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium leading-tight">{p.fullName}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  Token #{p.auctionToken} · {p.rollNumber}
                </span>
              </div>
              <SkillBadges playerType={p.playerType} className="hidden md:flex" />
              <CategoryBadge bucket={p.bucket} />
              <Badge variant="outline" className="hidden font-mono tabular-nums sm:inline-flex">
                {formatCredits(p.basePrice)}
              </Badge>
              <PlayerStatusBadge status={p.status} className="hidden lg:inline-flex" />
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                onClick={() => sendToBlock(p.id)}
              >
                <Play className="size-4" />
                <span className="sr-only">Send {p.fullName} to block</span>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </DashboardShell>
  )
}
