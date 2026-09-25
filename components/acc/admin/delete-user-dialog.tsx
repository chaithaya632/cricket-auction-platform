"use client"

// =============================================================================
// ACC Auction Portal — Components: Delete User Account Dialog
// =============================================================================

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
import { adminDeleteUserAction } from "@/lib/users/actions"
import { toast } from "sonner"
import { Trash2, AlertTriangle, Loader2 } from "lucide-react"
import type { AdminUserListItem } from "@/lib/users/types"

interface DeleteUserDialogProps {
  user: AdminUserListItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DeleteUserDialog({
  user,
  open,
  onOpenChange,
}: DeleteUserDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  if (!user) return null

  const isPlayer = user.role === "player" || user.intended_role === "player"
  const isFranchise = user.role === "franchise" || user.intended_role === "franchise"

  async function handleDelete() {
    if (!user) return
    setError(null)
    setLoading(true)

    try {
      const res = await adminDeleteUserAction(user.id)

      if (!res.success) {
        setError(res.error || "Failed to delete user account.")
        setLoading(false)
        return
      }

      toast.success(res.message || `User ${user.full_name} deleted successfully.`)
      onOpenChange(false)
      router.refresh()
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred during user deletion.")
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
            <DialogTitle>Confirm Permanent User Deletion</DialogTitle>
          </div>
          <DialogDescription className="pt-2 text-sm text-foreground/80 leading-relaxed">
            Are you sure you want to permanently delete user account <strong>{user.full_name}</strong> (
            <code className="font-mono text-xs">{user.email}</code>)?
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive space-y-1.5">
          <p className="font-semibold">⚠️ Irreversible Permanent Deletion:</p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>Supabase Auth credentials and session will be purged.</li>
            <li>Public user profile and tournament season roles will be deleted.</li>
            {isPlayer && (
              <li>Player profile, registration, skill statistics, and storage photo will be permanently deleted, and their roll number released for reuse.</li>
            )}
            {isFranchise && (
              <li>Franchise seat assignment will be unlinked. (The franchise team itself remains intact).</li>
            )}
          </ul>
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
            Permanently Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
