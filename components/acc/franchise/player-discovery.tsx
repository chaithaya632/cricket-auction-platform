"use client"

import { useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { PlayerCard } from "@/components/acc/player-card"
import { cn } from "@/lib/utils"
import { BUCKET_ORDER, CATEGORY_CONFIG } from "@/lib/acc/config"
import type { Player, Bucket, PlayerType } from "@/lib/acc/types"
import { Search } from "lucide-react"

const TYPES: (PlayerType | "All")[] = [
  "All",
  "Batter",
  "Bowler",
  "All-rounder",
  "Wicket-keeper",
  "Wicket-keeper batter",
]

export function PlayerDiscovery({ players }: { players: Player[] }) {
  const [query, setQuery] = useState("")
  const [bucket, setBucket] = useState<Bucket | "All">("All")
  const [type, setType] = useState<PlayerType | "All">("All")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return players.filter((p) => {
      if (bucket !== "All" && p.bucket !== bucket) return false
      if (type !== "All" && p.playerType !== type) return false
      if (q && !p.fullName.toLowerCase().includes(q) && !p.rollNumber.toLowerCase().includes(q)) return false
      return true
    })
  }, [players, query, bucket, type])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or roll number…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={bucket === "All"} onClick={() => setBucket("All")}>
            All categories
          </FilterChip>
          {BUCKET_ORDER.map((b) => (
            <FilterChip
              key={b}
              active={bucket === b}
              onClick={() => setBucket(b)}
              className={bucket === b ? undefined : CATEGORY_CONFIG[b].textClass}
            >
              {b}
            </FilterChip>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {TYPES.map((t) => (
            <FilterChip key={t} active={type === t} onClick={() => setType(t)}>
              {t}
            </FilterChip>
          ))}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {filtered.length} player{filtered.length === 1 ? "" : "s"} available
      </p>

      {filtered.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <PlayerCard key={p.id} player={p} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No players match these filters.
        </div>
      )}
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  className,
  children,
}: {
  active: boolean
  onClick: () => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "default" : "outline"}
      onClick={onClick}
      className={cn("h-8 rounded-full", className)}
    >
      {children}
    </Button>
  )
}
