"use client"

// =============================================================================
// ACC Auction Portal — Components: Admin Lot Queue Manager
// =============================================================================

import { useState } from "react"
import { useRouter } from "next/navigation"
import { DashboardShell } from "@/components/acc/dashboard-shell"
import { PageHeader } from "@/components/acc/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CategoryBadge } from "@/components/acc/category-badge"
import { formatCredits } from "@/lib/acc/config"
import { GripVertical, Play, UserPlus, Layers, Loader2, Shuffle, Mic } from "lucide-react"
import { selectLotAction, drawNextAutoLotAction, callGuestDrawNumberAction } from "@/lib/auction/actions"
import { toast } from "sonner"
import type { SessionUser } from "@/lib/acc/session"
import type { AuctionLotWithDetails } from "@/lib/auction/types"
import type { EligiblePlayerQueueCandidate } from "@/lib/auction/queries"
import type { Bucket } from "@/lib/constants"
import { AddToQueueDialog } from "./add-to-queue-dialog"

function initials(name: string) {
  if (!name) return "P"
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

interface LotQueueManagerProps {
  sessionUser: SessionUser
  activeLot?: AuctionLotWithDetails | null
  upcomingLots?: AuctionLotWithDetails[]
  candidates?: EligiblePlayerQueueCandidate[]
}

export function LotQueueManager({
  sessionUser,
  activeLot,
  upcomingLots = [],
  candidates = [],
}: LotQueueManagerProps) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectingId, setSelectingId] = useState<string | null>(null)
  const [isAutoDrawing, setIsAutoDrawing] = useState(false)
  const [guestDrawNumber, setGuestDrawNumber] = useState("")
  const [guestBucket, setGuestBucket] = useState("B3")
  const [isGuestDrawing, setIsGuestDrawing] = useState(false)

  async function handleAutoDraw() {
    setIsAutoDrawing(true)
    try {
      const res = await drawNextAutoLotAction()
      if (!res.success) {
        toast.error(res.error || "Auto draw failed.")
      } else {
        toast.success(`Lot #${res.data?.drawNumber} (${res.data?.playerName}) drawn from Bucket ${res.data?.bucket}!`)
        router.refresh()
      }
    } catch (err: any) {
      toast.error(err?.message || "Auto draw failed.")
    } finally {
      setIsAutoDrawing(false)
    }
  }

  async function handleGuestDraw(e: React.FormEvent) {
    e.preventDefault()
    const num = parseInt(guestDrawNumber.trim(), 10)
    if (isNaN(num) || num < 1) {
      toast.error("Please enter a valid draw number.")
      return
    }

    setIsGuestDrawing(true)
    try {
      const res = await callGuestDrawNumberAction(num, guestBucket)
      if (!res.success) {
        toast.error(res.error || "Guest draw failed.")
      } else {
        toast.success(`Guest called #${num} (${res.data?.playerName})! Brought to floor.`)
        setGuestDrawNumber("")
        router.refresh()
      }
    } catch (err: any) {
      toast.error(err?.message || "Guest draw failed.")
    } finally {
      setIsGuestDrawing(false)
    }
  }

  async function sendToBlock(lotId: string) {
    setSelectingId(lotId)
    try {
      const res = await selectLotAction(lotId)
      if (!res.success) {
        toast.error(res.error || "Failed to bring lot to block.")
      } else {
        toast.success("Player moved to auction block")
        router.refresh()
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to bring lot to block.")
    } finally {
      setSelectingId(null)
    }
  }

  return (
    <DashboardShell
      role="admin"
      user={sessionUser}
      breadcrumb="Lot Queue"
      actions={
        <Button onClick={() => setDialogOpen(true)} size="sm">
          <UserPlus className="size-4 mr-1.5" />
          Add Existing Player
        </Button>
      }
    >
      <PageHeader
        eyebrow="Auction Floor"
        title="Lot Queue Management"
        description="Authoritative ordered queue of players scheduled for the auction block. Add registered players or bring lots to the floor."
      />

      {/* Active Lot On the Block */}
      {activeLot && (
        <Card className="overflow-hidden border-primary/40 bg-primary/5 mb-6">
          <div className="h-1 w-full bg-primary" />
          <CardContent className="flex items-center gap-4 p-4">
            <span className="font-mono text-xs font-semibold uppercase tracking-widest text-primary">
              On the block
            </span>
            <Avatar className="size-11 rounded-lg border">
              <AvatarImage
                src={activeLot.player.photo_url || "/placeholder.svg"}
                alt={activeLot.player.full_name}
              />
              <AvatarFallback className="rounded-lg">
                {initials(activeLot.player.full_name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold">{activeLot.player.full_name}</span>
              <span className="font-mono text-xs text-muted-foreground">
                Lot #{activeLot.draw_number} · Round {activeLot.round}
              </span>
            </div>
            <CategoryBadge bucket={activeLot.bucket as Bucket} />
            <span className="font-semibold tabular-nums text-primary">
              {formatCredits(activeLot.current_price || activeLot.base_price)}
            </span>
          </CardContent>
        </Card>
      )}

      {/* Draw Mode Controls (§10) */}
      <Card className="mb-6 border-zinc-800 bg-zinc-900/90 shadow-lg">
        <CardContent className="p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-2">
                <span>🎲</span> Draw Modes (§10)
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Official Bucket Sequence: <strong>B3 → B4 → B2 → B5 → B1 → PG</strong>. Switch between Auto and Guest modes at any time.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Auto Mode */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Shuffle className="size-4 text-emerald-400" />
                  <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider">
                    Auto Mode Draw
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400">
                  System randomly draws the next player in the current bucket according to the authoritative sequence.
                </p>
              </div>
              <Button
                onClick={handleAutoDraw}
                disabled={isAutoDrawing || Boolean(activeLot)}
                size="sm"
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
              >
                {isAutoDrawing ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin mr-1.5" />
                    Drawing Random Lot...
                  </>
                ) : (
                  <>
                    <Shuffle className="size-3.5 mr-1.5" />
                    Auto Draw Next Player
                  </>
                )}
              </Button>
            </div>

            {/* Guest Mode */}
            <form onSubmit={handleGuestDraw} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Mic className="size-4 text-amber-400" />
                  <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider">
                    Guest Mode Draw
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Honorary guest calls a number aloud; operator enters it and that player comes to the floor. No number is ever called twice (§10).
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={guestBucket}
                  onChange={(e) => setGuestBucket(e.target.value)}
                  className="rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="B3">Bucket B3</option>
                  <option value="B4">Bucket B4</option>
                  <option value="B2">Bucket B2</option>
                  <option value="B5">Bucket B5</option>
                  <option value="B1">Bucket B1</option>
                  <option value="PG">PG</option>
                </select>
                <input
                  type="number"
                  min="1"
                  placeholder="Draw #"
                  value={guestDrawNumber}
                  onChange={(e) => setGuestDrawNumber(e.target.value)}
                  className="w-24 rounded-lg bg-zinc-900 border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-200 font-mono placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <Button
                  type="submit"
                  disabled={isGuestDrawing || !guestDrawNumber.trim() || Boolean(activeLot)}
                  size="sm"
                  className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs"
                >
                  {isGuestDrawing ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <>
                      <Mic className="size-3.5 mr-1" />
                      Call Number
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </CardContent>
      </Card>

      {/* Upcoming Lots List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Upcoming Lots ({upcomingLots.length})
          </span>
          {candidates.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {candidates.length} eligible player{candidates.length === 1 ? "" : "s"} ready to queue
            </span>
          )}
        </div>

        {upcomingLots.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-10 text-center">
            <Layers className="size-8 text-muted-foreground mb-3 opacity-50" />
            <p className="text-sm font-semibold">The auction lot queue is currently empty</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Use &ldquo;Add Existing Player&rdquo; above to select registered tournament players and queue them for bidding.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => setDialogOpen(true)}
            >
              <UserPlus className="size-3.5 mr-1.5" />
              Add Existing Player
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {upcomingLots.map((lot) => (
              <Card
                key={lot.id}
                className="group py-0 transition-colors hover:border-primary/30"
              >
                <CardContent className="flex items-center gap-3 p-3">
                  <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground/60" />
                  <span className="w-8 shrink-0 text-center font-mono text-sm font-semibold text-muted-foreground">
                    #{lot.draw_number}
                  </span>
                  <Avatar className="size-10 rounded-lg border">
                    <AvatarImage
                      src={lot.player.photo_url || "/placeholder.svg"}
                      alt={lot.player.full_name}
                    />
                    <AvatarFallback className="rounded-lg text-xs">
                      {initials(lot.player.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium leading-tight">
                      {lot.player.full_name}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {lot.registration.branch || "Cricket"}
                      {lot.registration.academic_year
                        ? ` · Year ${lot.registration.academic_year}`
                        : ""}
                    </span>
                  </div>
                  <CategoryBadge bucket={lot.bucket as Bucket} />
                  <Badge variant="outline" className="hidden font-mono tabular-nums sm:inline-flex">
                    {formatCredits(lot.base_price)}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0 opacity-80 group-hover:opacity-100 focus-visible:opacity-100"
                    disabled={selectingId !== null}
                    onClick={() => sendToBlock(lot.id)}
                  >
                    {selectingId === lot.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <>
                        <Play className="size-3.5 mr-1" />
                        Bring to Floor
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <AddToQueueDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        candidates={candidates}
      />
    </DashboardShell>
  )
}
