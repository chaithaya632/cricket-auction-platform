import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { FranchiseCrest } from "@/components/acc/franchise-crest"
import { ArrowRight } from "lucide-react"
import type { Franchise } from "@/lib/acc/types"

export function FranchiseStrip({
  franchises,
}: {
  franchises: (Franchise & { squadSize: number })[]
}) {
  return (
    <section className="border-y border-border/60 bg-card/30">
      <div className="mx-auto w-full max-w-7xl px-4 py-16 md:px-6">
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-bold tracking-tight md:text-3xl">The franchises</h2>
            <p className="max-w-2xl text-muted-foreground">
              {franchises.length} teams representing departments and campuses across Avanthi.
            </p>
          </div>
          <Link
            href="/teams"
            className="hidden shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline md:inline-flex"
          >
            All teams <ArrowRight className="size-4" />
          </Link>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {franchises.map((f) => (
            <Link key={f.id} href={`/teams/${f.id}`}>
              <Card className="group h-full gap-0 py-0 transition-colors hover:border-primary/40">
                <CardContent className="flex items-center gap-3 p-4">
                  <FranchiseCrest franchise={f} size="lg" />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-semibold leading-tight">{f.teamName}</span>
                    <span className="text-xs text-muted-foreground">{f.squadSize} players · {f.coordinatorDept}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
