import { AuctionSpectator } from "@/components/acc/public/auction-spectator"
import { LiveIndicator } from "@/components/acc/status-badges"
import {
  AUCTION_STATE,
  FRANCHISES,
  SALES,
  getFranchise,
  getPlayer,
} from "@/lib/acc/mock-data"

export const metadata = {
  title: "Live Auction",
  description: "Follow the ACC player auction in real time.",
}

export default function PublicAuctionPage() {
  const player = getPlayer(AUCTION_STATE.currentPlayerId)!
  const leading = getFranchise(AUCTION_STATE.leadingFranchiseId)

  const franchises = Object.fromEntries(
    FRANCHISES.map((f) => [f.id, f]),
  ) as Record<string, (typeof FRANCHISES)[number]>

  const recentSales = [...SALES]
    .reverse()
    .slice(0, 6)
    .map((sale) => ({
      sale,
      player: getPlayer(sale.playerId)!,
      franchise: getFranchise(sale.franchiseId)!,
    }))

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6">
      <div className="mb-8 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <LiveIndicator />
          <span className="text-sm font-semibold uppercase tracking-wide text-live">
            Auction floor
          </span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Live auction</h1>
        <p className="max-w-2xl text-muted-foreground">
          A spectator view of the bidding floor. Bids update as franchises compete for the current
          lot. Sign in as a franchise to place bids.
        </p>
      </div>

      <AuctionSpectator
        state={AUCTION_STATE}
        player={player}
        leading={leading}
        franchises={franchises}
        recentSales={recentSales}
      />
    </div>
  )
}
