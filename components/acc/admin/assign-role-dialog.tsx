"use client"

// =============================================================================
// ACC Auction Portal — Components: Assign Role Dialog
// =============================================================================

import { useState, useEffect } from "react"
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
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { adminAssignRoleAction, adminRevokeRoleAction } from "@/lib/users/actions"
import { toast } from "sonner"
import { UserCheck, ShieldX, Loader2, AlertCircle } from "lucide-react"
import type { AdminUserListItem } from "@/lib/users/types"
import type { Franchise } from "@/lib/acc/types"

interface AssignRoleDialogProps {
  user: AdminUserListItem | null
  franchises: Franchise[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AssignRoleDialog({
  user,
  franchises,
  open,
  onOpenChange,
}: AssignRoleDialogProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const initialRole = user?.role || (user?.intended_role === "franchise" ? "franchise" : "player")
  const [selectedRole, setSelectedRole] = useState<string>(initialRole)
  const [selectedFranchiseId, setSelectedFranchiseId] = useState<string>(
    user?.franchise_id || (franchises[0]?.id ?? "")
  )

  useEffect(() => {
    if (user) {
      const r = user.role || (user.intended_role === "franchise" ? "franchise" : "player")
      setSelectedRole(r)
      setSelectedFranchiseId(user.franchise_id || (franchises[0]?.id ?? ""))
      setError(null)
    }
  }, [user, franchises])

  if (!user) return null

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setError(null)
    setLoading(true)

    try {
      const res = await adminAssignRoleAction({
        userId: user.id,
        role: selectedRole as any,
        franchiseId: selectedRole === "franchise" ? selectedFranchiseId : null,
      })

      if (!res.success) {
        setError(res.error || "Failed to assign role.")
        setLoading(false)
        return
      }

      toast.success(res.message || "Role assigned successfully.")
      onOpenChange(false)
      router.refresh()
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred.")
    } finally {
      setLoading(false)
    }
  }

  async function handleRevoke() {
    if (!user) return
    setError(null)
    setLoading(true)

    try {
      const res = await adminRevokeRoleAction(user.id)
      if (!res.success) {
        setError(res.error || "Failed to revoke role.")
        setLoading(false)
        return
      }

      toast.info(res.message || "Role revoked.")
      onOpenChange(false)
      router.refresh()
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleAssign}>
          <DialogHeader>
            <div className="flex items-center gap-2 text-primary">
              <UserCheck className="size-5" />
              <DialogTitle>Assign Tournament Role</DialogTitle>
            </div>
            <DialogDescription className="text-xs">
              Configure authorized season role access for{" "}
              <strong>{user.full_name}</strong> (<code>{user.email}</code>).
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="my-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid gap-4 py-4">
            <div className="space-y-1.5">
              <Label>Select Role *</Label>
              <Select
                value={selectedRole}
                onValueChange={(val) => val && setSelectedRole(val)}
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="player">Player (Tournament Student)</SelectItem>
                  <SelectItem value="franchise">Franchise Representative (Bidder)</SelectItem>
                  <SelectItem value="operator">Auction Operator</SelectItem>
                  <SelectItem value="super_admin">Super Administrator</SelectItem>
                  <SelectItem value="viewer">General Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedRole === "franchise" && (
              <div className="space-y-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5">
                <Label htmlFor="franchise_select" className="text-amber-300 font-semibold">
                  Assign Bidding Franchise *
                </Label>
                <Select
                  value={selectedFranchiseId}
                  onValueChange={(val) => val && setSelectedFranchiseId(val)}
                  disabled={loading}
                >
                  <SelectTrigger id="franchise_select">
                    <SelectValue placeholder="Choose a franchise" />
                  </SelectTrigger>
                  <SelectContent>
                    {franchises.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.teamName} ({f.shortCode})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-amber-200/80 mt-1">
                  This user will be authorized to bid strictly on behalf of this team.
                </p>
              </div>
            )}

            {selectedRole === "player" && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
                Assigning <strong>Player</strong> permits this student to submit their academic registration and skill profile in the Player Portal.
              </div>
            )}
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between gap-2">
            {user.role ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 text-xs"
                onClick={handleRevoke}
                disabled={loading}
              >
                <ShieldX className="size-3.5 mr-1" />
                Revoke Role
              </Button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
                Save Role
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
