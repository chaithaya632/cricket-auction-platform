"use client"

// =============================================================================
// ACC Auction Portal — Admin Player Review & Eligibility Dialog
// =============================================================================

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CategoryBadge } from "@/components/acc/category-badge"
import { PlayerStatusBadge } from "@/components/acc/status-badges"
import {
  adminSetPlayerPaymentAction,
  adminSetCricHeroesStatusAction,
  adminApprovePlayerRegistrationAction,
  adminTogglePlayerBlockAction,
  adminOverridePlayerAcademicYearAction,
} from "@/lib/players/actions"
import { toast } from "sonner"
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Shield,
  CreditCard,
  ExternalLink,
  Ban,
  UserCheck,
  Award,
  Calendar,
  Loader2,
  Phone,
  FileText,
} from "lucide-react"
import type { Player } from "@/lib/acc/types"
import type { CricHeroesStatus } from "@/lib/constants"

interface PlayerReviewDialogProps {
  player: Player | null
  open: boolean
  onOpenChange: (open: boolean) => void
  isSuperAdmin?: boolean
}

export function PlayerReviewDialog({
  player,
  open,
  onOpenChange,
  isSuperAdmin = true,
}: PlayerReviewDialogProps) {
  const router = useRouter()
  const [loadingAction, setLoadingAction] = useState<string | null>(null)

  // Override year state
  const [showOverride, setShowOverride] = useState(false)
  const [overrideYear, setOverrideYear] = useState(player?.yearOfStudy?.toString() || "1")
  const [overrideReason, setOverrideReason] = useState("")

  if (!player) return null

  const isEligible = player.isAuctionEligible ?? false
  const isPaid = player.paymentStatus === "paid"
  const isBlocked = player.isActive === false
  const cricheroesStatus = player.cricheroesStatus || "unverified"
  const hasReg = Boolean(player.registrationId)

  // Handlers
  async function handleTogglePayment() {
    if (!player?.registrationId) {
      toast.error("Player has not submitted a season registration yet.")
      return
    }
    setLoadingAction("payment")
    try {
      const nextStatus = isPaid ? "unpaid" : "paid"
      const res = await adminSetPlayerPaymentAction(player.registrationId, nextStatus)
      if (!res.success) {
        toast.error(res.error || "Failed to update payment status")
      } else {
        toast.success(
          nextStatus === "paid"
            ? "Payment verified. Eligibility re-evaluated."
            : "Payment marked unpaid."
        )
        router.refresh()
      }
    } catch (err: any) {
      toast.error(err?.message || "An unexpected error occurred")
    } finally {
      setLoadingAction(null)
    }
  }

  async function handleSetCricHeroes(status: CricHeroesStatus) {
    if (!player?.registrationId) {
      toast.error("Player has not submitted a season registration yet.")
      return
    }
    setLoadingAction("cricheroes")
    try {
      const res = await adminSetCricHeroesStatusAction(player.registrationId, status)
      if (!res.success) {
        toast.error(res.error || "Failed to update CricHeroes status")
      } else {
        toast.success(`CricHeroes status updated to ${status}.`)
        router.refresh()
      }
    } catch (err: any) {
      toast.error(err?.message || "An unexpected error occurred")
    } finally {
      setLoadingAction(null)
    }
  }

  async function handleApproveRegistration(decision: "approved" | "rejected" | "under_review") {
    if (!player?.registrationId) {
      toast.error("Player has not submitted a season registration yet.")
      return
    }
    setLoadingAction("approve")
    try {
      const res = await adminApprovePlayerRegistrationAction(player.registrationId, decision)
      if (!res.success) {
        toast.error(res.error || "Failed to update registration status")
      } else {
        toast.success(`Registration ${decision}.`)
        router.refresh()
      }
    } catch (err: any) {
      toast.error(err?.message || "An unexpected error occurred")
    } finally {
      setLoadingAction(null)
    }
  }

  async function handleToggleBlock() {
    if (!player) return
    setLoadingAction("block")
    try {
      const res = await adminTogglePlayerBlockAction(player.id, !isBlocked)
      if (!res.success) {
        toast.error(res.error || "Failed to update player block state")
      } else {
        toast.success(isBlocked ? "Player unblocked." : "Player blocked from tournament.")
        router.refresh()
      }
    } catch (err: any) {
      toast.error(err?.message || "An unexpected error occurred")
    } finally {
      setLoadingAction(null)
    }
  }

  async function handleApplyYearOverride() {
    if (!player?.registrationId) {
      toast.error("Registration record required for year override.")
      return
    }
    if (!overrideReason.trim() || overrideReason.trim().length < 5) {
      toast.error("A reason of at least 5 characters is required for year override.")
      return
    }
    setLoadingAction("override")
    try {
      const regId = player.registrationId
      const res = await adminOverridePlayerAcademicYearAction(
        regId,
        parseInt(overrideYear, 10),
        overrideReason.trim()
      )
      if (!res.success) {
        toast.error(res.error || "Failed to apply year override")
      } else {
        toast.success(`Academic year overridden to Year ${overrideYear}. Bucket updated to ${res.data?.newBucket}.`)
        setShowOverride(false)
        router.refresh()
      }
    } catch (err: any) {
      toast.error(err?.message || "An unexpected error occurred")
    } finally {
      setLoadingAction(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        {/* Modal Header */}
        <div className="p-6 border-b bg-muted/20">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <Avatar className="size-16 rounded-xl border-2 border-border shadow-sm">
                <AvatarImage src={player.photoUrl || "/placeholder.svg"} alt={player.fullName} />
                <AvatarFallback className="rounded-xl text-base font-bold">
                  {player.fullName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold tracking-tight">{player.fullName}</h2>
                  {isBlocked && (
                    <Badge variant="destructive" className="text-xs">
                      BLOCKED
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                  <span className="font-mono font-bold text-foreground">{player.rollNumber}</span>
                  <span>·</span>
                  <span>{player.program}</span>
                  <span>·</span>
                  <span>{player.branch}</span>
                  <span>·</span>
                  <span>Year {player.yearOfStudy}</span>
                  <span>·</span>
                  <CategoryBadge bucket={player.bucket} />
                </div>
                {player.mobile && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                    <Phone className="size-3" />
                    <span>Contact: {player.mobile} (Private)</span>
                  </div>
                )}
              </div>
            </div>

            {/* Overall Eligibility Pill */}
            <div className="text-right">
              {isEligible ? (
                <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white font-bold px-3 py-1 text-xs gap-1.5 shadow-sm">
                  <CheckCircle2 className="size-4" />
                  AUCTION ELIGIBLE
                </Badge>
              ) : (
                <Badge variant="destructive" className="font-bold px-3 py-1 text-xs gap-1.5 shadow-sm">
                  <AlertTriangle className="size-4" />
                  NOT ELIGIBLE
                </Badge>
              )}
              <div className="mt-1">
                <PlayerStatusBadge status={player.status} />
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 1. Missing Requirements Alert (if any) */}
          {player.eligibilityReasons && player.eligibilityReasons.length > 0 && !isEligible && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-600 dark:text-amber-400">
                <AlertTriangle className="size-4 shrink-0" />
                <span>Eligibility Requirements Pending ({player.eligibilityReasons.length}):</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground pl-1">
                {player.eligibilityReasons.map((reason, idx) => (
                  <li key={idx}>{reason}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Student-Flagged Year Discrepancy Alert (§4.1 Detained Student Policy) */}
          {player.discrepancyNote && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-600 dark:text-amber-400">
                <AlertTriangle className="size-4 shrink-0" />
                <span>Student-Flagged Academic Year Discrepancy (§4.1 Detained Student Queue):</span>
              </div>
              <p className="font-mono text-xs bg-background/80 p-2.5 rounded-lg border border-amber-500/20 text-foreground">
                &ldquo;{player.discrepancyNote}&rdquo;
              </p>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                <span>
                  {player.yearOverride
                    ? `Overridden by Super Admin: Year ${player.yearOverride} (${player.yearOverrideReason})`
                    : "Action required: Verify against college examination records and apply Year Override below if confirmed."}
                </span>
                {!showOverride && isSuperAdmin && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[11px] px-2 border-amber-500/40 text-amber-600 hover:text-amber-700"
                    onClick={() => setShowOverride(true)}
                  >
                    Open Year Override
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* 2. Structured Eligibility Checklist (§1, §2) */}
          <div className="rounded-xl border p-4 bg-card space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Official Eligibility Verification Pipeline
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {/* Profile */}
              <div className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/20">
                <div className="flex items-center gap-2">
                  {player.rollNumber !== "PENDING" && player.fullName ? (
                    <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                  ) : (
                    <XCircle className="size-4 text-destructive shrink-0" />
                  )}
                  <div>
                    <span className="font-semibold block">Personal Profile</span>
                    <span className="text-[11px] text-muted-foreground">
                      {player.rollNumber !== "PENDING" ? "Completed" : "Awaiting student submission"}
                    </span>
                  </div>
                </div>
                <span className="font-mono text-[11px]">{player.rollNumber}</span>
              </div>

              {/* Academic Classification */}
              <div className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/20">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                  <div>
                    <span className="font-semibold block">Academic Classification</span>
                    <span className="text-[11px] text-muted-foreground">
                      {player.yearOverride
                        ? `Overridden: Year ${player.yearOverride}`
                        : `Derived: Year ${player.yearOfStudy}`}
                    </span>
                  </div>
                </div>
                <CategoryBadge bucket={player.bucket} />
              </div>

              {/* Skills */}
              <div className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/20">
                <div className="flex items-center gap-2">
                  {player.hasSkillProfile ? (
                    <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                  ) : (
                    <XCircle className="size-4 text-destructive shrink-0" />
                  )}
                  <div>
                    <span className="font-semibold block">Cricket Skill Questionnaire</span>
                    <span className="text-[11px] text-muted-foreground">
                      {player.hasSkillProfile ? `Role: ${player.playerType}` : "Incomplete"}
                    </span>
                  </div>
                </div>
                <Badge variant="outline" className="text-[11px]">
                  {player.playerType}
                </Badge>
              </div>

              {/* Payment */}
              <div className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/20">
                <div className="flex items-center gap-2">
                  {isPaid ? (
                    <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                  ) : (
                    <XCircle className="size-4 text-destructive shrink-0" />
                  )}
                  <div>
                    <span className="font-semibold block">Offline Tournament Fee</span>
                    <span className="text-[11px] text-muted-foreground">
                      {isPaid ? "Payment Verified" : "Unpaid / Pending Verification"}
                    </span>
                  </div>
                </div>
                <Badge
                  variant={isPaid ? "default" : "outline"}
                  className={isPaid ? "bg-emerald-600 text-white" : "border-amber-500 text-amber-500"}
                >
                  {isPaid ? "PAID" : "UNPAID"}
                </Badge>
              </div>

              {/* CricHeroes */}
              <div className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/20">
                <div className="flex items-center gap-2">
                  {cricheroesStatus === "verified" ? (
                    <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                  ) : (
                    <AlertTriangle className="size-4 text-amber-500 shrink-0" />
                  )}
                  <div>
                    <span className="font-semibold block">CricHeroes Status</span>
                    <span className="text-[11px] text-muted-foreground capitalize">
                      {cricheroesStatus.replace(/_/g, " ")}
                    </span>
                  </div>
                </div>
                {player.cricheroesUrl && (
                  <a
                    href={player.cricheroesUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline text-[11px]"
                  >
                    <span>View Link</span>
                    <ExternalLink className="size-3" />
                  </a>
                )}
              </div>

              {/* Admin Approval */}
              <div className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/20">
                <div className="flex items-center gap-2">
                  {player.registrationStatus === "eligible" ? (
                    <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                  ) : (
                    <AlertTriangle className="size-4 text-amber-500 shrink-0" />
                  )}
                  <div>
                    <span className="font-semibold block">Coordinator Approval</span>
                    <span className="text-[11px] text-muted-foreground capitalize">
                      {player.registrationStatus?.replace(/_/g, " ") || "Draft"}
                    </span>
                  </div>
                </div>
                <Badge variant="outline" className="capitalize text-[11px]">
                  {player.registrationStatus?.replace(/_/g, " ") || "Draft"}
                </Badge>
              </div>
            </div>
          </div>

          {/* 3. Self-Declared Career Statistics (§10) */}
          <div className="rounded-xl border p-4 bg-card space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Award className="size-4 text-primary" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Career Statistics
                </h3>
              </div>
              <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400 text-[10px] font-bold">
                SELF-DECLARED (UNVERIFIED)
              </Badge>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
              <div className="rounded-lg border p-2 bg-muted/10">
                <span className="text-[10px] text-muted-foreground block">Matches</span>
                <span className="font-bold text-sm tabular-nums">{player.stats.matches}</span>
              </div>
              <div className="rounded-lg border p-2 bg-muted/10">
                <span className="text-[10px] text-muted-foreground block">Runs</span>
                <span className="font-bold text-sm tabular-nums">{player.stats.runs}</span>
              </div>
              <div className="rounded-lg border p-2 bg-muted/10">
                <span className="text-[10px] text-muted-foreground block">Batting Avg</span>
                <span className="font-bold text-sm tabular-nums">{player.stats.battingAvg}</span>
              </div>
              <div className="rounded-lg border p-2 bg-muted/10">
                <span className="text-[10px] text-muted-foreground block">Wickets</span>
                <span className="font-bold text-sm tabular-nums">{player.stats.wickets}</span>
              </div>
              <div className="rounded-lg border p-2 bg-muted/10">
                <span className="text-[10px] text-muted-foreground block">Economy</span>
                <span className="font-bold text-sm tabular-nums">{player.stats.economy}</span>
              </div>
            </div>
          </div>

          {/* 4. Super Admin Governance Actions */}
          <div className="rounded-xl border p-4 bg-card space-y-4">
            <div className="flex items-center gap-2">
              <Shield className="size-4 text-primary" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Coordinator Review Actions
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Payment Verification Button */}
              <Button
                variant={isPaid ? "outline" : "default"}
                size="sm"
                className="justify-center gap-1.5 h-9 text-xs"
                disabled={loadingAction !== null || !hasReg}
                onClick={handleTogglePayment}
              >
                {loadingAction === "payment" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <CreditCard className="size-3.5" />
                )}
                {isPaid ? "Mark Unpaid" : "Verify Payment (Paid)"}
              </Button>

              {/* CricHeroes Status Selector */}
              <Button
                variant="outline"
                size="sm"
                className="justify-center gap-1.5 h-9 text-xs"
                disabled={loadingAction !== null || !hasReg}
                onClick={() =>
                  handleSetCricHeroes(
                    cricheroesStatus === "verified"
                      ? "profile_creation_pending"
                      : "verified"
                  )
                }
              >
                {loadingAction === "cricheroes" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-3.5 text-emerald-500" />
                )}
                {cricheroesStatus === "verified" ? "Reset CricHeroes" : "Verify CricHeroes"}
              </Button>

              {/* Registration Approval Button */}
              <Button
                variant={player.registrationStatus === "eligible" ? "secondary" : "default"}
                size="sm"
                className="justify-center gap-1.5 h-9 text-xs"
                disabled={loadingAction !== null || !hasReg}
                onClick={() =>
                  handleApproveRegistration(
                    player.registrationStatus === "eligible" ? "under_review" : "approved"
                  )
                }
              >
                {loadingAction === "approve" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <UserCheck className="size-3.5" />
                )}
                {player.registrationStatus === "eligible"
                  ? "Revert to Under Review"
                  : "Approve Registration"}
              </Button>
            </div>

            {/* Additional Actions: Year Override & Block */}
            {isSuperAdmin && (
              <div className="pt-3 border-t flex flex-wrap gap-2 justify-between items-center">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1.5"
                  onClick={() => setShowOverride(!showOverride)}
                  disabled={!hasReg}
                >
                  <Calendar className="size-3.5" />
                  <span>Detained Student Year Override</span>
                </Button>

                <Button
                  variant={isBlocked ? "outline" : "destructive"}
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  disabled={loadingAction !== null}
                  onClick={handleToggleBlock}
                >
                  <Ban className="size-3.5" />
                  <span>{isBlocked ? "Unblock Player Account" : "Block Player from Auction"}</span>
                </Button>
              </div>
            )}

            {/* Year Override Sub-Form */}
            {showOverride && (
              <div className="p-3 rounded-lg border bg-muted/20 space-y-3 mt-2 text-xs">
                <span className="font-bold text-xs block">
                  Override Academic Year (§4.1 Detained Student Policy)
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-[11px]">Academic Year (1–6)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={6}
                      className="h-8 text-xs mt-1"
                      value={overrideYear}
                      onChange={(e) => setOverrideYear(e.target.value)}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-[11px]">Audit Reason (Required)</Label>
                    <Input
                      placeholder="e.g. Detained in 2024, re-admitted to Year 2"
                      className="h-8 text-xs mt-1"
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setShowOverride(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-primary"
                    disabled={loadingAction !== null}
                    onClick={handleApplyYearOverride}
                  >
                    {loadingAction === "override" && (
                      <Loader2 className="size-3 animate-spin mr-1" />
                    )}
                    Apply Override
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t bg-muted/10 flex justify-end">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
