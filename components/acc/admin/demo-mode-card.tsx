"use client"

// =============================================================================
// ACC Auction Portal — Demo Mode Admin Card
// =============================================================================
// Controlled cleanup mechanism for judge demonstration data.
// Visible ONLY in demo/rehearsal environments.
// Strictly hidden in production (fail-closed).
// =============================================================================

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { disableDemoModeAction, enableDemoModeAction } from "@/lib/demo/actions"
import { REQUIRED_CONFIRMATION_PHRASE, DEMO_PROJECT_REF, PRODUCTION_PROJECT_REF } from "@/lib/demo/config"
import { AlertTriangle, CheckCircle2, ShieldAlert, Loader2, ArrowLeft, Play, Lock } from "lucide-react"

interface DemoModeCardProps {
  initialIsDemoEnv: boolean
  initialIsDemoActive: boolean
  projectRef?: string | null
}

export function DemoModeCard({
  initialIsDemoEnv,
  initialIsDemoActive,
  projectRef,
}: DemoModeCardProps) {
  const [isDemoActive, setIsDemoActive] = useState(initialIsDemoActive)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [confirmationPhrase, setConfirmationPhrase] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)

  // In production environment (or any non-demo environment), show the protected lock state
  if (!initialIsDemoEnv) {
    return (
      <Card className="border-border/60 bg-muted/20">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <CardTitle className="text-base font-semibold">Demo / Judge Mode</CardTitle>
              <Badge variant="outline" className="font-mono text-xs uppercase border-border/80 text-muted-foreground">
                PRODUCTION PROTECTED
              </Badge>
            </div>
            {projectRef && (
              <span className="font-mono text-xs text-muted-foreground">
                Environment: {projectRef}
              </span>
            )}
          </div>
          <CardDescription>
            Demo mode is disabled in production. This portal is connected to the official ACC tournament database.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/40 p-3 text-sm text-muted-foreground">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="flex flex-col gap-1">
              <span className="font-medium text-foreground">Production Safety Lock Active</span>
              <span className="text-xs">
                Demo data cleanup controls are strictly restricted to the approved rehearsal environment (<code className="font-mono text-xs font-semibold">{DEMO_PROJECT_REF}</code>). Production tournament data (<code className="font-mono text-xs font-semibold">{PRODUCTION_PROJECT_REF}</code>) is fully isolated and cannot be modified by demo controls.
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button
              type="button"
              variant="destructive"
              disabled={true}
              className="gap-2 cursor-not-allowed opacity-60"
            >
              <Lock className="size-4" />
              Disable Demo Mode
            </Button>
            <span className="text-xs text-muted-foreground">
              Locked in production · Demo cleanup is only active in rehearsal (<code className="font-mono">{DEMO_PROJECT_REF}</code>)
            </span>
          </div>
        </CardContent>
      </Card>
    )
  }

  const isConfirmed = confirmationPhrase.trim() === REQUIRED_CONFIRMATION_PHRASE

  async function handleDisableDemo() {
    if (!isConfirmed) return

    setIsProcessing(true)
    try {
      const result = await disableDemoModeAction(confirmationPhrase.trim())
      if (result.success) {
        setIsDemoActive(false)
        setDialogOpen(false)
        setConfirmationPhrase("")
        toast.success("Demo mode disabled. Rehearsal data successfully cleaned up.")
      } else {
        toast.error(result.error || "Failed to disable demo mode.")
      }
    } catch {
      toast.error("An unexpected error occurred during demo cleanup.")
    } finally {
      setIsProcessing(false)
    }
  }

  async function handleEnableDemo() {
    setIsProcessing(true)
    try {
      const result = await enableDemoModeAction()
      if (result.success) {
        setIsDemoActive(true)
        toast.success("Demo mode enabled for judge evaluation.")
      } else {
        toast.error(result.error || "Failed to enable demo mode.")
      }
    } catch {
      toast.error("An unexpected error occurred while enabling demo mode.")
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <Card className="border-amber-500/20 bg-amber-500/[0.02]">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <CardTitle className="text-base font-semibold">Demo / Judge Mode</CardTitle>
            {isDemoActive ? (
              <Badge className="bg-amber-500/10 text-amber-500 border border-amber-500/20 font-mono text-xs uppercase">
                DEMO MODE ACTIVE
              </Badge>
            ) : (
              <Badge className="bg-muted text-muted-foreground font-mono text-xs uppercase">
                DEMO MODE DISABLED
              </Badge>
            )}
          </div>
          {projectRef && (
            <span className="font-mono text-xs text-muted-foreground">
              Environment: {projectRef}
            </span>
          )}
        </div>
        <CardDescription>
          {isDemoActive
            ? "Demo data is currently available for judge evaluation."
            : "Judge demonstration data has been removed/disabled."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isDemoActive ? (
          <>
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-200/90">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
              <div className="flex flex-col gap-1">
                <span className="font-medium text-amber-300">Controlled Demonstration Environment</span>
                <span className="text-xs text-amber-200/70">
                  This environment is loaded with controlled evaluation players, franchises, and auction states.
                  After judging concludes, click below to cleanly remove all demonstration data.
                  Real ACC production data is fully isolated and will not be affected.
                </span>
              </div>
            </div>

            <div className="flex justify-start">
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  setConfirmationPhrase("")
                  setDialogOpen(true)
                }}
                className="gap-2"
              >
                <ShieldAlert className="size-4" />
                Disable Demo Mode
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-200/90">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />
              <div className="flex flex-col gap-1">
                <span className="font-medium text-emerald-300">Judge Demonstration Cleaned Up</span>
                <span className="text-xs text-emerald-200/70">
                  Judge demonstration data has been removed/disabled. Production ACC data was not affected.
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link href="/admin">
                <Button type="button" variant="outline" className="gap-2">
                  <ArrowLeft className="size-4" />
                  Return to Admin Dashboard
                </Button>
              </Link>
              <Button
                type="button"
                variant="secondary"
                onClick={handleEnableDemo}
                disabled={isProcessing}
                className="gap-2"
              >
                {isProcessing ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                Enable Demo Mode
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      {/* Confirmation Dialog (§3) */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="size-5" />
              Disable Demo Mode?
            </DialogTitle>
            <DialogDescription className="text-left space-y-2 pt-2 text-foreground/90">
              <p>
                This will remove/disable the controlled demonstration data used for judge evaluation.
              </p>
              <p className="font-medium text-emerald-400">
                Real ACC production data will not be affected.
              </p>
              <p className="text-xs text-muted-foreground">
                This action cannot be automatically undone.
              </p>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="confirmation-input" className="text-xs font-semibold text-muted-foreground">
                Type <span className="font-mono font-bold text-destructive">{REQUIRED_CONFIRMATION_PHRASE}</span> to confirm:
              </Label>
              <Input
                id="confirmation-input"
                value={confirmationPhrase}
                onChange={(e) => setConfirmationPhrase(e.target.value)}
                placeholder={REQUIRED_CONFIRMATION_PHRASE}
                autoFocus
                disabled={isProcessing}
                className="font-mono"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDialogOpen(false)
                setConfirmationPhrase("")
              }}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDisableDemo}
              disabled={!isConfirmed || isProcessing}
              className="gap-2"
            >
              {isProcessing && <Loader2 className="size-4 animate-spin" />}
              Disable Demo Mode
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
