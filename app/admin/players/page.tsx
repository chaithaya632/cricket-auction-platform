import type { Metadata } from "next"
import { DashboardShell } from "@/components/acc/dashboard-shell"
import { PageHeader } from "@/components/acc/page-header"
import { PlayersTable } from "@/components/acc/admin/players-table"
import { Button } from "@/components/ui/button"
import { getSessionUser } from "@/lib/acc/server-session"
import { PLAYERS } from "@/lib/acc/mock-data"
import { UserPlus, Download } from "lucide-react"

export const metadata: Metadata = { title: "Players · Admin" }

export default async function AdminPlayersPage() {
  const sessionUser = await getSessionUser("admin")
  return (
    <DashboardShell
      role="admin"
      user={sessionUser}
      breadcrumb="Players"
      actions={
        <>
          <Button variant="outline" size="sm">
            <Download className="size-4" />
            Export
          </Button>
          <Button size="sm">
            <UserPlus className="size-4" />
            Add player
          </Button>
        </>
      }
    >
      <PageHeader
        eyebrow="Registry"
        title="Player registry"
        description="Review, filter and manage every registered participant across all categories."
      />
      <PlayersTable players={PLAYERS} />
    </DashboardShell>
  )
}
