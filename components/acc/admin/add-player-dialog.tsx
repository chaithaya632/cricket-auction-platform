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
import { parseRollNumber, calculateAcademicYear, deriveBucket } from "@/domain/academic"
import { BASE_PRICE_LADDER } from "@/lib/constants"
import { toast } from "sonner"
import { UserPlus, Loader2, AlertCircle, Award } from "lucide-react"

export function AddPlayerDialog() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const [fullName, setFullName] = useState("")
  const [rollNumber, setRollNumber] = useState("")
  const [mobile, setMobile] = useState("")
  const [programme, setProgramme] = useState<
    "btech_regular" | "btech_lateral" | "diploma" | "pg"
  >("btech_regular")
  const [academicYear, setAcademicYear] = useState("1")
  const [branch, setBranch] = useState("CSE")
  const [playerType, setPlayerType] = useState<
    "batter" | "bowler" | "all_rounder" | "wicket_keeper" | "wicket_keeper_batter" | "fielder"
  >("all_rounder")
  const [battingStyle, setBattingStyle] = useState<"right_hand" | "left_hand">("right_hand")
  const [bowlingStyle, setBowlingStyle] = useState<string>("right_arm_medium")
  const [basePrice, setBasePrice] = useState("100")
  const [cricheroesUrl, setCricheroesUrl] = useState("")

  const derivedBucket = deriveBucket(programme, parseInt(academicYear, 10) || 1)

  const handleRollChange = (val: string) => {
    const upper = val.toUpperCase().trim()
    setRollNumber(upper)
    const parsed = parseRollNumber(upper)
    if (parsed.isValid && parsed.programme) {
      setError(null)
      setProgramme(parsed.programme)
      if (parsed.admissionYear) {
        const yr = calculateAcademicYear(parsed.admissionYear, parsed.programme)
        setAcademicYear(String(yr))
      }
      if (parsed.branchName) {
        setBranch(parsed.branchName)
      }
    } else if (upper) {
      setError(parsed.error || "Invalid roll number format. Must match B.Tech regular (YY811Abbnn), B.Tech lateral (YY815Abbnn), or Diploma (YY597-BB-nnn).")
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const parsed = parseRollNumber(rollNumber.trim().toUpperCase(), programme)
    if (!parsed.isValid) {
      setError(parsed.error || "Invalid roll number format. Creation blocked.")
      return
    }

    setLoading(true)

    try {
      const res = await adminCreatePlayerAction({
        full_name: fullName.trim(),
        roll_number: rollNumber.trim().toUpperCase(),
        mobile: mobile.trim(),
        programme,
        academic_year: parseInt(academicYear, 10) || 1,
        branch: branch.trim() || null,
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
      setProgramme("btech_regular")
      setAcademicYear("1")
      setBranch("CSE")
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
              Add a student to the active tournament registry. Academic tier and category bucket will be authoritatively derived from the explicit academic selections below.
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
                  placeholder="e.g. 25811A0403, 25815A0403, or 24597-CM-015"
                  required
                  value={rollNumber}
                  onChange={(e) => handleRollChange(e.target.value)}
                  disabled={loading}
                />
                <p className="text-[11px] text-muted-foreground">Authoritative roll number (B.Tech regular, lateral, or Diploma)</p>
              </div>
            </div>

            {/* Academic Information (Explicit Fields) */}
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <Award className="size-3.5" />
                  Academic Classification & Bucket
                </span>
                <span className="rounded-full bg-emerald-600 text-white font-black text-xs px-2.5 py-0.5 shadow-sm">
                  Bucket {derivedBucket}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Programme *</Label>
                  <Select
                    value={programme}
                    onValueChange={(val) => val && setProgramme(val as any)}
                    disabled={loading || programme !== 'pg' || !parseRollNumber(rollNumber).isValid}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Programme" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="btech_regular">B.Tech (Regular)</SelectItem>
                      <SelectItem value="btech_lateral">B.Tech (Lateral)</SelectItem>
                      <SelectItem value="diploma">Diploma</SelectItem>
                      <SelectItem value="pg">Post Graduate (PG)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Academic Year *</Label>
                  <Select
                    value={academicYear}
                    onValueChange={(val) => val && setAcademicYear(val)}
                    disabled={loading || programme !== 'pg' || !parseRollNumber(rollNumber).isValid}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Year" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1st Year</SelectItem>
                      <SelectItem value="2">2nd Year</SelectItem>
                      <SelectItem value="3">3rd Year</SelectItem>
                      <SelectItem value="4">4th Year</SelectItem>
                      <SelectItem value="5">5th Year</SelectItem>
                      <SelectItem value="6">6th Year</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="branch" className="text-xs">Branch / Group</Label>
                  <Input
                    id="branch"
                    placeholder="e.g. CSE"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value.toUpperCase())}
                    disabled={loading || programme !== 'pg' || !parseRollNumber(rollNumber).isValid}
                    className="h-8 text-xs uppercase"
                  />
                </div>
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
                <Select
                  value={basePrice}
                  onValueChange={(val) => val && setBasePrice(val)}
                  disabled={loading}
                >
                  <SelectTrigger id="base_price">
                    <SelectValue placeholder="Select base price" />
                  </SelectTrigger>
                  <SelectContent>
                    {BASE_PRICE_LADDER.map((tier) => (
                      <SelectItem key={tier} value={String(tier)}>
                        ₹{tier} Credits
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
