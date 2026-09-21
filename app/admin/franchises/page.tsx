import type { Metadata } from "next"
import { DashboardShell } from "@/components/acc/dashboard-shell"
import { PageHeader } from "@/components/acc/page-header"
import { AdminFranchisesGrid } from "@/components/acc/admin/franchises-grid"
import { NewFranchiseDialog } from "@/components/acc/admin/new-franchise-dialog"
import { getSessionUser } from "@/lib/acc/server-session"
import { createClient } from "@/lib/supabase/server"
import { getAdminFranchisesList } from "@/lib/franchises/queries"

export const metadata: Metadata = { title: "Franchises · Admin" }

export default async function AdminFranchisesPage() {
  const sessionUser = await getSessionUser("admin")
  const supabase = await createClient()
  const franchises = await getAdminFranchisesList(supabase)

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
