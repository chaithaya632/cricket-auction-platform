import type { Metadata } from "next"
import { DashboardShell } from "@/components/acc/dashboard-shell"
import { PageHeader } from "@/components/acc/page-header"
import { FranchiseSummaryCard } from "@/components/acc/franchise-summary-card"
import { Button } from "@/components/ui/button"
import { getSessionUser } from "@/lib/acc/server-session"
import { FRANCHISES, franchiseSquad, franchiseSpend } from "@/lib/acc/mock-data"
import { Plus } from "lucide-react"

export const metadata: Metadata = { title: "Franchises · Admin" }

export default async function AdminFranchisesPage() {
  const sessionUser = await getSessionUser("admin")
  return (
    <DashboardShell
      role="admin"
      user={sessionUser}
      breadcrumb="Franchises"
      actions={
        <Button size="sm">
          <Plus className="size-4" />
          New franchise
        </Button>
      }
    >
      <PageHeader
        eyebrow="Registry"
        title="Franchises"
        description="All participating teams with live squad counts and purse utilisation."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FRANCHISES.map((f) => (
          <FranchiseSummaryCard
            key={f.id}
            franchise={f}
            squadSize={franchiseSquad(f.id).length}
            spent={franchiseSpend(f.id)}
          />
        ))}
      </div>
    </DashboardShell>
  )
}
