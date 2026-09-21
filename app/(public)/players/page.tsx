import { PlayerDirectory } from "@/components/acc/public/player-directory"
import { PLAYERS } from "@/lib/acc/mock-data"

export const metadata = {
  title: "Players",
  description: "Browse every registered player in the ACC auction pool.",
}

export default function PlayersPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6">
      <div className="mb-8 flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Player pool</h1>
        <p className="max-w-2xl text-muted-foreground">
          Every registered player, bucketed by category. Filter by type, status, or search by name
          and roll number.
        </p>
      </div>
      <PlayerDirectory players={PLAYERS} />
    </div>
  )
}
