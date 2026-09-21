import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CategoryBadge } from "@/components/acc/category-badge"
import { PlayerStatusBadge } from "@/components/acc/status-badges"
import { FranchiseCrest } from "@/components/acc/franchise-crest"
import { formatCredits } from "@/lib/acc/config"
import { Gavel, UserPlus, Settings2 } from "lucide-react"
import type { Player, Franchise, SaleRecord } from "@/lib/acc/types"

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("")
}

export function ActivityPanel({
  registrations,
  sales,
  franchiseOf,
}: {
  registrations: Player[]
  sales: { sale: SaleRecord; player: Player; franchise: Franchise }[]
  franchiseOf: (id: string) => Franchise | undefined
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle className="text-base">Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="auction">
          <TabsList className="w-full">
            <TabsTrigger value="auction" className="flex-1">
              Auction
            </TabsTrigger>
            <TabsTrigger value="registrations" className="flex-1">
              Registrations
            </TabsTrigger>
            <TabsTrigger value="admin" className="flex-1">
              Admin
            </TabsTrigger>
          </TabsList>

          <TabsContent value="auction" className="mt-4 flex flex-col gap-2">
            {sales.map(({ sale, player, franchise }) => (
              <div key={sale.saleId} className="flex items-center gap-3 rounded-lg border border-border/60 p-2.5">
                <span className="flex size-8 items-center justify-center rounded-md bg-success/10 text-success">
                  <Gavel className="size-4" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm">
                    <span className="font-medium">{player.fullName}</span> sold to {franchise.teamName}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">Lot #{sale.auctionToken}</span>
                </div>
                <span className="font-semibold tabular-nums text-success">{formatCredits(sale.finalPrice)}</span>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="registrations" className="mt-4 flex flex-col gap-2">
            {registrations.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border/60 p-2.5">
                <Avatar className="size-8 rounded-md border">
                  <AvatarImage src={p.photoUrl || "/placeholder.svg"} alt={p.fullName} />
                  <AvatarFallback className="rounded-md text-xs">{initials(p.fullName)}</AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{p.fullName}</span>
                  <span className="font-mono text-xs text-muted-foreground">{p.rollNumber}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CategoryBadge bucket={p.bucket} />
                  <PlayerStatusBadge status={p.status} />
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="admin" className="mt-4 flex flex-col gap-2">
            {[
              { icon: Settings2, text: "Bid ladder configuration updated", meta: "12:02 · admin" },
              { icon: UserPlus, text: "3 players moved to Approved", meta: "11:47 · admin" },
              { icon: Gavel, text: "Auction session started", meta: "11:30 · admin" },
              { icon: Settings2, text: "Franchise purses reset to ₹1,000", meta: "10:15 · admin" },
            ].map((a, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border border-border/60 p-2.5">
                <span className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <a.icon className="size-4" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm">{a.text}</span>
                  <span className="font-mono text-xs text-muted-foreground">{a.meta}</span>
                </div>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
