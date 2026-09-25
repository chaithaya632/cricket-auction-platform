import Link from "next/link"
import Image from "next/image"
import { buttonVariants } from "@/components/ui/button"
import { AccBrandingPanel } from "@/components/acc/branding-panel"
import { ArrowRight, Gavel } from "lucide-react"

export function Hero({
  stats,
}: {
  stats: { players: number; franchises: number; sold: number; spend: string }
}) {
  return (
    <section className="relative flex min-h-[calc(100svh-4rem)] w-full flex-col items-center justify-center overflow-hidden border-b border-border/60 px-4 py-14 sm:px-6 sm:py-20">
      {/* FULL-VIEWPORT CRICKET STADIUM BACKGROUND */}
      <div
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: "url('/images/cricket-hero-bg.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
        <Image
          src="/images/cricket-hero-bg.png"
          alt="Avanthi Cricket Championship Stadium"
          fill
          priority
          unoptimized
          sizes="100vw"
          className="object-cover object-center"
        />
        {/* Controlled Dark Readability Overlay — keeps stadium, floodlights & field clearly visible */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/65 via-black/45 to-black/80" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-col items-center gap-10">
        {/* Centered Unified Branding Hierarchy */}
        <AccBrandingPanel
          hideFooter
          description="The official auction operations portal for the Avanthi Cricket Championship. Register talent, track franchise squads, and follow every bid in real time as teams build their championship rosters."
          actions={
            <>
              <Link href="/auction" className={buttonVariants({ size: "lg", className: "shadow-lg" })}>
                <Gavel data-icon="inline-start" />
                Watch the live auction
              </Link>
              <Link
                href="/players"
                className={buttonVariants({
                  size: "lg",
                  variant: "outline",
                  className: "border-white/25 bg-black/50 text-white backdrop-blur-sm hover:bg-black/70 hover:text-white",
                })}
              >
                Explore players
                <ArrowRight data-icon="inline-end" />
              </Link>
            </>
          }
        />

        {/* Centered Tournament Statistics Glass Bar */}
        <dl className="grid w-full max-w-2xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/15 bg-white/10 shadow-2xl backdrop-blur-md sm:grid-cols-4">
          {[
            { label: "Players", value: stats.players },
            { label: "Franchises", value: stats.franchises },
            { label: "Sold", value: stats.sold },
            { label: "Total spend", value: stats.spend },
          ].map((s) => (
            <div key={s.label} className="flex flex-col items-center gap-1 bg-zinc-950/80 p-4 text-center">
              <dt className="text-xs font-medium text-zinc-400">{s.label}</dt>
              <dd className="text-2xl font-bold tabular-nums text-white">{s.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
