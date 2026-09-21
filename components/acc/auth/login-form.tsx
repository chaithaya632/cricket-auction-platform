"use client"

import { useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ROLE_META, type Role } from "@/lib/acc/nav"
import { Eye, EyeOff, Loader2, LogIn, AlertCircle } from "lucide-react"
import { loginAction } from "@/lib/auth/actions"

const DEMO: Record<string, Role> = {
  "admin@avanthi.edu": "admin",
  "franchise@avanthi.edu": "franchise",
  "player@avanthi.edu": "player",
}

function LoginFormFields() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get("redirectTo") || "/"

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!email || !password) {
      setError("Enter both your email and password to continue.")
      return
    }

    setLoading(true)
    try {
      const result = await loginAction(
        { email: email.trim(), password },
        redirectTo
      )

      if (!result.success) {
        setError(result.error || "Authentication failed. Please check your credentials.")
        setLoading(false)
        return
      }

      router.push(result.redirectTo || redirectTo)
      router.refresh()
    } catch {
      setError("An unexpected error occurred during sign in. Please try again.")
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 text-center lg:text-left">
        <h2 className="text-2xl font-bold tracking-tight">Sign in to your portal</h2>
        <p className="text-sm text-muted-foreground">
          Enter your credentials to access the ACC auction platform.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@avanthi.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!error && !email}
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="#" className="text-xs text-muted-foreground hover:text-foreground">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-10"
              aria-invalid={!!error && !password}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-0 top-0 flex h-full w-10 items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label={show ? "Hide password" : "Show password"}
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox id="remember" defaultChecked />
          <Label htmlFor="remember" className="text-sm font-normal text-muted-foreground">
            Remember this session
          </Label>
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Signing in…
            </>
          ) : (
            <>
              <LogIn className="size-4" />
              Sign in
            </>
          )}
        </Button>
      </form>

      <div className="rounded-lg border border-dashed bg-muted/30 p-4">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Demo accounts (any password)</p>
        <div className="flex flex-col gap-1.5">
          {Object.entries(DEMO).map(([demoEmail, role]) => (
            <button
              key={demoEmail}
              type="button"
              onClick={() => {
                setEmail(demoEmail)
                setPassword("demo1234")
                setError(null)
              }}
              className="flex items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted"
            >
              <span className="font-mono text-foreground">{demoEmail}</span>
              <span className="capitalize text-muted-foreground">{ROLE_META[role].label}</span>
            </button>
          ))}
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Accounts are provisioned by tournament administrators. Public registration is closed.
      </p>
    </div>
  )
}

export function LoginForm() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[300px] items-center justify-center p-8">
          <div className="text-sm text-muted-foreground">Loading sign in form…</div>
        </div>
      }
    >
      <LoginFormFields />
    </Suspense>
  )
}
