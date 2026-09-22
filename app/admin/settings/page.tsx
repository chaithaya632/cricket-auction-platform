import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { DashboardShell } from "@/components/acc/dashboard-shell"
import { PageHeader } from "@/components/acc/page-header"
import { SettingsForm } from "@/components/acc/admin/settings-form"
import { getSessionUser } from "@/lib/acc/server-session"
import { requireAdmin } from "@/lib/permissions/guards"

export const metadata: Metadata = { title: "Settings · Admin" }

export default async function AdminSettingsPage() {
  const context = await requireAdmin()
  if (!context.isSuperAdmin) {
    redirect("/admin?error=unauthorized_settings")
  }
  const sessionUser = await getSessionUser("admin")
  return (
    <DashboardShell role="admin" user={sessionUser} breadcrumb="Settings">
      <PageHeader
        eyebrow="System"
        title="Tournament settings"
        description="Configure purse rules, the bid ladder and auction floor controls."
      />
      <div className="max-w-3xl">
        <SettingsForm />
      </div>
    </DashboardShell>
  )
}
