"use client"

import { useMemo, useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CategoryBadge } from "@/components/acc/category-badge"
import { PlayerStatusBadge } from "@/components/acc/status-badges"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { formatCredits, BUCKET_ORDER, STATUS_CONFIG } from "@/lib/acc/config"
import { getFranchise } from "@/lib/acc/mock-data"
import type { Player, PlayerStatus } from "@/lib/acc/types"
import { Search, Users } from "lucide-react"

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("")
}

const STATUSES = Object.keys(STATUS_CONFIG) as PlayerStatus[]

export function PlayersTable({ players }: { players: Player[] }) {
  const [query, setQuery] = useState("")
  const [bucket, setBucket] = useState<string>("all")
  const [status, setStatus] = useState<string>("all")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return players.filter((p) => {
      if (bucket !== "all" && p.bucket !== bucket) return false
      if (status !== "all" && p.status !== status) return false
      if (q && !p.fullName.toLowerCase().includes(q) && !p.rollNumber.toLowerCase().includes(q)) return false
      return true
    })
  }, [players, query, bucket, status])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or roll number…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={bucket} onValueChange={(val) => setBucket(val ?? "all")}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {BUCKET_ORDER.map((b) => (
              <SelectItem key={b} value={b}>
                {b}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(val) => setStatus(val ?? "all")}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_CONFIG[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Player</TableHead>
              <TableHead className="hidden md:table-cell">Program</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="hidden sm:table-cell">Type</TableHead>
              <TableHead className="text-right">Base</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell">Franchise</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((p) => {
              const franchise = getFranchise(p.soldTo)
              return (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="size-9 rounded-md border">
                        <AvatarImage src={p.photoUrl || "/placeholder.svg"} alt={p.fullName} />
                        <AvatarFallback className="rounded-md text-xs">{initials(p.fullName)}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="font-medium leading-tight">{p.fullName}</span>
                        <span className="font-mono text-xs text-muted-foreground">{p.rollNumber}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="text-sm">{p.program}</span>
                    <span className="block text-xs text-muted-foreground">{p.branch}</span>
                  </TableCell>
                  <TableCell>
                    <CategoryBadge bucket={p.bucket} />
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <span className="text-sm text-muted-foreground">{p.playerType}</span>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCredits(p.status === "SOLD" ? p.soldPrice ?? p.basePrice : p.basePrice)}
                  </TableCell>
                  <TableCell>
                    <PlayerStatusBadge status={p.status} />
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {franchise ? (
                      <Badge variant="outline" style={{ borderColor: `${franchise.colorHex}66` }}>
                        {franchise.shortCode}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>

        {filtered.length === 0 && (
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Users />
              </EmptyMedia>
              <EmptyTitle>No players found</EmptyTitle>
              <EmptyDescription>Adjust your filters or search to see more players.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {players.length} players
      </p>
    </div>
  )
}
