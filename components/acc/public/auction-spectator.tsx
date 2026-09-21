"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { Progress } from "@/components/ui/progress"
import { CategoryBadge } from "@/components/acc/category-badge"
import { SkillBadges } from "@/components/acc/skill-badges"
import { FranchiseCrest } from "@/components/acc/franchise-crest"
import { AuctionStatusBadge } from "@/components/acc/status-badges"
import { formatCredits } from "@/lib/acc/config"
import { cn } from "@/lib/utils"
import type { AuctionState, Franchise, Player, SaleRecord } from "@/lib/acc/types"

export function AuctionSpectator({
  state,
  player,
  leading,
  franchises,
  recentSales,
}: {
  state: AuctionState
  player: Player
  leading: Franchise | undefined
  franchises: Record<string, Franchise>
  recentSales: { sale: SaleRecord; player: Player; franchise: Franchise }[]
}) {
  const franchiseOf = (id: string): Franchise | undefined => franchises[id]
  const [seconds, setSeconds] = useState(state.timerSeconds)

  useEffect(() => {
    const t = setInterval(() => {
      setSeconds((s) => (s <= 0 ? 20 : s - 1))
    }, 1000)
    return () => clearInterval(t)
  }, [])

  const urgent = seconds <= 8

  return (
    <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
      {/* Current lot */}
      <div className="flex flex-col gap-6">
        <Card className="overflow-hidden">
          <CardHeader className="flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">
                LOT {state.lotNumber} / {state.totalLots}
              </span>
              <AuctionStatusBadge status={state.status} />
            </div>
            <div
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-sm font-bold tabular-nums",
                urgent
                  ? "border-destructive/50 bg-destructive/10 text-destructive"
                  : "border-border bg-muted/40 text-foreground",
              )}
            >
              <span className={cn("size-2 rounded-full", urgent ? "bg-destructive animate-pulse" : "bg-success")} />
              00:{String(seconds).padStart(2, "0")}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Avatar className="size-24 rounded-xl border">
                <AvatarImage src={player.photoUrl || "/placeholder.svg"} alt={player.fullName} />
                <AvatarFallback className="rounded-xl text-2xl">
                  {player.fullName.slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <CategoryBadge bucket={player.bucket} />
                  <span className="font-mono text-xs text-muted-foreground">{player.rollNumber}</span>
                </div>
                <h2 className="text-3xl font-bold tracking-tight">{player.fullName}</h2>
                <SkillBadges playerType={player.playerType} />
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">Current bid</span>
                <span className="text-3xl font-bold tabular-nums text-primary">
                  {formatCredits(state.currentPrice)}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">Base price</span>
                <span className="text-3xl font-bold tabular-nums">{formatCredits(player.basePrice)}</span>
              </div>
              <div className="col-span-2 flex flex-col sm:col-span-1">
                <span className="text-xs text-muted-foreground">Leading</span>
                {leading ? (
                  <div className="mt-1 flex items-center gap-2">
                    <FranchiseCrest franchise={leading} size="sm" />
                    <span className="truncate text-sm font-semibold">{leading.teamName}</span>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">No bids yet</span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Lot progress</span>
                <span>{Math.round((state.lotNumber / state.totalLots) * 100)}%</span>
              </div>
              <Progress value={(state.lotNumber / state.totalLots) * 100} />
            </div>
          </CardContent>
        </Card>

        {/* Player stats */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Season statistics</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "Matches", value: player.stats.matches },
              { label: "Runs", value: player.stats.runs },
              { label: "Strike rate", value: player.stats.strikeRate },
              { label: "Wickets", value: player.stats.wickets },
            ].map((s) => (
              <div key={s.label} className="flex flex-col gap-1 rounded-lg border bg-muted/20 p-3">
                <span className="text-xs text-muted-foreground">{s.label}</span>
                <span className="text-xl font-bold tabular-nums">{s.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Right column: bid feed + sold ticker */}
      <div className="flex flex-col gap-6">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="text-base">Live bid feed</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {[...state.bids].reverse().map((bid, i) => {
              const f = franchiseOf(bid.franchiseId)
              return (
                <div
                  key={bid.id}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-2.5",
                    i === 0 ? "border-primary/40 bg-primary/5" : "border-border/60",
                  )}
                >
                  {f && <FranchiseCrest franchise={f} size="sm" />}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{f?.teamName}</span>
                    <span className="font-mono text-xs text-muted-foreground">{bid.at}</span>
                  </div>
                  <span className="font-bold tabular-nums text-primary">{formatCredits(bid.amount)}</span>
                </div>
              )
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recently sold</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {recentSales.map(({ sale, player: sp, franchise }) => (
              <div key={sale.saleId} className="flex items-center gap-3 rounded-lg border border-border/60 p-2.5">
                <Avatar className="size-9 rounded-md border">
                  <AvatarImage src={sp.photoUrl || "/placeholder.svg"} alt={sp.fullName} />
                  <AvatarFallback className="rounded-md text-xs">{sp.fullName.slice(0, 2)}</AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{sp.fullName}</span>
                  <span className="truncate text-xs text-muted-foreground">{franchise.teamName}</span>
                </div>
                <span className="font-semibold tabular-nums text-success">{formatCredits(sale.finalPrice)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
