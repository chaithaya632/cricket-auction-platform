import type { Metadata } from "next"
import { DashboardShell } from "@/components/acc/dashboard-shell"
import { PageHeader } from "@/components/acc/page-header"
import { PlayersTable } from "@/components/acc/admin/players-table"
import { AddPlayerDialog } from "@/components/acc/admin/add-player-dialog"
import { Button } from "@/components/ui/button"
import { getSessionUser } from "@/lib/acc/server-session"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAdmin } from "@/lib/permissions/guards"
import { getAdminPlayersList } from "@/lib/players/queries"
import { Download } from "lucide-react"

export const metadata: Metadata = { title: "Players · Admin" }

export default async function AdminPlayersPage() {
  const adminContext = await requireAdmin()
  const seasonId = adminContext.activeSeason?.id || "00000000-0000-0000-0000-000000000001"
  const adminClient = createAdminClient()

  const [sessionUser, players] = await Promise.all([
    getSessionUser("admin"),
    getAdminPlayersList(adminClient, seasonId),
  ])

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
          <AddPlayerDialog />
        </>
      }
    >
      <PageHeader
        eyebrow="Registry"
        title="Player registry"
        description="Review, filter and manage every registered participant across all categories."
      />
      <PlayersTable players={players} />
    </DashboardShell>
  )
}
