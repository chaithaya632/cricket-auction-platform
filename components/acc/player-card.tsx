import Link from "next/link"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { CategoryBadge } from "@/components/acc/category-badge"
import { PlayerStatusBadge } from "@/components/acc/status-badges"
import { SkillBadges } from "@/components/acc/skill-badges"
import { FranchiseCrest } from "@/components/acc/franchise-crest"
import { formatCredits } from "@/lib/acc/config"
import { cn } from "@/lib/utils"
import type { Player, Franchise } from "@/lib/acc/types"

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
}

export function PlayerCard({
  player,
  href,
  showStatus = true,
  className,
  franchise,
}: {
  player: Player
  href?: string
  showStatus?: boolean
  className?: string
  franchise?: Franchise
}) {
  const topStat =
    player.playerType === "Bowler"
      ? { label: "Wickets", value: player.stats?.wickets ?? 0 }
      : { label: "Runs", value: player.stats?.runs ?? 0 }

  const body = (
    <Card
      className={cn(
        "group h-full gap-0 overflow-hidden py-0 transition-colors hover:border-primary/40",
        className,
      )}
    >
      <CardContent className="flex items-start gap-3 p-4">
        <Avatar className="size-14 rounded-lg border">
          <AvatarImage src={player.photoUrl || "/placeholder.svg"} alt={player.fullName} />
          <AvatarFallback className="rounded-lg">{initials(player.fullName)}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-semibold leading-tight">{player.fullName}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">{player.rollNumber}</p>
            </div>
            <CategoryBadge bucket={player.bucket} />
          </div>
          <SkillBadges playerType={player.playerType} className="mt-1" />
        </div>
      </CardContent>
      <Separator />
      <CardFooter className="flex items-center justify-between gap-2 p-4">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">
            {player.status === "SOLD" ? "Sold for" : "Base price"}
          </span>
          <span className="font-semibold tabular-nums text-primary">
            {formatCredits(player.status === "SOLD" ? player.soldPrice ?? player.basePrice : player.basePrice)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end">
            <span className="text-xs text-muted-foreground">{topStat.label}</span>
            <span className="font-semibold tabular-nums">{topStat.value}</span>
          </div>
          {franchise ? (
            <FranchiseCrest franchise={franchise} size="md" />
          ) : (
            showStatus && <PlayerStatusBadge status={player.status} />
          )}
        </div>
      </CardFooter>
    </Card>
  )

  if (href) {
    return (
      <Link href={href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
        {body}
      </Link>
    )
  }
  return body
}
