"use client"

import { useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Eye, EyeOff, Loader2, UserPlus, AlertCircle, CheckCircle2, ArrowRight } from "lucide-react"
import { signupAction } from "@/lib/auth/actions"

function SignupFormFields() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get("redirectTo") || "/"

  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmationRequired, setConfirmationRequired] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!fullName.trim() || !email.trim() || !password || !confirmPassword) {
      setError("Please fill in all required fields.")
      return
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.")
      return
    }

    setLoading(true)
    try {
      const result = await signupAction({
        fullName: fullName.trim(),
        email: email.trim(),
        password,
        confirmPassword,
      })

      if (!result.success) {
        setError(result.error || "Unable to create account. Please try again.")
        setLoading(false)
        return
      }

      if (result.emailConfirmationRequired) {
        setConfirmationRequired(true)
        setLoading(false)
        return
      }

      router.push(result.redirectTo || "/onboarding")
      router.refresh()
    } catch {
      setError("An unexpected error occurred during account creation. Please try again.")
      setLoading(false)
    }
  }

  if (confirmationRequired) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
            <CheckCircle2 className="size-6" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Check your email</h2>
          <p className="text-sm text-muted-foreground">
            We sent a verification link to <span className="font-medium text-foreground">{email}</span>.
            Please verify your email address to complete your registration and sign in.
          </p>
        </div>

        <Alert className="border-border bg-muted/40 text-muted-foreground">
          <AlertDescription className="text-xs">
            After confirming your email, your account will be active. Tournament access and season roles are provisioned by tournament administrators.
          </AlertDescription>
        </Alert>

        <Button
          onClick={() => router.push("/login?notice=confirmation_required")}
          className="w-full"
        >
          Proceed to Sign In
          <ArrowRight className="ml-2 size-4" />
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 text-center lg:text-left">
        <h2 className="text-2xl font-bold tracking-tight">Create your ACC account</h2>
        <p className="text-sm text-muted-foreground">
          Enter your personal details to register on the Avanthi Cricket Championship portal.
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
          <Label htmlFor="fullName">Full name</Label>
          <Input
            id="fullName"
            type="text"
            autoComplete="name"
            placeholder="e.g. Rahul Sharma"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            aria-invalid={!!error && !fullName}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@domain.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!error && !email}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Minimum 6 characters"
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

        <div className="flex flex-col gap-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input
            id="confirmPassword"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Re-enter your password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            aria-invalid={!!error && !confirmPassword}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          Season roles (Admin, Franchise, or Player) are provisioned by tournament administrators after account creation.
        </p>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Creating account…
            </>
          ) : (
            <>
              <UserPlus className="size-4" />
              Create account
            </>
          )}
        </Button>
      </form>

      <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
        <span>Already have an account?</span>
        <Link
          href={`/login${redirectTo && redirectTo !== "/" ? `?redirectTo=${encodeURIComponent(redirectTo)}` : ""}`}
          className="font-medium text-primary hover:underline"
        >
          Sign in
        </Link>
      </div>
    </div>
  )
}

export function SignupForm() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[300px] items-center justify-center p-8">
          <div className="text-sm text-muted-foreground">Loading registration form…</div>
        </div>
      }
    >
      <SignupFormFields />
    </Suspense>
  )
}
