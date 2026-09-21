import Link from "next/link"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { FranchiseCrest } from "@/components/acc/franchise-crest"
import { PurseBar } from "@/components/acc/purse-bar"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Trash2 } from "lucide-react"
import type { Franchise } from "@/lib/acc/types"

export function FranchiseSummaryCard({
  franchise,
  squadSize,
  spent,
  href,
  className,
  onDelete,
}: {
  franchise: Franchise
  squadSize: number
  spent: number
  href?: string
  className?: string
  onDelete?: (franchise: Franchise) => void
}) {
  const body = (
    <Card className={cn("h-full gap-0 overflow-hidden py-0 transition-colors hover:border-primary/40", className)}>
      <div className="h-1.5 w-full" style={{ backgroundColor: franchise.colorHex }} />
      <CardHeader className="flex-row items-center justify-between gap-3 pt-4">
        <div className="flex min-w-0 items-center gap-3">
          <FranchiseCrest franchise={franchise} size="lg" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-semibold leading-tight">{franchise.teamName}</span>
            <span className="truncate text-xs text-muted-foreground">
              {franchise.coordinatorName} · {franchise.coordinatorDept}
            </span>
          </div>
        </div>
        {onDelete && (
          <Button
            size="icon-sm"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive shrink-0"
            title={`Delete ${franchise.teamName}`}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onDelete(franchise)
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="pb-4 pt-3">
        <div className="mb-3 grid grid-cols-3 gap-2 text-center">
          <div className="flex flex-col rounded-md bg-muted/40 py-2">
            <span className="text-lg font-bold tabular-nums leading-none">{squadSize}</span>
            <span className="text-[11px] text-muted-foreground">Squad</span>
          </div>
          <div className="flex flex-col rounded-md bg-muted/40 py-2">
            <span className="text-lg font-bold tabular-nums leading-none text-primary">{spent}</span>
            <span className="text-[11px] text-muted-foreground">Spent</span>
          </div>
          <div className="flex flex-col rounded-md bg-muted/40 py-2">
            <span className="text-lg font-bold tabular-nums leading-none text-success">
              {franchise.startingPurse - spent}
            </span>
            <span className="text-[11px] text-muted-foreground">Left</span>
          </div>
        </div>
        <PurseBar spent={spent} total={franchise.startingPurse} showLabels={false} />
      </CardContent>
      <Separator />
      <CardFooter className="flex items-center justify-between gap-2 py-3 text-xs text-muted-foreground">
        <span>
          Captain · <span className="text-foreground">{franchise.captainName}</span>
        </span>
        <span className="font-mono">{franchise.shortCode}</span>
      </CardFooter>
    </Card>
  )

  if (href) {
    return (
      <Link
        href={href}
        className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {body}
      </Link>
    )
  }
  return body
}
