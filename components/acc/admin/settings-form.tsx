"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { STARTING_PURSE, MIN_PER_BUCKET, TARGET_SQUAD } from "@/lib/acc/config"

export function SettingsForm() {
  const [saving, setSaving] = useState(false)

  function onSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setTimeout(() => {
      setSaving(false)
      toast.success("Tournament settings saved")
    }, 700)
  }

  return (
    <form onSubmit={onSave} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Purse &amp; squad rules</CardTitle>
          <CardDescription>Applies to every franchise for the current season.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="purse">Starting purse (₹)</Label>
            <Input id="purse" type="number" defaultValue={STARTING_PURSE} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="target">Target squad size</Label>
            <Input id="target" type="number" defaultValue={TARGET_SQUAD} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="minbucket">Min. per category</Label>
            <Input id="minbucket" type="number" defaultValue={MIN_PER_BUCKET} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bid ladder</CardTitle>
          <CardDescription>Increment steps applied as the current bid rises (§11).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="step1">Below ₹100 → +</Label>
            <Input id="step1" type="number" defaultValue={10} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="step2">₹100–₹200 → +</Label>
            <Input id="step2" type="number" defaultValue={20} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="step3">Above ₹200 → +</Label>
            <Input id="step3" type="number" defaultValue={30} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Auction floor</CardTitle>
          <CardDescription>Timing and access controls for the live console.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:max-w-xs">
            <Label htmlFor="timer">Bid timer (seconds)</Label>
            <Input id="timer" type="number" defaultValue={20} />
          </div>
          <Separator />
          <ToggleRow
            label="Registration open"
            description="Allow players to submit new registrations."
            defaultChecked
          />
          <ToggleRow
            label="Franchise bidding enabled"
            description="Let franchise coordinators place bids from their portal."
            defaultChecked
          />
          <ToggleRow
            label="Public spectator mode"
            description="Show the live auction on the public site without login."
            defaultChecked
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tournament Dataset Export (§16, §49)</CardTitle>
          <CardDescription>
            Download the authoritative tournament spreadsheet containing players, franchises, squads, auction lots, and the complete audit event ledger.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <a
            href="/api/admin/export"
            download
            className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors bg-emerald-600 text-white hover:bg-emerald-700 h-9 px-4 py-2 cursor-pointer shadow-sm"
          >
            📊 Download Tournament Spreadsheet (.CSV)
          </a>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline">
          Reset
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  )
}

function ToggleRow({
  label,
  description,
  defaultChecked,
}: {
  label: string
  description: string
  defaultChecked?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
      <div className="flex flex-col">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </div>
      <Switch defaultChecked={defaultChecked} />
    </div>
  )
}
