"use client"

// =============================================================================
// ACC Auction Portal — Admin Players Table with Review & Eligibility Workflow
// =============================================================================

import { useMemo, useState, Fragment } from "react"
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
import type { Player, PlayerStatus, Bucket } from "@/lib/acc/types"
import {
  assignStableBucketNumbers,
  formatBucketPlayerNumber,
  getBucketTierDescription,
} from "@/lib/auction/bucket-numbering"
import { Search, Users, Trash2, ShieldCheck, CheckCircle2, AlertTriangle, Eye, ShieldAlert, RotateCcw, Loader2, ArrowRightLeft, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { reAuctionUnsoldLotAction } from "@/lib/auction/actions"
import { adminUpdatePlayerBucketAction } from "@/lib/players/actions"
import { adminAddReferredPlayerToTeamAction } from "@/lib/referrals/actions"
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
  const [playerToChangeBucket, setPlayerToChangeBucket] = useState<Player | null>(null)
  const [targetBucket, setTargetBucket] = useState<'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'PG'>("B1")
  const [isChangingBucket, setIsChangingBucket] = useState(false)
  const [addingTeamId, setAddingTeamId] = useState<string | null>(null)
  const [reAuctioningId, setReAuctioningId] = useState<string | null>(null)
  const router = useRouter()

  function openChangeBucket(p: Player) {
    setPlayerToChangeBucket(p)
    setTargetBucket(p.bucket)
  }

  async function handleConfirmChangeBucket() {
    if (!playerToChangeBucket) return
    const regId = playerToChangeBucket.registrationId || playerToChangeBucket.id
    setIsChangingBucket(true)
    try {
      const res = await adminUpdatePlayerBucketAction(regId, targetBucket)
      if (!res.success) {
        toast.error(res.error || "Failed to update player bucket.")
      } else {
        toast.success(`Bucket for ${playerToChangeBucket.fullName} updated to ${targetBucket}.`)
        setPlayerToChangeBucket(null)
        router.refresh()
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to update player bucket.")
    } finally {
      setIsChangingBucket(false)
    }
  }

  async function handleAddToTeam(player: Player) {
    if (!player.referralId) {
      toast.error("No referral claim found for this player.")
      return
    }
    setAddingTeamId(player.id)
    try {
      const res = await adminAddReferredPlayerToTeamAction(player.referralId)
      if (!res.success) {
        toast.error(res.error || "Failed to add referred player to squad.")
      } else {
        toast.success(`Added ${player.fullName} to ${player.referredFranchiseName || 'the franchise'} squad at ₹0!`)
        router.refresh()
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to add player to squad.")
    } finally {
      setAddingTeamId(null)
    }
  }

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

  // Derive stable bucket numbers for all players in the master list before filtering
  const playersWithBucketNumbers = useMemo(() => {
    const bucketNumberMap = assignStableBucketNumbers(players)
    return players.map((p) => ({
      ...p,
      bucketNumber: p.bucketNumber || bucketNumberMap.get(p.id) || formatBucketPlayerNumber(p.bucket, 1),
    }))
  }, [players])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return playersWithBucketNumbers.filter((p) => {
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

      // 8. Text Search query (name, rollNumber, or bucket unique number like B11)
      if (
        q &&
        !p.fullName.toLowerCase().includes(q) &&
        !p.rollNumber.toLowerCase().includes(q) &&
        !(p.bucketNumber && p.bucketNumber.toLowerCase().includes(q))
      ) {
        return false
      }
      return true
    })
  }, [
    playersWithBucketNumbers,
    query,
    bucket,
    status,
    paymentFilter,
    eligibilityFilter,
    yearFilter,
    branchFilter,
    groupFilter,
  ])

  // Group filtered players bucket-wise in deterministic order
  const groupedPlayersByBucket = useMemo(() => {
    const groups = new Map<Bucket, typeof filtered>()
    for (const b of BUCKET_ORDER) {
      groups.set(b, [])
    }
    for (const p of filtered) {
      const b = (p.bucket || "B1") as Bucket
      if (!groups.has(b)) {
        groups.set(b, [])
      }
      groups.get(b)!.push(p)
    }
    return groups
  }, [filtered])

  const displayedBuckets = useMemo(() => {
    if (bucket !== "all") {
      return [bucket as Bucket]
    }
    return BUCKET_ORDER
  }, [bucket])

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
            {displayedBuckets.map((bucketKey) => {
              const bucketPlayers = groupedPlayersByBucket.get(bucketKey) || []
              if (bucketPlayers.length === 0 && bucket === "all") {
                return null
              }
              return (
                <Fragment key={`bucket-group-${bucketKey}`}>
                  <TableRow className="bg-muted/70 hover:bg-muted/70 border-t-2 border-primary/20 select-none">
                    <TableCell colSpan={7} className="py-2.5 px-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <CategoryBadge bucket={bucketKey} />
                          <span className="font-extrabold text-sm tracking-wide text-foreground">
                            Bucket {bucketKey}
                          </span>
                          <span className="text-xs text-muted-foreground font-mono font-medium">
                            ({bucketPlayers.length} {bucketPlayers.length === 1 ? "player" : "players"})
                          </span>
                        </div>
                        <span className="text-[11px] text-muted-foreground font-medium hidden sm:inline">
                          {getBucketTierDescription(bucketKey)}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                  {bucketPlayers.length === 0 ? (
                    <TableRow key={`bucket-empty-${bucketKey}`}>
                      <TableCell colSpan={7} className="text-center py-6 text-xs text-muted-foreground italic">
                        No players found in Bucket {bucketKey} matching current filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    bucketPlayers.map((p) => {
                      const isPaid = p.paymentStatus === "paid"
                      const isEligible = p.isAuctionEligible ?? false
                      const isBlocked = p.isActive === false
                      const cricheroesStatus = p.cricheroesStatus || "unverified"

                      return (
                        <TableRow key={p.id} className={isBlocked ? "opacity-60 bg-muted/20" : undefined}>
                          {/* Player column */}
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <span
                                className="font-mono font-black text-xs px-2 py-1 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0 select-none"
                                title={`Auction Number: ${p.bucketNumber}`}
                              >
                                {p.bucketNumber}
                              </span>
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
                          {p.isDetained && (
                            <span
                              title={`Detained / Re-admitted: ${p.discrepancyNote || 'Academic year override applied'}`}
                              className="inline-flex items-center gap-1 rounded bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-bold text-orange-600 dark:text-orange-400 border border-orange-500/30"
                            >
                              <span>🟠</span>
                              <span>DETAINED / RE-ADMITTED</span>
                            </span>
                          )}
                          {p.isReferred && (
                            <span
                              title={p.isSquadMember ? `Squad Member of ${p.referredFranchiseName}` : `Referred by ${p.referredFranchiseName}`}
                              className="inline-flex items-center gap-1 rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400 border border-blue-500/30"
                            >
                              <span>🔵</span>
                              <span>
                                {p.isSquadMember
                                  ? `REFERRED ✓ SQUAD MEMBER Team: ${p.referredFranchiseName || 'Franchise'}`
                                  : `REFERRED ${p.referredFranchiseName || 'Franchise'}`}
                              </span>
                            </span>
                          )}
                          {p.discrepancyNote && !p.yearOverride && !p.isDetained && (
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
                    <div className="flex flex-col gap-1 items-start">
                      <div className="flex items-center gap-2">
                        <CategoryBadge bucket={p.bucket} />
                        <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                          {formatCredits(p.status === "SOLD" ? p.soldPrice ?? p.basePrice : p.basePrice)}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1.5 text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted"
                        onClick={() => openChangeBucket(p)}
                      >
                        [ CHANGE BUCKET ]
                      </Button>
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

                      {p.isReferred && !p.isSquadMember && p.referralId && (
                        <Button
                          variant="default"
                          size="sm"
                          className="h-8 px-2.5 text-xs font-bold gap-1 bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                          disabled={addingTeamId === p.id}
                          onClick={() => handleAddToTeam(p)}
                          title={`Add ${p.fullName} to ${p.referredFranchiseName || 'franchise'} squad at ₹0`}
                        >
                          {addingTeamId === p.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <UserPlus className="size-3.5" />
                          )}
                          <span>[ ADD TO TEAM ]</span>
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
            })
          )}
        </Fragment>
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

      {/* Change Bucket Dialog */}
      <Dialog open={!!playerToChangeBucket} onOpenChange={(open) => !open && setPlayerToChangeBucket(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Auction Bucket</DialogTitle>
            <DialogDescription>
              Assign {playerToChangeBucket?.fullName} ({playerToChangeBucket?.rollNumber}) to a different auction tier.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <label className="text-xs font-semibold text-muted-foreground block">
              Select Target Bucket:
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['B1', 'B2', 'B3', 'B4', 'B5', 'PG'] as const).map((b) => (
                <Button
                  key={b}
                  type="button"
                  variant={targetBucket === b ? 'default' : 'outline'}
                  className={`h-10 font-bold text-sm ${targetBucket === b ? 'bg-primary text-primary-foreground' : ''}`}
                  onClick={() => setTargetBucket(b)}
                >
                  {b}
                </Button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Current Bucket: <strong>{playerToChangeBucket?.bucket}</strong>. Updating this bucket changes player pricing and progression sequence.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPlayerToChangeBucket(null)}
              disabled={isChangingBucket}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmChangeBucket}
              disabled={isChangingBucket || Boolean(playerToChangeBucket && targetBucket === playerToChangeBucket.bucket)}
            >
              {isChangingBucket ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
              Save Bucket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
