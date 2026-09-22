import type { Metadata } from "next"
import { DashboardShell } from "@/components/acc/dashboard-shell"
import { PageHeader } from "@/components/acc/page-header"
import { AdminFranchisesGrid } from "@/components/acc/admin/franchises-grid"
import { NewFranchiseDialog } from "@/components/acc/admin/new-franchise-dialog"
import { getSessionUser } from "@/lib/acc/server-session"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAdmin } from "@/lib/permissions/guards"
import { getAdminFranchisesList } from "@/lib/franchises/queries"

export const metadata: Metadata = { title: "Franchises · Admin" }

export default async function AdminFranchisesPage() {
  const adminContext = await requireAdmin()
  const seasonId = adminContext.activeSeason?.id || "00000000-0000-0000-0000-000000000001"
  const adminClient = createAdminClient()

  const [sessionUser, franchises] = await Promise.all([
    getSessionUser("admin"),
    getAdminFranchisesList(adminClient, seasonId),
  ])

  return (
    <DashboardShell
      role="admin"
      user={sessionUser}
      breadcrumb="Franchises"
      actions={<NewFranchiseDialog />}
    >
      <PageHeader
        eyebrow="Registry"
        title="Franchises"
        description="All participating teams with live squad counts, purse utilisation, and franchise management."
      />
      <AdminFranchisesGrid initialFranchises={franchises} />
    </DashboardShell>
  )
}
