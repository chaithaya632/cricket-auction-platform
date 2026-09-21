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
import { adminDeletePlayerAction } from "@/lib/players/actions"
import { toast } from "sonner"
import { Trash2, AlertTriangle, Loader2 } from "lucide-react"
import type { Player } from "@/lib/acc/types"

interface DeletePlayerDialogProps {
  player: Player | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DeletePlayerDialog({
  player,
  open,
  onOpenChange,
}: DeletePlayerDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  if (!player) return null

  async function handleDelete() {
    if (!player) return
    setError(null)
    setLoading(true)

    try {
      const res = await adminDeletePlayerAction(player.id)

      if (!res.success) {
        setError(res.error || "Failed to remove player.")
        setLoading(false)
        return
      }

      if (res.mode === "deactivated") {
        toast.info(res.data?.message || `Player ${player.fullName} deactivated (auction history preserved).`)
      } else {
        toast.success(`Player ${player.fullName} removed successfully.`)
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
            <DialogTitle>Confirm Player Removal</DialogTitle>
          </div>
          <DialogDescription className="pt-2 text-sm text-foreground/80 leading-relaxed">
            Are you sure you want to remove <strong>{player.fullName}</strong> (Roll:{" "}
            <code className="font-mono text-xs">{player.rollNumber}</code>)?
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          <strong>Referential Protection Notice:</strong> In accordance with ACC regulations, if this student has participated in auction lots or bids, their registration will be <em>deactivated/withdrawn</em> to safeguard immutable audit logs. If they have never entered an auction, their record will be permanently deleted.
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
            Remove Player
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
