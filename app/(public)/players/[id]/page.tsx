import { notFound } from "next/navigation"
import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { CategoryBadge } from "@/components/acc/category-badge"
import { PlayerStatusBadge } from "@/components/acc/status-badges"
import { SkillBadges } from "@/components/acc/skill-badges"
import { PlayerStatsBlock } from "@/components/acc/player-stats"
import { FranchiseCrest } from "@/components/acc/franchise-crest"
import { VerifiedIcon } from "@/components/acc/icons"
import { formatCredits } from "@/lib/acc/config"
import { ArrowLeft } from "lucide-react"
import { createAdminClient } from "@/lib/supabase/admin"
import { getPublicPlayers } from "@/lib/players/queries"
import { getAdminFranchisesList } from "@/lib/franchises/queries"
import { getActiveSeason } from "@/lib/permissions/context"

export const dynamic = "force-dynamic"

export default async function PlayerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const activeSeason = await getActiveSeason(supabase)
  const seasonId = activeSeason?.id || "00000000-0000-0000-0000-000000000001"

  const [players, franchises] = await Promise.all([
    getPublicPlayers(supabase, seasonId),
    getAdminFranchisesList(supabase, seasonId),
  ])

  const player = players.find((p) => p.id === id)
  if (!player) notFound()

  const franchise = player.soldTo ? franchises.find((f) => f.id === player.soldTo) : undefined

  const details: { label: string; value: string }[] = [
    { label: "Roll number", value: player.rollNumber },
    { label: "Course", value: player.course },
    { label: "Program", value: player.program },
    { label: "Branch", value: player.branch },
    { label: "Year of study", value: `Year ${player.yearOfStudy}` },
    { label: "Entry", value: player.isLateral ? "Lateral" : "Regular" },
  ]

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6">
      <Link
        href="/players"
        className={buttonVariants({ variant: "ghost", size: "sm", className: "mb-6 -ml-2 w-fit" })}
      >
        <ArrowLeft data-icon="inline-start" />
        Player pool
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        {/* Left: identity card */}
        <div className="flex flex-col gap-6">
          <Card className="overflow-hidden">
            <div className="h-2 w-full bg-gradient-to-r from-primary to-accent" />
            <CardContent className="flex flex-col items-center gap-4 pt-6 text-center">
              <Avatar className="size-28 rounded-2xl border">
                <AvatarImage src={player.photoUrl || "/placeholder.svg"} alt={player.fullName} />
                <AvatarFallback className="rounded-2xl text-3xl">
                  {player.fullName.slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight">{player.fullName}</h1>
                <div className="flex items-center gap-2">
                  <CategoryBadge bucket={player.bucket} />
                  <PlayerStatusBadge status={player.status} />
                </div>
                <SkillBadges playerType={player.playerType} />
                {player.cricheroesVerified && (
                  <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-accent">
                    <VerifiedIcon className="size-3.5" />
                    CricHeroes verified
                  </span>
                )}
              </div>

              <Separator />

              <dl className="grid w-full grid-cols-2 gap-3 text-left">
                {details.map((d) => (
                  <div key={d.label} className="flex flex-col">
                    <dt className="text-xs text-muted-foreground">{d.label}</dt>
                    <dd className="text-sm font-medium">{d.value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Auction</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Base price</span>
                <span className="font-semibold tabular-nums">{formatCredits(player.basePrice)}</span>
              </div>
              {player.status === "SOLD" && franchise ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Sold for</span>
                    <span className="font-semibold tabular-nums text-success">
                      {formatCredits(player.soldPrice ?? 0)}
                    </span>
                  </div>
                  <Separator />
                  <Link
                    href={`/teams/${franchise.id}`}
                    className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:border-primary/40"
                  >
                    <FranchiseCrest franchise={franchise} size="md" />
                    <div className="flex flex-col">
                      <span className="text-xs text-muted-foreground">Signed by</span>
                      <span className="text-sm font-semibold">{franchise.teamName}</span>
                    </div>
                  </Link>
                </>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Token</span>
                  <span className="font-mono text-sm">#{player.auctionToken}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: stats */}
        <PlayerStatsBlock stats={player.stats} />
      </div>
    </div>
  )
}
