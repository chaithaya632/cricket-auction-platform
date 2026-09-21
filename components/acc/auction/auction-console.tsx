"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { CategoryBadge } from "@/components/acc/category-badge"
import { SkillBadges } from "@/components/acc/skill-badges"
import { FranchiseCrest } from "@/components/acc/franchise-crest"
import { AuctionStatusBadge } from "@/components/acc/status-badges"
import { formatCredits, nextBidValue } from "@/lib/acc/config"
import { cn } from "@/lib/utils"
import type { Player, Franchise, AuctionState, BidEvent, AuctionStatus } from "@/lib/acc/types"
import { Gavel, Pause, Play, CircleCheck, CircleX, SkipForward, Timer } from "lucide-react"

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("")
}

export function AuctionConsole({
  mode,
  initialState,
  player,
  franchises,
  currentFranchiseId,
}: {
  mode: "admin" | "franchise"
  initialState: AuctionState
  player: Player
  franchises: Franchise[]
  currentFranchiseId?: string
}) {
  const [status, setStatus] = useState<AuctionStatus>(initialState.status)
  const [price, setPrice] = useState(initialState.currentPrice)
  const [leaderId, setLeaderId] = useState<string | null>(initialState.leadingFranchiseId ?? null)
  const [bids, setBids] = useState<BidEvent[]>(initialState.bids)
  const [timer, setTimer] = useState(initialState.timerSeconds)
  const bidId = useRef(initialState.bids.length)

  const running = status === "LIVE"

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setTimer((t) => (t > 0 ? t - 1 : 0)), 1000)
    return () => clearInterval(id)
  }, [running])

  const leader = useMemo(() => franchises.find((f) => f.id === leaderId), [franchises, leaderId])
  const myFranchise = franchises.find((f) => f.id === currentFranchiseId)
  const iAmLeading = leaderId === currentFranchiseId

  function placeBid(franchiseId: string) {
    const next = bids.length === 0 ? player.basePrice : nextBidValue(price)
    bidId.current += 1
    const now = new Date().toLocaleTimeString("en-GB")
    setBids((b) => [...b, { id: `b${bidId.current}`, franchiseId, amount: next, at: now }])
    setPrice(next)
    setLeaderId(franchiseId)
    setTimer(20)
    if (status !== "LIVE") setStatus("LIVE")
  }

  const timerLow = timer <= 5

  return (
    <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
      {/* Main lot panel */}
      <Card className="overflow-hidden">
        <div className="h-1.5 w-full bg-gradient-to-r from-primary via-accent to-primary" />
        <CardContent className="flex flex-col gap-6 pt-6">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Lot #{initialState.lotNumber} of {initialState.totalLots}
            </span>
            <AuctionStatusBadge status={status} />
          </div>

          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
            <Avatar className="size-28 rounded-2xl border-2">
              <AvatarImage src={player.photoUrl || "/placeholder.svg"} alt={player.fullName} />
              <AvatarFallback className="rounded-2xl text-2xl">{initials(player.fullName)}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col items-center gap-2 sm:items-start">
              <div className="flex items-center gap-2">
                <CategoryBadge bucket={player.bucket} withLabel />
                <span className="font-mono text-xs text-muted-foreground">#{player.auctionToken}</span>
              </div>
              <h2 className="text-2xl font-bold tracking-tight">{player.fullName}</h2>
              <p className="font-mono text-sm text-muted-foreground">{player.rollNumber}</p>
              <SkillBadges playerType={player.playerType} />
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Base price</span>
              <span className="text-lg font-bold tabular-nums">{formatCredits(player.basePrice)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Current bid</span>
              <span className="text-lg font-bold tabular-nums text-primary">{formatCredits(price)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Leading</span>
              <span className="text-lg font-bold">{leader ? leader.shortCode : "—"}</span>
            </div>
            <div className="flex flex-col">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Timer className="size-3" /> Timer
              </span>
              <span className={cn("text-lg font-bold tabular-nums", timerLow && running && "text-destructive")}>
                {timer}s
              </span>
            </div>
          </div>

          {/* Controls */}
          {mode === "admin" ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant={running ? "outline" : "default"}
                onClick={() => setStatus(running ? "PAUSED" : "LIVE")}
              >
                {running ? <Pause className="size-4" /> : <Play className="size-4" />}
                {running ? "Pause" : "Resume"}
              </Button>
              <Button
                variant="outline"
                className="border-success/40 text-success hover:bg-success/10"
                onClick={() => setStatus("SOLD")}
                disabled={!leader}
              >
                <CircleCheck className="size-4" />
                Mark sold
              </Button>
              <Button
                variant="outline"
                className="border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={() => setStatus("UNSOLD")}
              >
                <CircleX className="size-4" />
                Mark unsold
              </Button>
              <Button variant="ghost" className="ml-auto">
                <SkipForward className="size-4" />
                Next lot
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Bidding as <span className="font-medium text-foreground">{myFranchise?.teamName}</span>
                </span>
                {myFranchise && (
                  <span className="font-semibold tabular-nums text-success">
                    {formatCredits(myFranchise.startingPurse)} purse
                  </span>
                )}
              </div>
              <Button
                size="lg"
                className="w-full"
                disabled={!running || iAmLeading || !currentFranchiseId}
                onClick={() => currentFranchiseId && placeBid(currentFranchiseId)}
              >
                <Gavel className="size-4" />
                {iAmLeading
                  ? "You are the highest bidder"
                  : `Bid ${formatCredits(bids.length === 0 ? player.basePrice : nextBidValue(price))}`}
              </Button>
              {!running && (
                <p className="text-center text-xs text-muted-foreground">
                  Bidding is {status === "SOLD" ? "closed — lot sold" : status.toLowerCase()}.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bid history */}
      <Card className="flex flex-col">
        <CardHeader>
          <CardTitle className="text-base">Bid history</CardTitle>
        </CardHeader>
        <CardContent className="flex-1">
          <ScrollArea className="h-[420px] pr-3">
            <div className="flex flex-col gap-2">
              {[...bids].reverse().map((bid, i) => {
                const f = franchises.find((x) => x.id === bid.franchiseId)
                const isTop = i === 0
                if (!f) return null
                return (
                  <div
                    key={bid.id}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border p-2.5 transition-colors",
                      isTop ? "border-primary/40 bg-primary/5" : "border-border/60",
                    )}
                  >
                    <FranchiseCrest franchise={f} size="sm" />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">{f.teamName}</span>
                      <span className="font-mono text-xs text-muted-foreground">{bid.at}</span>
                    </div>
                    <span className={cn("font-semibold tabular-nums", isTop && "text-primary")}>
                      {formatCredits(bid.amount)}
                    </span>
                  </div>
                )
              })}
              {bids.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">No bids yet — opening at base price.</p>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}
