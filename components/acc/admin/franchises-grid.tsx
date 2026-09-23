"use client"

import { useState } from "react"
import { FranchiseSummaryCard } from "@/components/acc/franchise-summary-card"
import { DeleteFranchiseDialog } from "@/components/acc/admin/delete-franchise-dialog"
import type { Franchise } from "@/lib/acc/types"
import { ShieldAlert } from "lucide-react"

export function AdminFranchisesGrid({
  initialFranchises,
}: {
  initialFranchises: (Franchise & { squadCount?: number; spent?: number })[]
}) {
  const [selectedFranchise, setSelectedFranchise] = useState<Franchise | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  function handleDeleteClick(franchise: Franchise) {
    setSelectedFranchise(franchise)
    setDeleteOpen(true)
  }

  if (initialFranchises.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
        <ShieldAlert className="size-10 text-muted-foreground/60" />
        <h3 className="mt-3 text-base font-semibold">No franchises found</h3>
        <p className="mt-1 text-sm text-muted-foreground max-w-sm">
          No teams have been registered for this season. Use the "New franchise" button above to add a team.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {initialFranchises.map((f) => {
          const squadSize = f.squadCount ?? 0
          const spent = f.spent ?? 0

          return (
            <FranchiseSummaryCard
              key={f.id}
              franchise={f}
              squadSize={squadSize}
              spent={spent}
              onDelete={handleDeleteClick}
            />
          )
        })}
      </div>

      <DeleteFranchiseDialog
        franchise={selectedFranchise}
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open)
          if (!open) setSelectedFranchise(null)
        }}
      />
    </>
  )
}
