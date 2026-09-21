import type { ReactNode } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function StatCard({
  label,
  value,
  sub,
  icon,
  accent,
  className,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  icon?: ReactNode
  accent?: "primary" | "accent" | "success" | "destructive"
  className?: string
}) {
  const accentClass = {
    primary: "text-primary",
    accent: "text-accent",
    success: "text-success",
    destructive: "text-destructive",
  }

  return (
    <Card className={cn("gap-0 py-0", className)}>
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <span className={cn("text-2xl font-bold tabular-nums leading-none", accent && accentClass[accent])}>
            {value}
          </span>
          {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
        </div>
        {icon && (
          <div className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-4">
            {icon}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
