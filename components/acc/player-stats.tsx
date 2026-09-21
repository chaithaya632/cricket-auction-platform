import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { PlayerStats } from "@/lib/acc/types"

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-muted/20 p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xl font-bold tabular-nums">{value}</span>
    </div>
  )
}

export function PlayerStatsBlock({ stats }: { stats: PlayerStats }) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Batting</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Matches" value={stats.matches} />
          <Stat label="Runs" value={stats.runs} />
          <Stat label="Average" value={stats.battingAvg} />
          <Stat label="Strike rate" value={stats.strikeRate} />
          <Stat label="Highest" value={stats.highestScore} />
          <Stat label="Catches" value={stats.catches} />
          <Stat label="Stumpings" value={stats.stumpings} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bowling</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Wickets" value={stats.wickets} />
          <Stat label="Average" value={stats.bowlingAvg} />
          <Stat label="Economy" value={stats.economy} />
        </CardContent>
      </Card>
    </div>
  )
}
