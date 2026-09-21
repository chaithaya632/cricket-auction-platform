import { notFound } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty"
import { FranchiseCrest } from "@/components/acc/franchise-crest"
import { PurseBar } from "@/components/acc/purse-bar"
import { StatCard } from "@/components/acc/stat-card"
import { PlayerCard } from "@/components/acc/player-card"
import { CategoryChip } from "@/components/acc/category-badge"
import {
  FRANCHISES,
  getFranchise,
  franchiseSquad,
  franchiseSpend,
  franchisePurse,
  bucketCounts,
} from "@/lib/acc/mock-data"
import { BUCKET_ORDER, formatCredits, MIN_PER_BUCKET, STARTING_PURSE, TARGET_SQUAD } from "@/lib/acc/config"
import { ArrowLeft, Users, Wallet, TrendingDown } from "lucide-react"

export function generateStaticParams() {
  return FRANCHISES.map((f) => ({ id: f.id }))
}

export default async function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const team = getFranchise(id)
  if (!team) notFound()

  const squad = franchiseSquad(id)
  const spend = franchiseSpend(id)
  const purse = franchisePurse(id)
  const counts = bucketCounts(id)

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6">
      <Button render={<Link href="/teams" />} variant="ghost" size="sm" className="mb-6 -ml-2 w-fit">
        <ArrowLeft data-icon="inline-start" />
        All franchises
      </Button>

      {/* Header */}
      <div
        className="relative overflow-hidden rounded-2xl border p-6 md:p-8"
        style={{
          background: `linear-gradient(135deg, ${team.colorHex}22, transparent 60%)`,
        }}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <FranchiseCrest franchise={team} size="xl" />
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{team.teamName}</h1>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>Coordinator: {team.coordinatorName} ({team.coordinatorDept})</span>
              <span>Captain: {team.captainName}</span>
              <span>Vice-captain: {team.viceCaptainName}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Squad size" value={`${squad.length} / ${TARGET_SQUAD}`} icon={<Users />} />
        <StatCard label="Total spend" value={formatCredits(spend)} icon={<TrendingDown />} accent="destructive" />
        <StatCard label="Purse remaining" value={formatCredits(purse)} icon={<Wallet />} accent="success" />
        <StatCard
          label="Avg. per player"
          value={squad.length ? formatCredits(Math.round(spend / squad.length)) : "—"}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_2fr]">
        {/* Left: purse + bucket composition */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Purse</CardTitle>
            </CardHeader>
            <CardContent>
              <PurseBar spent={spend} total={STARTING_PURSE} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Category composition</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {BUCKET_ORDER.map((b) => {
                const ok = counts[b] >= MIN_PER_BUCKET
                return (
                  <div key={b} className="flex items-center gap-3">
                    <CategoryChip bucket={b} />
                    <div className="flex-1">
                      <Separator />
                    </div>
                    <span className="font-mono text-sm tabular-nums">
                      {counts[b]}
                      <span className="text-muted-foreground"> / {MIN_PER_BUCKET} min</span>
                    </span>
                    <span
                      className={
                        ok ? "text-xs font-medium text-success" : "text-xs font-medium text-warning"
                      }
                    >
                      {ok ? "Met" : "Short"}
                    </span>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>

        {/* Right: squad */}
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Squad ({squad.length})</h2>
          {squad.length === 0 ? (
            <Empty className="rounded-xl border border-dashed">
              <EmptyHeader>
                <EmptyTitle>No players yet</EmptyTitle>
                <EmptyDescription>This franchise has not won any lots.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {squad.map((p) => (
                <PlayerCard key={p.id} player={p} href={`/players/${p.id}`} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
