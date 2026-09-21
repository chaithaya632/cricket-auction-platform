"use client"

import { useMemo, useState } from "react"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty"
import { PlayerCard } from "@/components/acc/player-card"
import { BUCKET_ORDER } from "@/lib/acc/config"
import { Search } from "lucide-react"
import type { Player, PlayerStatus } from "@/lib/acc/types"

const TYPES = ["Batter", "Bowler", "All-rounder", "Wicket-keeper", "Wicket-keeper batter"] as const
const STATUSES: { value: PlayerStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "APPROVED", label: "Approved" },
  { value: "IN_AUCTION", label: "In auction" },
  { value: "SOLD", label: "Sold" },
  { value: "UNSOLD", label: "Unsold" },
  { value: "UNDER_REVIEW", label: "Under review" },
  { value: "REGISTERED", label: "Registered" },
]

export function PlayerDirectory({ players }: { players: Player[] }) {
  const [query, setQuery] = useState("")
  const [bucket, setBucket] = useState<string>("all")
  const [type, setType] = useState<string>("all")
  const [status, setStatus] = useState<string>("all")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return players.filter((p) => {
      if (bucket !== "all" && p.bucket !== bucket) return false
      if (type !== "all" && p.playerType !== type) return false
      if (status !== "all" && p.status !== status) return false
      if (q && !p.fullName.toLowerCase().includes(q) && !p.rollNumber.toLowerCase().includes(q))
        return false
      return true
    })
  }, [players, query, bucket, type, status])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <InputGroup className="sm:max-w-xs">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Search name or roll number"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </InputGroup>

          <Select value={type} onValueChange={(val) => setType(val ?? "all")}>
            <SelectTrigger className="sm:w-48">
              <SelectValue placeholder="Player type" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">All types</SelectItem>
                {TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          <Select value={status} onValueChange={(val) => setStatus(val ?? "all")}>
            <SelectTrigger className="sm:w-44">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <ToggleGroup
          value={[bucket]}
          onValueChange={(v) => setBucket(v[0] || "all")}
          variant="outline"
          className="flex-wrap justify-start"
        >
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          {BUCKET_ORDER.map((b) => (
            <ToggleGroupItem key={b} value={b} className="font-mono">
              {b}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {filtered.length} {filtered.length === 1 ? "player" : "players"}
        </span>
      </div>

      {filtered.length === 0 ? (
        <Empty className="rounded-xl border border-dashed">
          <EmptyHeader>
            <EmptyTitle>No players match</EmptyTitle>
            <EmptyDescription>Try adjusting your search or filters.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <PlayerCard key={p.id} player={p} href={`/players/${p.id}`} />
          ))}
        </div>
      )}
    </div>
  )
}
