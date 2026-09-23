import { PlayerDirectory } from "@/components/acc/public/player-directory"
import { createAdminClient } from "@/lib/supabase/admin"
import { getPublicPlayers } from "@/lib/players/queries"
import { getActiveSeason } from "@/lib/permissions/context"

export const metadata = {
  title: "Players",
  description: "Browse every registered player in the ACC auction pool.",
}

export const dynamic = "force-dynamic"

export default async function PlayersPage() {
  const supabase = createAdminClient()
  const activeSeason = await getActiveSeason(supabase)
  const seasonId = activeSeason?.id || "00000000-0000-0000-0000-000000000001"
  const players = await getPublicPlayers(supabase, seasonId)

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6">
      <div className="mb-8 flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Player pool</h1>
        <p className="max-w-2xl text-muted-foreground">
          Every registered player, bucketed by category. Filter by type, status, or search by name
          and roll number.
        </p>
      </div>
      <PlayerDirectory players={players} />
    </div>
  )
}
