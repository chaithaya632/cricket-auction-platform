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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { adminCreatePlayerAction } from "@/lib/players/actions"
import { toast } from "sonner"
import { UserPlus, Loader2, AlertCircle } from "lucide-react"

export function AddPlayerDialog() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const [fullName, setFullName] = useState("")
  const [rollNumber, setRollNumber] = useState("")
  const [mobile, setMobile] = useState("")
  const [playerType, setPlayerType] = useState<
    "batter" | "bowler" | "all_rounder" | "wicket_keeper" | "wicket_keeper_batter" | "fielder"
  >("all_rounder")
  const [battingStyle, setBattingStyle] = useState<"right_hand" | "left_hand">("right_hand")
  const [bowlingStyle, setBowlingStyle] = useState<string>("right_arm_medium")
  const [basePrice, setBasePrice] = useState("100")
  const [cricheroesUrl, setCricheroesUrl] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await adminCreatePlayerAction({
        full_name: fullName.trim(),
        roll_number: rollNumber.trim().toUpperCase(),
        mobile: mobile.trim(),
        player_type: playerType,
        batting_style: battingStyle,
        bowling_style: bowlingStyle === "none" ? null : bowlingStyle,
        base_price: parseInt(basePrice, 10) || 100,
        cricheroes_url: cricheroesUrl.trim() || null,
      })

      if (!res.success) {
        setError(res.error || "Failed to register player.")
        setLoading(false)
        return
      }

      toast.success(`Player ${fullName} registered successfully!`)
      setOpen(false)
      // Reset fields
      setFullName("")
      setRollNumber("")
      setMobile("")
      setCricheroesUrl("")
      setBasePrice("100")
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
            <UserPlus className="size-4" />
            Add player
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Register New Player</DialogTitle>
            <DialogDescription>
              Add a student to the active tournament registry. Academic tier and category bucket will be computed authoritatively from the roll number.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="my-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="full_name">Full Name *</Label>
                <Input
                  id="full_name"
                  placeholder="e.g. Arjun Reddy"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="roll_number">Roll Number *</Label>
                <Input
                  id="roll_number"
                  placeholder="e.g. 21KD1A0501"
                  required
                  value={rollNumber}
                  onChange={(e) => setRollNumber(e.target.value.toUpperCase())}
                  disabled={loading}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="mobile">Mobile Number * (Private)</Label>
                <Input
                  id="mobile"
                  placeholder="10-digit mobile (6-9...)"
                  required
                  pattern="^[6-9]\d{9}$"
                  title="10-digit Indian phone number starting with 6-9"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="base_price">Base Price (Credits)</Label>
                <Input
                  id="base_price"
                  type="number"
                  min="50"
                  step="50"
                  value={basePrice}
                  onChange={(e) => setBasePrice(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Player Type</Label>
                <Select
                  value={playerType}
                  onValueChange={(val) => val && setPlayerType(val as any)}
                  disabled={loading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all_rounder">All-rounder</SelectItem>
                    <SelectItem value="batter">Batter</SelectItem>
                    <SelectItem value="bowler">Bowler</SelectItem>
                    <SelectItem value="wicket_keeper">Wicket-keeper</SelectItem>
                    <SelectItem value="wicket_keeper_batter">Wicket-keeper batter</SelectItem>
                    <SelectItem value="fielder">Fielder</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Batting Style</Label>
                <Select
                  value={battingStyle}
                  onValueChange={(val) => val && setBattingStyle(val as any)}
                  disabled={loading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Batting style" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="right_hand">Right Hand</SelectItem>
                    <SelectItem value="left_hand">Left Hand</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Bowling Style</Label>
              <Select
                value={bowlingStyle}
                onValueChange={(val) => setBowlingStyle(val ?? "right_arm_medium")}
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Bowling style" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="right_arm_medium">Right Arm Medium</SelectItem>
                  <SelectItem value="right_arm_fast">Right Arm Fast</SelectItem>
                  <SelectItem value="left_arm_fast">Left Arm Fast</SelectItem>
                  <SelectItem value="right_arm_off_spin">Right Arm Off Spin</SelectItem>
                  <SelectItem value="right_arm_leg_spin">Right Arm Leg Spin</SelectItem>
                  <SelectItem value="left_arm_orthodox">Left Arm Orthodox</SelectItem>
                  <SelectItem value="none">None / Non-bowler</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cricheroes_url">CricHeroes Profile URL (Optional)</Label>
              <Input
                id="cricheroes_url"
                placeholder="https://cricheroes.com/player-profile/..."
                value={cricheroesUrl}
                onChange={(e) => setCricheroesUrl(e.target.value)}
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
              Register Player
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
