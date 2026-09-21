'use client';

// =============================================================================
// ACC Auction Portal — Login Page
// =============================================================================

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { loginAction } from '@/lib/auth/actions';
import { LogoutButton } from '@/components/auth/logout-button';
import type { User as SupabaseUser } from '@supabase/supabase-js';

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<SupabaseUser | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Check if already authenticated on mount
  useEffect(() => {
    async function checkAuth() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        setCurrentUser(user);
      } catch {
        setCurrentUser(null);
      } finally {
        setIsCheckingAuth(false);
      }
    }
    checkAuth();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const result = await loginAction(
        { email: email.trim(), password },
        redirectTo
      );

      if (!result.success) {
        setError(result.error || 'Authentication failed. Please check your credentials.');
        setIsLoading(false);
        return;
      }

      // Route to destination
      router.push(result.redirectTo || redirectTo);
      router.refresh();
    } catch {
      setError('An unexpected error occurred during sign in. Please try again.');
      setIsLoading(false);
    }
  }

  if (isCheckingAuth) {
    return (
      <div className="flex min-h-[250px] items-center justify-center p-8">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <svg
            className="h-4 w-4 animate-spin text-emerald-600"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          Loading...
        </div>
      </div>
    );
  }

  // If user is already signed in, show status & action options
  if (currentUser) {
    return (
      <div
        className="rounded-lg border p-8 shadow-sm"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-xl font-bold dark:bg-emerald-950 dark:text-emerald-400">
            ✓
          </div>
          <h1 className="text-2xl font-bold">Already Signed In</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            You are signed in as <span className="font-semibold text-gray-900 dark:text-gray-100">{currentUser.email}</span>
          </p>
        </div>

        <div className="space-y-3">
          <Link
            href={redirectTo && redirectTo !== '/login' ? redirectTo : '/'}
            className="flex w-full items-center justify-center rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            Continue to Application
          </Link>
          <div className="text-center pt-2">
            <LogoutButton variant="ghost" className="w-full text-sm">
              Sign out of this account
            </LogoutButton>
          </div>
        </div>

        <div className="mt-6 text-center border-t pt-4" style={{ borderColor: 'var(--border)' }}>
          <Link
            href="/"
            className="text-xs hover:underline"
            style={{ color: 'var(--muted-foreground)' }}
          >
            ← Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg border p-8 shadow-sm"
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold">Welcome to ACC</h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>
          Sign in to access your dashboard
        </p>
      </div>

      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="mb-5 rounded-md border border-red-200 bg-red-50 p-3.5 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
        >
          <div className="flex items-start gap-2">
            <span className="font-bold text-sm leading-none">!</span>
            <span>{error}</span>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label
            htmlFor="email"
            className="block text-xs font-semibold text-gray-700 dark:text-gray-300"
          >
            Email Address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            aria-required="true"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading}
            placeholder="name@avanthi.edu"
            className="mt-1.5 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-xs font-semibold text-gray-700 dark:text-gray-300"
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-required="true"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
            placeholder="••••••••"
            className="mt-1.5 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="mt-2 flex w-full items-center justify-center rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
        >
          {isLoading ? (
            <span className="inline-flex items-center gap-2">
              <svg
                className="h-4 w-4 animate-spin text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Signing in...
            </span>
          ) : (
            'Sign In'
          )}
        </button>
      </form>

      <div className="mt-6 text-center border-t pt-4" style={{ borderColor: 'var(--border)' }}>
        <Link
          href="/"
          className="text-xs hover:underline"
          style={{ color: 'var(--muted-foreground)' }}
        >
          ← Back to Home
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[250px] items-center justify-center p-8">
          <div className="text-sm text-gray-500">Loading...</div>
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
