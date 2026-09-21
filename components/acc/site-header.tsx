"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { AccLogo } from "@/components/acc/brand"
import { LiveIndicator } from "@/components/acc/status-badges"
import { cn } from "@/lib/utils"
import { Menu } from "lucide-react"

const LINKS = [
  { title: "Home", href: "/" },
  { title: "Live Auction", href: "/auction", live: true },
  { title: "Teams", href: "/teams" },
  { title: "Players", href: "/players" },
]

export function SiteHeader() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-6 px-4 md:px-6">
        <Link href="/" className="shrink-0">
          <AccLogo />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => {
            const active = pathname === link.href
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}
              >
                {link.title}
                {link.live && (
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex size-full animate-live-pulse rounded-full bg-live" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-live" />
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Button render={<Link href="/login" />} variant="ghost" size="sm" className="hidden md:inline-flex">
            Sign in
          </Button>
          <Button render={<Link href="/auction" />} size="sm" className="hidden md:inline-flex">
            Watch live
          </Button>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger render={<Button variant="outline" size="icon" className="md:hidden" />}>
              <Menu />
              <span className="sr-only">Open menu</span>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle>
                  <AccLogo />
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 px-4">
                {LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium",
                      pathname === link.href
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:bg-secondary/60",
                    )}
                  >
                    {link.title}
                    {link.live && <LiveIndicator />}
                  </Link>
                ))}
                <div className="mt-4 flex flex-col gap-2">
                  <Button render={<Link href="/login" />} variant="outline" onClick={() => setOpen(false)}>
                    Sign in
                  </Button>
                  <Button render={<Link href="/auction" />} onClick={() => setOpen(false)}>
                    Watch live
                  </Button>
                </div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-10 md:flex-row md:items-center md:justify-between md:px-6">
        <div className="flex flex-col gap-3">
          <AccLogo />
          <p className="max-w-sm text-sm text-muted-foreground">
            The Avanthi Cricket Championship auction portal — where campus talent meets the bidding
            floor.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-muted-foreground">
          <Link href="/auction" className="hover:text-foreground">
            Live Auction
          </Link>
          <Link href="/teams" className="hover:text-foreground">
            Teams
          </Link>
          <Link href="/players" className="hover:text-foreground">
            Players
          </Link>
          <Link href="/login" className="hover:text-foreground">
            Sign in
          </Link>
        </div>
      </div>
      <div className="border-t border-border/60 py-4">
        <p className="mx-auto max-w-7xl px-4 text-xs text-muted-foreground md:px-6">
          © 2026 Avanthi Institutions. For demonstration purposes.
        </p>
      </div>
    </footer>
  )
}
