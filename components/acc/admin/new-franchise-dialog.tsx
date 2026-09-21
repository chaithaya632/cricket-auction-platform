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
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { adminCreateFranchiseAction } from "@/lib/franchises/actions"
import { toast } from "sonner"
import { Plus, Loader2, AlertCircle } from "lucide-react"

export function NewFranchiseDialog() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const [name, setName] = useState("")
  const [shortName, setShortName] = useState("")
  const [colorPrimary, setColorPrimary] = useState("#0284c7")
  const [colorSecondary, setColorSecondary] = useState("#38bdf8")
  const [coordinatorName, setCoordinatorName] = useState("")
  const [coordinatorMobile, setCoordinatorMobile] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await adminCreateFranchiseAction({
        name: name.trim(),
        short_name: shortName.trim().toUpperCase(),
        color_primary: colorPrimary.trim() || "#0284c7",
        color_secondary: colorSecondary.trim() || "#38bdf8",
        faculty_coordinator_name: coordinatorName.trim() || undefined,
        faculty_coordinator_mobile: coordinatorMobile.trim() || undefined,
      })

      if (!res.success) {
        setError(res.error || "Failed to create franchise.")
        setLoading(false)
        return
      }

      toast.success(`Franchise ${name} registered successfully!`)
      setOpen(false)
      // Reset form
      setName("")
      setShortName("")
      setColorPrimary("#0284c7")
      setColorSecondary("#38bdf8")
      setCoordinatorName("")
      setCoordinatorMobile("")
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus className="size-4" />
            New franchise
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Register New Franchise</DialogTitle>
            <DialogDescription>
              Create a participating tournament team with official colors and faculty coordinator oversight.
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
              <Label htmlFor="franchise_name">Team Name *</Label>
              <Input
                id="franchise_name"
                placeholder="e.g. Coastal Strikers"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="short_name">Short Code (2–5 uppercase letters) *</Label>
              <Input
                id="short_name"
                placeholder="e.g. CS"
                maxLength={5}
                required
                value={shortName}
                onChange={(e) => setShortName(e.target.value.toUpperCase())}
                disabled={loading}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="color_primary">Primary Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    id="color_primary_picker"
                    value={colorPrimary}
                    onChange={(e) => setColorPrimary(e.target.value)}
                    className="size-8 cursor-pointer rounded border border-input bg-transparent p-0"
                    disabled={loading}
                  />
                  <Input
                    id="color_primary"
                    value={colorPrimary}
                    onChange={(e) => setColorPrimary(e.target.value)}
                    disabled={loading}
                    className="font-mono text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="color_secondary">Secondary Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    id="color_secondary_picker"
                    value={colorSecondary}
                    onChange={(e) => setColorSecondary(e.target.value)}
                    className="size-8 cursor-pointer rounded border border-input bg-transparent p-0"
                    disabled={loading}
                  />
                  <Input
                    id="color_secondary"
                    value={colorSecondary}
                    onChange={(e) => setColorSecondary(e.target.value)}
                    disabled={loading}
                    className="font-mono text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="coordinator_name">Faculty Coordinator Name</Label>
              <Input
                id="coordinator_name"
                placeholder="e.g. Dr. K. Ramesh"
                value={coordinatorName}
                onChange={(e) => setCoordinatorName(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="coordinator_mobile">Faculty Coordinator Mobile</Label>
              <Input
                id="coordinator_mobile"
                placeholder="10-digit mobile (optional)"
                pattern="^[6-9]\d{9}$"
                value={coordinatorMobile}
                onChange={(e) => setCoordinatorMobile(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
              Create Franchise
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
