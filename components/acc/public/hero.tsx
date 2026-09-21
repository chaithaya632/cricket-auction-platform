import Link from "next/link"
import Image from "next/image"
import { buttonVariants } from "@/components/ui/button"
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

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 md:px-6">
        <div className="flex max-w-3xl flex-col gap-5">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-xs font-medium text-primary">
              {SEASON}
            </span>
            <span className="text-xs text-muted-foreground">March 2026</span>
          </div>

          <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            Where talent meets the hammer.
          </h1>

          <p className="max-w-xl text-pretty text-lg text-muted-foreground">
            The Avanthi Cricket Championship auction portal. Register talent, build franchises, and
            watch every bid land in real time as teams battle for the season&apos;s best players.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Link href="/auction" className={buttonVariants({ size: "lg" })}>
              <Gavel data-icon="inline-start" />
              Watch the live auction
            </Link>
            <Link href="/players" className={buttonVariants({ size: "lg", variant: "outline" })}>
              Explore players
              <ArrowRight data-icon="inline-end" />
            </Link>
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
