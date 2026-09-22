"use client"

// =============================================================================
// ACC Auction Portal — Components: Add Existing Player to Lot Queue Dialog
// =============================================================================

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { CategoryBadge } from "@/components/acc/category-badge"
import { adminAddPlayerToQueueAction } from "@/lib/auction/actions"
import { toast } from "sonner"
import { Search, UserPlus, Loader2, CheckCircle2, AlertCircle } from "lucide-react"
import type { EligiblePlayerQueueCandidate } from "@/lib/auction/queries"
import type { Bucket } from "@/lib/constants"

interface AddToQueueDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  candidates: EligiblePlayerQueueCandidate[]
}

export function AddToQueueDialog({
  open,
  onOpenChange,
  candidates,
}: AddToQueueDialogProps) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [bucketFilter, setBucketFilter] = useState<string>("all")
  const [addingId, setAddingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const filtered = candidates.filter((c) => {
    const matchesSearch =
      c.fullName.toLowerCase().includes(search.toLowerCase()) ||
      c.rollNumber.toLowerCase().includes(search.toLowerCase())
    const matchesBucket = bucketFilter === "all" || c.bucket === bucketFilter
    return matchesSearch && matchesBucket
  })

  async function handleAddToQueue(candidate: EligiblePlayerQueueCandidate) {
    setError(null)
    setAddingId(candidate.registrationId)

    try {
      const res = await adminAddPlayerToQueueAction(candidate.registrationId)
      if (!res.success) {
        setError(res.error || "Failed to add player to lot queue.")
        setAddingId(null)
        return
      }

      toast.success(`${candidate.fullName} added to auction queue (Lot #${res.data?.drawNumber})`)
      setAddingId(null)
      onOpenChange(false)
      router.refresh()
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred.")
      setAddingId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <UserPlus className="size-5 text-primary" />
            <DialogTitle>Add Existing Player to Lot Queue</DialogTitle>
          </div>
          <DialogDescription>
            Select an eligible registered participant to append to the auction floor queue.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 items-center pt-2">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or roll number..."
              className="pl-9 text-xs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-1 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
            {["all", "B1", "B2", "B3", "B4", "B5", "PG"].map((b) => (
              <Button
                key={b}
                variant={bucketFilter === b ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs px-2.5"
                onClick={() => setBucketFilter(b)}
              >
                {b === "all" ? "All" : b}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-border border rounded-md mt-3 min-h-[250px] max-h-[400px]">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <p className="text-sm font-medium">No available unqueued players found</p>
              <p className="text-xs mt-1">
                {candidates.length === 0
                  ? "All eligible registered players have already been queued."
                  : "Try adjusting your search or bucket filter."}
              </p>
            </div>
          ) : (
            filtered.map((c) => (
              <div
                key={c.registrationId}
                className="flex items-center justify-between p-3 hover:bg-muted/40 transition-colors"
              >
                <div className="flex flex-col min-w-0 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm truncate">{c.fullName}</span>
                    <CategoryBadge bucket={c.bucket as Bucket} />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <span className="font-mono">{c.rollNumber}</span>
                    {c.branch && <span>· {c.branch}</span>}
                    {c.academicYear && <span>· Year {c.academicYear}</span>}
                    <span>· Base: {c.basePrice} Cr</span>
                  </div>
                </div>

                <Button
                  size="sm"
                  onClick={() => handleAddToQueue(c)}
                  disabled={addingId !== null}
                >
                  {addingId === c.registrationId ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <>
                      <UserPlus className="size-3.5 mr-1" />
                      Queue
                    </>
                  )}
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
