"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { adminDeleteFranchiseAction } from "@/lib/franchises/actions"
import { toast } from "sonner"
import { Trash2, AlertTriangle, Loader2 } from "lucide-react"
import type { Franchise } from "@/lib/acc/types"

interface DeleteFranchiseDialogProps {
  franchise: Franchise | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DeleteFranchiseDialog({
  franchise,
  open,
  onOpenChange,
}: DeleteFranchiseDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  if (!franchise) return null

  async function handleDelete() {
    if (!franchise) return
    setError(null)
    setLoading(true)

    try {
      const res = await adminDeleteFranchiseAction(franchise.id)

      if (!res.success) {
        setError(res.error || "Failed to remove franchise.")
        setLoading(false)
        return
      }

      if (res.mode === "deactivated") {
        toast.info(
          res.data?.message ||
            `Franchise ${franchise.teamName} deactivated (auction audit history preserved).`
        )
      } else {
        toast.success(`Franchise ${franchise.teamName} removed successfully.`)
      }

      onOpenChange(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-5" />
            <DialogTitle>Confirm Franchise Removal</DialogTitle>
          </div>
          <DialogDescription className="pt-2 text-sm text-foreground/80 leading-relaxed">
            Are you sure you want to remove <strong>{franchise.teamName}</strong> (Code:{" "}
            <code className="font-mono text-xs">{franchise.shortCode}</code>)?
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          <strong>Referential Protection Notice:</strong> In accordance with ACC tournament integrity rules, if this team has placed bids, acquired players, or participated in the auction, it will be <em>deactivated</em> to safeguard immutable auction audit trails. If the franchise has no historical auction activity, it will be permanently removed.
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 size-4" />
            )}
            Remove Franchise
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
