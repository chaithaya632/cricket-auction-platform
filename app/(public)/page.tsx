import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"
import { Hero } from "@/components/acc/public/hero"
import { CategoryShowcase } from "@/components/acc/public/category-showcase"
import { FranchiseStrip } from "@/components/acc/public/franchise-strip"
import { PlayerCard } from "@/components/acc/player-card"
import { BUCKET_ORDER, formatCredits } from "@/lib/acc/config"
import { createAdminClient } from "@/lib/supabase/admin"
import { getAdminFranchisesList } from "@/lib/franchises/queries"
import { getPublicPlayers } from "@/lib/players/queries"
import { getActiveSeason } from "@/lib/permissions/context"
import type { Bucket } from "@/lib/acc/types"

export const dynamic = "force-dynamic"

export default async function HomePage() {
  const supabase = createAdminClient()
  const activeSeason = await getActiveSeason(supabase)
  const seasonId = activeSeason?.id || "00000000-0000-0000-0000-000000000001"

  const [franchises, players] = await Promise.all([
    getAdminFranchisesList(supabase, seasonId),
    getPublicPlayers(supabase, seasonId),
  ])

  const sold = players.filter((p) => p.status === "SOLD")
  const totalSpend = franchises.reduce((sum, f) => sum + (f.spent ?? 0), 0)

  const counts = BUCKET_ORDER.reduce(
    (acc, b) => {
      acc[b] = players.filter((p) => p.bucket === b).length
      return acc
    },
    {} as Record<Bucket, number>,
  )

  const franchisesWithSize = franchises.map((f) => ({
    ...f,
    squadSize: f.squadCount ?? 0,
  }))

  const featured = [...sold].sort((a, b) => (b.soldPrice ?? 0) - (a.soldPrice ?? 0)).slice(0, 6)

  return (
    <>
      <Hero
        stats={{
          players: players.length,
          franchises: franchises.length,
          sold: sold.length,
          spend: formatCredits(totalSpend),
        }}
      />

      <CategoryShowcase counts={counts} />

      <section className="mx-auto w-full max-w-7xl px-4 pb-16 md:px-6">
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-bold tracking-tight md:text-3xl">Top buys so far</h2>
            <p className="max-w-2xl text-muted-foreground">
              The marquee names already locked in by franchises this season.
            </p>
          </div>
          <Link
            href="/players"
            className="hidden shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline md:inline-flex"
          >
            All players <ArrowRight className="size-4" />
          </Link>
        </div>

        {featured.length > 0 ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((p) => {
              const franchise = p.soldTo ? franchises.find((f) => f.id === p.soldTo) : undefined
              return (
                <PlayerCard key={p.id} player={p} href={`/players/${p.id}`} franchise={franchise} />
              )
            })}
          </div>
        ) : (
          <div className="mt-8 rounded-xl border border-dashed p-8 text-center text-muted-foreground">
            Auction in progress or yet to start. Check back as marquee players are acquired!
          </div>
        )}
      </section>

      <FranchiseStrip franchises={franchisesWithSize} />

      <section className="mx-auto w-full max-w-7xl px-4 py-20 md:px-6">
        <div className="flex flex-col items-center gap-6 rounded-2xl border border-border/60 bg-gradient-to-br from-primary/10 via-card to-accent/10 p-10 text-center md:p-16">
          <h2 className="max-w-2xl text-balance text-3xl font-bold tracking-tight md:text-4xl">
            Ready to join the championship?
          </h2>
          <p className="max-w-xl text-muted-foreground">
            Players register and get verified. Franchise coordinators manage squads and bid live.
            Admins run the auction floor.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/login" className={buttonVariants({ size: "lg" })}>
              Sign in to your portal
            </Link>
            <Link href="/live" className={buttonVariants({ size: "lg", variant: "outline" })}>
              Follow the auction
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
