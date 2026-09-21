import type { Metadata } from "next"
import { DashboardShell } from "@/components/acc/dashboard-shell"
import { PageHeader } from "@/components/acc/page-header"
import { UsersTable } from "@/components/acc/admin/users-table"
import { getSessionUser } from "@/lib/acc/server-session"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAdmin } from "@/lib/permissions/guards"
import { getAdminUsersList } from "@/lib/users/queries"
import { getAdminFranchisesList } from "@/lib/franchises/queries"

export const metadata: Metadata = { title: "Users & Roles · Admin" }

export default async function AdminUsersPage() {
  const adminContext = await requireAdmin()
  const seasonId = adminContext.activeSeason?.id || ""
  const adminClient = createAdminClient()

  const [sessionUser, users, franchises] = await Promise.all([
    getSessionUser("admin"),
    getAdminUsersList(adminClient, seasonId),
    getAdminFranchisesList(adminClient, seasonId),
  ])

  return (
    <DashboardShell
      role="admin"
      user={sessionUser}
      breadcrumb="Users & Roles"
    >
      <PageHeader
        eyebrow="Access Control"
        title="User & Role Management"
        description="Review registered accounts, grant player credentials, assign franchise bidding seats, and manage admin access."
      />
      <UsersTable initialUsers={users} franchises={franchises} />
    </DashboardShell>
  )
}
