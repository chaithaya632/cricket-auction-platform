import type { Metadata } from "next"
import Link from "next/link"
import { AccLogo } from "@/components/acc/brand"
import { SignupForm } from "@/components/acc/auth/signup-form"
import { ShieldCheck, Radio, TrendingUp } from "lucide-react"

export const metadata: Metadata = {
  title: "Create account",
  description: "Create an account for the Avanthi Cricket Championship auction portal.",
}

export default function SignupPage() {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* Branding / visual panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, var(--sidebar-foreground) 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-primary/20 blur-3xl"
        />
        <Link href="/" className="relative z-10 w-fit">
          <AccLogo subtitle="Auction Portal" />
        </Link>

        <div className="relative z-10 flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <span className="w-fit rounded-full border border-sidebar-border bg-sidebar-accent/40 px-3 py-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Season · ACC 2026
            </span>
            <h1 className="text-balance text-4xl font-bold leading-tight tracking-tight">
              Join the official campus cricket auction platform.
            </h1>
            <p className="max-w-md text-pretty text-sm text-muted-foreground">
              Register to participate in the tournament, follow live auction bidding, or represent your franchise.
            </p>
          </div>

          <ul className="flex flex-col gap-3 text-sm">
            {[
              { icon: Radio, label: "Live auction ticker and real-time bid monitoring" },
              { icon: TrendingUp, label: "Player discovery, skill statistics, and auction pools" },
              { icon: ShieldCheck, label: "Role-verified access for organizers, franchises and players" },
            ].map((f) => (
              <li key={f.label} className="flex items-center gap-3">
                <span className="flex size-8 items-center justify-center rounded-md border border-sidebar-border bg-sidebar-accent/40 text-primary">
                  <f.icon className="size-4" />
                </span>
                <span className="text-muted-foreground">{f.label}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 text-xs text-muted-foreground">
          © 2026 Avanthi Institutions · Secure auction operations
        </p>
      </div>

      {/* Form panel */}
      <div className="flex flex-col items-center justify-center gap-8 p-6 sm:p-10">
        <div className="flex w-full max-w-sm flex-col gap-8">
          <div className="flex flex-col items-center gap-4 lg:hidden">
            <Link href="/">
              <AccLogo subtitle="Auction Portal" />
            </Link>
          </div>
          <SignupForm />
        </div>
      </div>
    </div>
  )
}
