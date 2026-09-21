import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Bat, Ball, Gloves } from "@/components/acc/icons"
import type { PlayerType } from "@/lib/acc/types"

const TYPE_META: Record<PlayerType, { skills: { label: string; icon: typeof Bat }[] }> = {
  Batter: { skills: [{ label: "Batter", icon: Bat }] },
  Bowler: { skills: [{ label: "Bowler", icon: Ball }] },
  "All-rounder": {
    skills: [
      { label: "Batter", icon: Bat },
      { label: "Bowler", icon: Ball },
    ],
  },
  "Wicket-keeper": { skills: [{ label: "Keeper", icon: Gloves }] },
  "Wicket-keeper batter": {
    skills: [
      { label: "Keeper", icon: Gloves },
      { label: "Batter", icon: Bat },
    ],
  },
}

export function SkillBadges({
  playerType,
  className,
}: {
  playerType: PlayerType
  className?: string
}) {
  const meta = TYPE_META[playerType]
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {meta.skills.map((s) => {
        const Icon = s.icon
        return (
          <Badge key={s.label} variant="secondary" className="gap-1 font-medium">
            <Icon className="size-3" aria-hidden />
            {s.label}
          </Badge>
        )
      })}
    </div>
  )
}
