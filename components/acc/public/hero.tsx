import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { LiveIndicator } from "@/components/acc/status-badges"
import { SEASON } from "@/lib/acc/config"
import { ArrowRight, Gavel } from "lucide-react"

export function Hero({
  stats,
}: {
  stats: { players: number; franchises: number; sold: number; spend: string }
}) {
  return (
    <section className="relative overflow-hidden border-b border-border/60">
      <div className="absolute inset-0">
        <Image
          src="/hero-stadium.png"
          alt=""
          fill
          priority
          className="object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/85 to-background" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-transparent to-transparent" />
      </div>

      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-20 md:px-6 md:py-28">
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-live/40 bg-live/10 px-3 py-1 text-xs font-semibold text-live">
              <LiveIndicator />
              Auction live now
            </span>
            <span className="rounded-full border border-border bg-card/60 px-3 py-1 font-mono text-xs text-muted-foreground">
              {SEASON}
            </span>
          </div>

          <h1 className="max-w-3xl text-balance text-4xl font-bold tracking-tight md:text-6xl">
            Campus cricket meets the{" "}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              bidding floor
            </span>
          </h1>

          <p className="max-w-xl text-pretty text-lg text-muted-foreground">
            The Avanthi Cricket Championship auction portal. Register talent, build franchises, and
            watch every bid land in real time as teams battle for the season&apos;s best players.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button render={<Link href="/auction" />} size="lg">
              <Gavel data-icon="inline-start" />
              Watch the live auction
            </Button>
            <Button render={<Link href="/players" />} size="lg" variant="outline">
              Explore players
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60 md:max-w-2xl md:grid-cols-4">
          {[
            { label: "Players", value: stats.players },
            { label: "Franchises", value: stats.franchises },
            { label: "Sold", value: stats.sold },
            { label: "Total spend", value: stats.spend },
          ].map((s) => (
            <div key={s.label} className="flex flex-col gap-1 bg-card/80 p-4 backdrop-blur">
              <dt className="text-xs font-medium text-muted-foreground">{s.label}</dt>
              <dd className="text-2xl font-bold tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
