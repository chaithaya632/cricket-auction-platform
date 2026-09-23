import type { Metadata } from "next"
import Link from "next/link"
import { DashboardShell } from "@/components/acc/dashboard-shell"
import { PageHeader } from "@/components/acc/page-header"
import { StatCard } from "@/components/acc/stat-card"
import { AuctionStatusBadge } from "@/components/acc/status-badges"
import { CategoryDistributionChart, FranchiseSpendChart } from "@/components/acc/admin/dashboard-charts"
import { ActivityPanel } from "@/components/acc/admin/activity-panel"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { buttonVariants } from "@/components/ui/button"
import { SEASON, CATEGORY_CONFIG, BUCKET_ORDER, formatCredits } from "@/lib/acc/config"
import { Users, Shield, Gavel, CircleCheck, CircleX, Wallet, Settings, ShieldAlert } from "lucide-react"
import { getSessionUser } from "@/lib/acc/server-session"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAdmin } from "@/lib/permissions/guards"
import { getAdminFranchisesList } from "@/lib/franchises/queries"
import { getAdminPlayersList } from "@/lib/players/queries"
import type { AuctionStatus, Bucket } from "@/lib/acc/types"

export const metadata: Metadata = { title: "Admin Control Center" }

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>
}) {
  const resolvedParams = searchParams ? await searchParams : undefined
  const hasSettingsError = resolvedParams?.error === "unauthorized_settings"
  const adminContext = await requireAdmin()
  const seasonId = adminContext.activeSeason?.id || "00000000-0000-0000-0000-000000000001"
  const adminClient = createAdminClient()

  const [sessionUser, franchises, players, lotsRes] = await Promise.all([
    getSessionUser("admin"),
    getAdminFranchisesList(adminClient, seasonId),
    getAdminPlayersList(adminClient, seasonId),
    adminClient
      .from("auction_lots")
      .select("*")
      .eq("season_id", seasonId)
      .order("lot_number", { ascending: true }),
  ])

  const lots = lotsRes.data || []
  const registered = players.length
  const soldLots = lots.filter((l) => l.status === "sold")
  const unsoldLots = lots.filter((l) => l.status === "unsold")
  const sold = soldLots.length
  const unsold = unsoldLots.length
  const inProgressLot = lots.find((l) => l.status === "in_progress")

  const totalPurse = franchises.reduce((s, f) => s + (f.budgetTotal || f.startingPurse || 1000), 0)
  const totalSpent = franchises.reduce((s, f) => s + (f.spent || 0), 0)
  const totalLots = lots.length
  const lotNumber = inProgressLot?.lot_number || (sold + unsold > 0 ? sold + unsold : 0)
  const progressPct = totalLots > 0 ? Math.round(((sold + unsold) / totalLots) * 100) : 0

  const currentPlayer = inProgressLot
    ? players.find((p) => p.registrationId === inProgressLot.registration_id)
    : undefined
  const leading = inProgressLot?.highest_bidder_franchise_id
    ? franchises.find((f) => f.id === inProgressLot.highest_bidder_franchise_id)
    : undefined
  const currentPrice = inProgressLot?.current_price || (currentPlayer?.basePrice ?? 0)
  const auctionStatus: AuctionStatus = inProgressLot ? "LIVE" : (sold + unsold === totalLots && totalLots > 0 ? "SOLD" : "IDLE")

  const categoryData = BUCKET_ORDER.map((b) => ({
    bucket: b,
    players: players.filter((p) => p.bucket === b).length,
    fill: `var(--cat-${b.toLowerCase()})`,
  }))

  const spendData = [...franchises]
    .map((f) => ({ name: f.shortCode, spent: f.spent || 0, fill: f.colorHex || "#1d3557" }))
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 8)

  const recentRegistrations = [...players]
    .filter((p) => p.status === "REGISTERED" || p.status === "UNDER_REVIEW" || p.status === "APPROVED")
    .slice(0, 5)

  const recentSales = soldLots
    .slice(-5)
    .reverse()
    .map((lot) => {
      const p = players.find((x) => x.registrationId === lot.registration_id)
      const f = franchises.find((x) => x.id === lot.highest_bidder_franchise_id)
      return {
        sale: {
          saleId: lot.id,
          playerId: p?.id || "",
          franchiseId: f?.id || "",
          bucket: (lot.bucket || "B1") as Bucket,
          finalPrice: lot.current_price || lot.base_price || 0,
          auctionToken: lot.lot_number || 0,
          createdAt: lot.ended_at || lot.updated_at || new Date().toISOString(),
          isUndone: false,
        },
        player: p || {
          id: "",
          rollNumber: "",
          fullName: "Unknown Player",
          photoUrl: "/placeholder.svg",
          course: "UG" as const,
          program: "BTECH",
          branch: "CSE",
          yearOfStudy: 1,
          isLateral: false,
          bucket: "B1" as Bucket,
          playerType: "All-rounder" as const,
          basePrice: 100,
          status: "SOLD" as const,
          registeredAt: new Date().toISOString(),
          cricheroesVerified: false,
          stats: { matches: 0, runs: 0, battingAvg: 0, strikeRate: 0, highestScore: 0, wickets: 0, bowlingAvg: 0, economy: 0, catches: 0, stumpings: 0 },
        },
        franchise: f || {
          id: "",
          teamName: "Unknown Franchise",
          shortCode: "UNK",
          colorHex: "#64748b",
          coordinatorName: "",
          coordinatorDept: "",
          captainName: "",
          viceCaptainName: "",
          startingPurse: 1000,
        },
      }
    })

  return (
    <DashboardShell
      role="admin"
      user={sessionUser}
      breadcrumb="Dashboard"
      actions={
        <div className="flex items-center gap-2">
          <Link href="/admin/settings" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Settings className="size-4" />
            Settings
          </Link>
          <Link href="/admin/auction" className={buttonVariants({ size: "sm" })}>
            <Gavel className="size-4" />
            Open auction console
          </Link>
        </div>
      }
    >
      {hasSettingsError && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
          <ShieldAlert className="size-4 shrink-0" />
          <span>
            Access to <strong>Tournament Settings</strong> is restricted to Super Admin accounts. Match Operators do not have permission to modify system settings.
          </span>
        </div>
      )}

      <PageHeader
        eyebrow={`Admin Control Center · ${SEASON}`}
        title="Tournament operations overview"
        description="Live snapshot of registrations, franchises and auction progress."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Registered players" value={registered} icon={<Users />} sub="Across all categories" />
        <StatCard label="Active franchises" value={franchises.length} icon={<Shield />} sub="Season squads" />
        <StatCard label="Players sold" value={sold} accent="success" icon={<CircleCheck />} sub={`${unsold} unsold`} />
        <StatCard
          label="Total purse"
          value={formatCredits(totalPurse)}
          icon={<Wallet />}
          sub={`${formatCredits(totalSpent)} committed`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Auction progress</CardTitle>
              <AuctionStatusBadge status={auctionStatus} />
            </div>
            <span className="font-mono text-xs text-muted-foreground">
              LOT {lotNumber} / {totalLots}
            </span>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Lots completed</span>
                <span className="font-semibold tabular-nums">{progressPct}%</span>
              </div>
              <Progress value={progressPct} />
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard label="Current lot" value={`#${lotNumber}`} accent="primary" icon={<Gavel />} />
              <StatCard label="Sold" value={sold} accent="success" icon={<CircleCheck />} />
              <StatCard label="Unsold" value={unsold} accent="destructive" icon={<CircleX />} />
              <StatCard label="Remaining" value={Math.max(0, totalLots - lotNumber)} icon={<Users />} />
            </div>
            {currentPlayer && (
              <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
                <div className="flex min-w-0 flex-col">
                  <span className="text-xs text-muted-foreground">On the block now</span>
                  <span className="truncate font-semibold">{currentPlayer.fullName}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-xs text-muted-foreground">
                    {leading ? `Leading · ${leading.shortCode}` : "No bids"}
                  </span>
                  <span className="font-bold tabular-nums text-primary">
                    {formatCredits(currentPrice)}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <CategoryDistributionChart data={categoryData} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <FranchiseSpendChart data={spendData} />
        <ActivityPanel
          registrations={recentRegistrations}
          sales={recentSales}
          franchiseOf={(id) => franchises.find((f) => f.id === id)}
        />
      </div>
    </DashboardShell>
  )
}
