"use client"

// =============================================================================
// ACC Auction Portal — Admin Players Table with Review & Eligibility Workflow
// =============================================================================

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CategoryBadge } from "@/components/acc/category-badge"
import { PlayerStatusBadge } from "@/components/acc/status-badges"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { formatCredits, BUCKET_ORDER, STATUS_CONFIG } from "@/lib/acc/config"
import type { Player, PlayerStatus } from "@/lib/acc/types"
import { Search, Users, Trash2, ShieldCheck, CheckCircle2, AlertTriangle, Eye, ShieldAlert, RotateCcw, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { reAuctionUnsoldLotAction } from "@/lib/auction/actions"
import { toast } from "sonner"
import { DeletePlayerDialog } from "./delete-player-dialog"
import { PlayerReviewDialog } from "./player-review-dialog"

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
}

const STATUSES = Object.keys(STATUS_CONFIG) as PlayerStatus[]

export function PlayersTable({ players }: { players: Player[] }) {
  const [query, setQuery] = useState("")
  const [bucket, setBucket] = useState<string>("all")
  const [status, setStatus] = useState<string>("all")
  const [paymentFilter, setPaymentFilter] = useState<string>("all")
  const [eligibilityFilter, setEligibilityFilter] = useState<string>("all")
  const [yearFilter, setYearFilter] = useState<string>("all")
  const [branchFilter, setBranchFilter] = useState<string>("all")
  const [groupFilter, setGroupFilter] = useState<string>("all")
  const [playerToDelete, setPlayerToDelete] = useState<Player | null>(null)
  const [playerToReview, setPlayerToReview] = useState<Player | null>(null)
  const [reAuctioningId, setReAuctioningId] = useState<string | null>(null)
  const router = useRouter()

  async function handleReAuction(player: Player) {
    const targetId = player.registrationId || player.id
    const confirmed = window.confirm(
      `Re-auction ${player.fullName}?\n\nThis will re-enter the player into the auction queue as pending at their original base price of ${formatCredits(player.basePrice)}.`
    )
    if (!confirmed) return

    setReAuctioningId(player.id)
    try {
      const res = await reAuctionUnsoldLotAction(targetId)
      if (!res.success) {
        toast.error(res.error || "Failed to re-auction player.")
      } else {
        toast.success(
          `${player.fullName} re-entered the lot queue at base price ${formatCredits(res.data?.basePrice || player.basePrice)}!`
        )
        router.refresh()
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to re-auction player.")
    } finally {
      setReAuctioningId(null)
    }
  }

  // Dynamically extract unique branch codes/names from actual player data
  const uniqueBranches = useMemo(() => {
    const branchSet = new Set<string>()
    for (const p of players) {
      if (p.branch && p.branch.trim()) {
        branchSet.add(p.branch.trim().toUpperCase())
      }
    }
    return Array.from(branchSet).sort()
  }, [players])

  const isFiltered =
    query.trim() !== "" ||
    bucket !== "all" ||
    status !== "all" ||
    paymentFilter !== "all" ||
    eligibilityFilter !== "all" ||
    yearFilter !== "all" ||
    branchFilter !== "all" ||
    groupFilter !== "all"

  function handleResetFilters() {
    setQuery("")
    setBucket("all")
    setStatus("all")
    setPaymentFilter("all")
    setEligibilityFilter("all")
    setYearFilter("all")
    setBranchFilter("all")
    setGroupFilter("all")
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return players.filter((p) => {
      // 1. Bucket / Category filter
      if (bucket !== "all" && p.bucket !== bucket) return false

      // 2. Status filter
      if (status !== "all" && p.status !== status) return false

      // 3. Payment filter
      if (paymentFilter !== "all" && (p.paymentStatus || "unpaid") !== paymentFilter) return false

      // 4. Eligibility filter
      if (eligibilityFilter === "eligible" && !p.isAuctionEligible) return false
      if (eligibilityFilter === "ineligible" && p.isAuctionEligible) return false
      if (eligibilityFilter === "discrepancies" && (!p.discrepancyNote || p.yearOverride)) return false

      // 5. Academic Year filter
      if (yearFilter !== "all" && String(p.yearOfStudy) !== yearFilter) return false

      // 6. Dynamic Branch filter
      if (branchFilter !== "all" && (p.branch || "").trim().toUpperCase() !== branchFilter) return false

      // 7. Academic Group filter (B.Tech, Diploma, PG)
      if (groupFilter !== "all") {
        const progLower = (p.program || "").toLowerCase()
        const course = (p.course || "").toUpperCase()
        if (groupFilter === "btech") {
          const isBtech = course === "UG" || progLower.includes("b.tech") || progLower.includes("btech")
          if (!isBtech) return false
        } else if (groupFilter === "diploma") {
          const isDiploma = course === "DIPLOMA" || progLower.includes("diploma")
          if (!isDiploma) return false
        } else if (groupFilter === "pg") {
          const isPg = course === "PG" || progLower.includes("pg") || progLower.includes("post")
          if (!isPg) return false
        }
      }

      // 8. Text Search query
      if (
        q &&
        !p.fullName.toLowerCase().includes(q) &&
        !p.rollNumber.toLowerCase().includes(q)
      ) {
        return false
      }
      return true
    })
  }, [
    players,
    query,
    bucket,
    status,
    paymentFilter,
    eligibilityFilter,
    yearFilter,
    branchFilter,
    groupFilter,
  ])

  return (
    <div className="flex flex-col gap-4">
      {/* Search and Filters Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or roll number…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Group Filter */}
        <Select value={groupFilter} onValueChange={(val) => setGroupFilter(val ?? "all")}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="Group" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All groups</SelectItem>
            <SelectItem value="btech">B.Tech</SelectItem>
            <SelectItem value="diploma">Diploma</SelectItem>
            <SelectItem value="pg">PG</SelectItem>
          </SelectContent>
        </Select>

        {/* Year Filter */}
        <Select value={yearFilter} onValueChange={(val) => setYearFilter(val ?? "all")}>
          <SelectTrigger className="w-full sm:w-32">
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All years</SelectItem>
            <SelectItem value="1">1st Year</SelectItem>
            <SelectItem value="2">2nd Year</SelectItem>
            <SelectItem value="3">3rd Year</SelectItem>
            <SelectItem value="4">4th Year</SelectItem>
          </SelectContent>
        </Select>

        {/* Dynamic Branch Filter */}
        <Select value={branchFilter} onValueChange={(val) => setBranchFilter(val ?? "all")}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="Branch" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All branches</SelectItem>
            {uniqueBranches.map((b) => (
              <SelectItem key={b} value={b}>
                {b}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Category Bucket Filter */}
        <Select value={bucket} onValueChange={(val) => setBucket(val ?? "all")}>
          <SelectTrigger className="w-full sm:w-32">
            <SelectValue placeholder="Bucket" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All buckets</SelectItem>
            {BUCKET_ORDER.map((b) => (
              <SelectItem key={b} value={b}>
                {b}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status Filter */}
        <Select value={status} onValueChange={(val) => setStatus(val ?? "all")}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_CONFIG[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Payment Filter */}
        <Select value={paymentFilter} onValueChange={(val) => setPaymentFilter(val ?? "all")}>
          <SelectTrigger className="w-full sm:w-32">
            <SelectValue placeholder="Payment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All payments</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="unpaid">Unpaid</SelectItem>
          </SelectContent>
        </Select>

        {/* Eligibility Filter */}
        <Select value={eligibilityFilter} onValueChange={(val) => setEligibilityFilter(val ?? "all")}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="Eligibility" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All eligibility</SelectItem>
            <SelectItem value="eligible">Auction Eligible</SelectItem>
            <SelectItem value="ineligible">Not Eligible</SelectItem>
            <SelectItem value="discrepancies">⚠️ Flagged Discrepancies</SelectItem>
          </SelectContent>
        </Select>

        {/* Reset Filters Button */}
        {isFiltered && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleResetFilters}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Reset Filters
          </Button>
        )}
      </div>

      {/* Main Players Table */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="min-w-[220px]">Player</TableHead>
              <TableHead className="hidden md:table-cell">Category / Base</TableHead>
              <TableHead>Registration</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead className="hidden lg:table-cell">CricHeroes</TableHead>
              <TableHead>Eligibility</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((p) => {
              const isPaid = p.paymentStatus === "paid"
              const isEligible = p.isAuctionEligible ?? false
              const isBlocked = p.isActive === false
              const cricheroesStatus = p.cricheroesStatus || "unverified"

              return (
                <TableRow key={p.id} className={isBlocked ? "opacity-60 bg-muted/20" : undefined}>
                  {/* Player column */}
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="size-10 rounded-md border">
                        <AvatarImage src={p.photoUrl || "/placeholder.svg"} alt={p.fullName} />
                        <AvatarFallback className="rounded-md text-xs">{initials(p.fullName)}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-sm truncate leading-tight">{p.fullName}</span>
                          {isBlocked && (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                              Blocked
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                          <span className="font-mono text-xs text-muted-foreground">
                            {p.rollNumber} · {p.program} {p.branch ? `· ${p.branch}` : ""}
                          </span>
                          {p.discrepancyNote && !p.yearOverride && (
                            <span
                              title={`Flagged Discrepancy: ${p.discrepancyNote}`}
                              className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 border border-amber-500/30"
                            >
                              <AlertTriangle className="size-2.5" />
                              Discrepancy
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </TableCell>

                  {/* Category & Base Price */}
                  <TableCell className="hidden md:table-cell">
                    <div className="flex items-center gap-2">
                      <CategoryBadge bucket={p.bucket} />
                      <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                        {formatCredits(p.status === "SOLD" ? p.soldPrice ?? p.basePrice : p.basePrice)}
                      </span>
                    </div>
                  </TableCell>

                  {/* Registration Status */}
                  <TableCell>
                    {p.registrationStatus === "pending_profile" ? (
                      <Badge variant="secondary" className="text-[11px] font-medium">
                        Profile Pending
                      </Badge>
                    ) : (
                      <PlayerStatusBadge status={p.status} />
                    )}
                  </TableCell>

                  {/* Payment Status */}
                  <TableCell>
                    <Badge
                      variant={isPaid ? "default" : "outline"}
                      className={`text-[11px] font-bold ${
                        isPaid
                          ? "bg-emerald-600 hover:bg-emerald-600 text-white"
                          : "border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10"
                      }`}
                    >
                      {isPaid ? "Paid" : "Pending"}
                    </Badge>
                  </TableCell>

                  {/* CricHeroes Status */}
                  <TableCell className="hidden lg:table-cell">
                    <Badge
                      variant="outline"
                      className={`text-[11px] font-medium capitalize ${
                        cricheroesStatus === "verified"
                          ? "border-emerald-500/50 text-emerald-600 bg-emerald-500/10"
                          : cricheroesStatus === "profile_creation_pending"
                          ? "border-purple-500/50 text-purple-600 bg-purple-500/10"
                          : "border-muted-foreground/30 text-muted-foreground"
                      }`}
                    >
                      {cricheroesStatus.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>

                  {/* Auction Eligibility */}
                  <TableCell>
                    {isEligible ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="size-3.5" />
                        <span>Eligible</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                        <AlertTriangle className="size-3.5 text-amber-500" />
                        <span>Not Eligible</span>
                      </span>
                    )}
                  </TableCell>

                  {/* Action Column: Review + Re-auction + Delete */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {p.status === "UNSOLD" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-2.5 text-xs font-semibold gap-1 border-amber-500/40 text-amber-500 hover:bg-amber-500/10 hover:text-amber-400"
                          disabled={reAuctioningId !== null}
                          onClick={() => handleReAuction(p)}
                          title={`Re-auction ${p.fullName} at base price`}
                        >
                          {reAuctioningId === p.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="size-3.5" />
                          )}
                          <span>Re-auction</span>
                        </Button>
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2.5 text-xs font-semibold gap-1"
                        onClick={() => setPlayerToReview(p)}
                      >
                        <Eye className="size-3.5" />
                        <span>Review</span>
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground hover:text-destructive size-8"
                        onClick={() => setPlayerToDelete(p)}
                        title={`Remove ${p.fullName}`}
                      >
                        <Trash2 className="size-3.5" />
                        <span className="sr-only">Remove {p.fullName}</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>

        {filtered.length === 0 && (
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Users />
              </EmptyMedia>
              <EmptyTitle>No players found</EmptyTitle>
              <EmptyDescription>
                {players.length === 0
                  ? "No tournament participants have registered yet. Use \"Add Player\" above or invite students to register."
                  : "Adjust your filters or search query to view participants."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span>Showing {filtered.length} of {players.length} players</span>
        <span className="text-[11px]">Click &ldquo;Review&rdquo; on any row to verify payment, credentials, and auction eligibility.</span>
      </div>

      {/* Dialogs */}
      <PlayerReviewDialog
        player={playerToReview}
        open={!!playerToReview}
        onOpenChange={(open) => !open && setPlayerToReview(null)}
      />

      <DeletePlayerDialog
        player={playerToDelete}
        open={!!playerToDelete}
        onOpenChange={(open) => !open && setPlayerToDelete(null)}
      />
    </div>
  )
}
