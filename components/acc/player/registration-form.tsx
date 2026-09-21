"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { BUCKET_ORDER, CATEGORY_CONFIG } from "@/lib/acc/config"
import type { Player, PlayerType } from "@/lib/acc/types"
import { User, GraduationCap, Activity } from "lucide-react"

const PLAYER_TYPES: PlayerType[] = [
  "Batter",
  "Bowler",
  "All-rounder",
  "Wicket-keeper",
  "Wicket-keeper batter",
]

const COURSES: Player["course"][] = ["UG", "Diploma", "PG"]

export function RegistrationForm({ player }: { player: Player }) {
  const [saving, setSaving] = useState(false)
  const locked = player.status !== "REGISTERED" && player.status !== "UNDER_REVIEW"

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setTimeout(() => {
      setSaving(false)
      toast.success("Registration details submitted for review")
    }, 700)
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">Personal information</CardTitle>
          </div>
          <CardDescription>These details identify you across the auction registry.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input id="fullName" defaultValue={player.fullName} disabled={locked} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="rollNumber">Roll number</Label>
            <Input id="rollNumber" defaultValue={player.rollNumber} disabled className="font-mono" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="photoUrl">Photo URL</Label>
            <Input id="photoUrl" defaultValue={player.photoUrl} placeholder="https://…" disabled={locked} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cricheroes">CricHeroes profile</Label>
            <div className="flex h-9 items-center justify-between rounded-md border px-3">
              <span className="text-sm text-muted-foreground">Verified</span>
              <Switch defaultChecked={player.cricheroesVerified} disabled />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <GraduationCap className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">Academic information</CardTitle>
          </div>
          <CardDescription>Determines your auction category and eligibility.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="course">Course</Label>
            <Select defaultValue={player.course} disabled={locked}>
              <SelectTrigger id="course">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COURSES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="program">Program</Label>
            <Input id="program" defaultValue={player.program} disabled={locked} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="branch">Branch</Label>
            <Input id="branch" defaultValue={player.branch} disabled={locked} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="year">Year of study</Label>
            <Input id="year" type="number" min={1} max={5} defaultValue={player.yearOfStudy} disabled={locked} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="bucket">Category</Label>
            <Select defaultValue={player.bucket} disabled>
              <SelectTrigger id="bucket">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUCKET_ORDER.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b} — {CATEGORY_CONFIG[b].description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="lateral">Lateral entry</Label>
            <div className="flex h-9 items-center justify-between rounded-md border px-3">
              <span className="text-sm text-muted-foreground">Yes / No</span>
              <Switch defaultChecked={player.isLateral} disabled={locked} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">Cricket profile</CardTitle>
          </div>
          <CardDescription>Help franchises scout you accurately before the auction.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="playerType">Player type</Label>
            <Select defaultValue={player.playerType} disabled={locked}>
              <SelectTrigger id="playerType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLAYER_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="notes">Playing notes</Label>
            <Textarea
              id="notes"
              rows={4}
              placeholder="Batting order, bowling style, notable achievements…"
              disabled={locked}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col items-stretch justify-end gap-2 sm:flex-row sm:items-center">
        {locked && (
          <p className="text-xs text-muted-foreground sm:mr-auto">
            Your registration is locked while it is being processed for the auction.
          </p>
        )}
        <Button type="button" variant="outline" disabled={locked}>
          Reset
        </Button>
        <Button type="submit" disabled={saving || locked}>
          {saving ? "Submitting…" : "Submit for review"}
        </Button>
      </div>
    </form>
  )
}
