import Link from "next/link"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { FranchiseCrest } from "@/components/acc/franchise-crest"
import { PurseBar } from "@/components/acc/purse-bar"
import {
  FRANCHISES,
  franchiseSquad,
  franchiseSpend,
  franchisePurse,
} from "@/lib/acc/mock-data"
import { formatCredits, STARTING_PURSE } from "@/lib/acc/config"

export const metadata = {
  title: "Franchises",
  description: "The teams competing in the ACC auction.",
}

export default function TeamsPage() {
  const teams = FRANCHISES.map((f) => ({
    ...f,
    squad: franchiseSquad(f.id),
    spend: franchiseSpend(f.id),
    purse: franchisePurse(f.id),
  }))

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6">
      <div className="mb-8 flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Franchises</h1>
        <p className="max-w-2xl text-muted-foreground">
          {teams.length} teams building their squads across all six player categories.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {teams.map((t) => (
          <Link key={t.id} href={`/teams/${t.id}`}>
            <Card className="group h-full transition-colors hover:border-primary/40">
              <CardHeader className="flex-row items-center gap-3">
                <FranchiseCrest franchise={t} size="lg" />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold leading-tight">{t.teamName}</span>
                  <span className="text-xs text-muted-foreground">
                    Captain {t.captainName}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="flex flex-col rounded-lg border bg-muted/20 p-2">
                    <span className="text-lg font-bold tabular-nums">{t.squad.length}</span>
                    <span className="text-[11px] text-muted-foreground">Players</span>
                  </div>
                  <div className="flex flex-col rounded-lg border bg-muted/20 p-2">
                    <span className="text-lg font-bold tabular-nums">{formatCredits(t.spend)}</span>
                    <span className="text-[11px] text-muted-foreground">Spent</span>
                  </div>
                  <div className="flex flex-col rounded-lg border bg-muted/20 p-2">
                    <span className="text-lg font-bold tabular-nums text-success">{formatCredits(t.purse)}</span>
                    <span className="text-[11px] text-muted-foreground">Purse</span>
                  </div>
                </div>
                <PurseBar spent={t.spend} total={STARTING_PURSE} />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
