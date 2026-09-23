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
import {
  PLAYERS,
  FRANCHISES,
  SALES,
  AUCTION_STATE,
  getPlayer,
  getFranchise,
  franchiseSpend,
} from "@/lib/acc/mock-data"
import { Users, Shield, Gavel, CircleCheck, CircleX, Wallet, Settings, ShieldAlert } from "lucide-react"

import { getSessionUser } from "@/lib/acc/server-session"

export const metadata: Metadata = { title: "Admin Control Center" }

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>
}) {
  const resolvedParams = searchParams ? await searchParams : undefined
  const hasSettingsError = resolvedParams?.error === "unauthorized_settings"
  const sessionUser = await getSessionUser("admin")
  const registered = PLAYERS.length
  const sold = PLAYERS.filter((p) => p.status === "SOLD").length
  const unsold = PLAYERS.filter((p) => p.status === "UNSOLD").length
  const totalPurse = FRANCHISES.reduce((s, f) => s + f.startingPurse, 0)
  const totalSpent = SALES.reduce((s, r) => s + r.finalPrice, 0)
  const progressPct = Math.round((AUCTION_STATE.lotNumber / AUCTION_STATE.totalLots) * 100)
  const currentPlayer = getPlayer(AUCTION_STATE.currentPlayerId)
  const leading = getFranchise(AUCTION_STATE.leadingFranchiseId)

  const categoryData = BUCKET_ORDER.map((b) => ({
    bucket: b,
    players: PLAYERS.filter((p) => p.bucket === b).length,
    fill: `var(--cat-${b.toLowerCase()})`,
  }))

  const spendData = [...FRANCHISES]
    .map((f) => ({ name: f.shortCode, spent: franchiseSpend(f.id), fill: f.colorHex }))
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 8)

  const recentRegistrations = [...PLAYERS]
    .filter((p) => p.status === "REGISTERED" || p.status === "UNDER_REVIEW")
    .slice(0, 5)

  const recentSales = [...SALES]
    .slice(-5)
    .reverse()
    .map((sale) => ({
      sale,
      player: getPlayer(sale.playerId)!,
      franchise: getFranchise(sale.franchiseId)!,
    }))

  return (
    <DashboardShell
      role="admin"
      user={sessionUser}
      breadcrumb="Dashboard"
      actions={
        <div className="flex items-center gap-2">
          <Link href="/admin/settings" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Settings className="size-4" />
            Settings & Demo Mode
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
            Access to <strong>Tournament Settings & Demo Mode</strong> is restricted to Super Admin accounts. Match Operators do not have permission to modify system settings.
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
        <StatCard label="Active franchises" value={FRANCHISES.length} icon={<Shield />} sub="Season squads" />
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
              <AuctionStatusBadge status={AUCTION_STATE.status} />
            </div>
            <span className="font-mono text-xs text-muted-foreground">
              LOT {AUCTION_STATE.lotNumber} / {AUCTION_STATE.totalLots}
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
              <StatCard label="Current lot" value={`#${AUCTION_STATE.lotNumber}`} accent="primary" icon={<Gavel />} />
              <StatCard label="Sold" value={sold} accent="success" icon={<CircleCheck />} />
              <StatCard label="Unsold" value={unsold} accent="destructive" icon={<CircleX />} />
              <StatCard label="Remaining" value={AUCTION_STATE.totalLots - AUCTION_STATE.lotNumber} icon={<Users />} />
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
                    {formatCredits(AUCTION_STATE.currentPrice)}
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
          franchiseOf={(id) => getFranchise(id)}
        />
      </div>
    </DashboardShell>
  )
}
