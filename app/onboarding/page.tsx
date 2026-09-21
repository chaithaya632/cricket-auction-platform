import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { getUserPermissionContext } from '@/lib/permissions/context';
import { AccLogo } from '@/components/acc/brand';
import { LogoutButton } from '@/components/auth/logout-button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { buttonVariants, Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Clock,
  ShieldAlert,
  UserCheck,
  Trophy,
  Users,
  Radio,
  ExternalLink,
  ChevronRight,
  ClipboardList,
  Shield,
  RotateCw,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Account Onboarding · ACC Auction',
  description: 'Account access and season onboarding status for Avanthi Cricket Championship.',
};

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const params = await searchParams;
  const { authUser, appUser } = await getCurrentUser();

  // If unauthenticated, redirect to login
  if (!authUser) {
    redirect('/login?redirectTo=/onboarding');
  }

  const supabase = await createClient();
  const permContext = appUser
    ? await getUserPermissionContext(supabase, appUser)
    : null;

  const hasAdminRole = permContext?.isAdmin ?? false;
  const hasFranchiseRole = permContext?.isFranchise ?? false;
  const hasPlayerRole = permContext?.isPlayer ?? false;
  const hasAnySeasonRole = hasAdminRole || hasFranchiseRole || hasPlayerRole;

  const activeSeasonName = permContext?.activeSeason?.name || 'ACC 2026';
  const userName = appUser?.full_name || authUser.email?.split('@')[0] || 'Member';
  const userEmail = authUser.email || '';
  const assignedFranchiseName = permContext?.assignedFranchise?.name;

  return (
    <div className="min-h-svh bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/80 px-6 backdrop-blur">
        <Link href="/" className="flex items-center gap-2">
          <AccLogo subtitle="Auction Platform" />
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/auction"
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Live Auction
          </Link>
          <Link
            href="/players"
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Players
          </Link>
          <LogoutButton variant="outline" />
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
        {/* If user already has an active season role */}
        {hasAnySeasonRole ? (
          <div className="space-y-6">
            <Alert className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <UserCheck className="size-5 text-emerald-500" />
              <AlertTitle className="font-semibold text-base">Active Season Access Verified</AlertTitle>
              <AlertDescription className="mt-2 text-sm text-foreground/90">
                Welcome, <strong>{userName}</strong>! Your account has authorized role access for{' '}
                <strong>{activeSeasonName}</strong>. Select your portal below to proceed.
              </AlertDescription>
            </Alert>

            <div className="grid gap-4 sm:grid-cols-2">
              {hasPlayerRole && (
                <div className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-emerald-500 font-semibold text-sm">
                    <ClipboardList className="size-4" />
                    <span>Player Credentials Active</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Your player access has been approved. Submit your academic roll number, cricket skills, and CricHeroes profile to complete registration.
                  </p>
                  <div className="mt-auto flex flex-col gap-2 pt-2">
                    <Link
                      href="/player/registration"
                      className={buttonVariants({ size: 'sm', className: 'w-full justify-center gap-1.5' })}
                    >
                      <ClipboardList className="size-4" />
                      Complete Registration Form
                      <ChevronRight className="size-4" />
                    </Link>
                    <Link
                      href="/player"
                      className={buttonVariants({ variant: 'outline', size: 'sm', className: 'w-full justify-center' })}
                    >
                      Player Dashboard
                    </Link>
                  </div>
                </div>
              )}

              {hasFranchiseRole && (
                <div className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-blue-500 font-semibold text-sm">
                    <Trophy className="size-4" />
                    <span>Franchise Bidding Seat Active</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    You are an official representative for{' '}
                    <strong className="text-foreground">{assignedFranchiseName || 'your assigned franchise'}</strong>. Access your squad roster, purse tracking, and live auction console.
                  </p>
                  <div className="mt-auto pt-2">
                    <Link
                      href="/franchise"
                      className={buttonVariants({ size: 'sm', className: 'w-full justify-center gap-1.5' })}
                    >
                      <Trophy className="size-4" />
                      Open Franchise Portal
                      <ChevronRight className="size-4" />
                    </Link>
                  </div>
                </div>
              )}

              {hasAdminRole && (
                <div className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-purple-500 font-semibold text-sm">
                    <Shield className="size-4" />
                    <span>Tournament Administrator</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    You have executive privileges for season orchestration, lot queues, live bidding hammer controls, and user role provisioning.
                  </p>
                  <div className="mt-auto pt-2">
                    <Link
                      href="/admin"
                      className={buttonVariants({ size: 'sm', className: 'w-full justify-center gap-1.5' })}
                    >
                      <Shield className="size-4" />
                      Open Admin Console
                      <ChevronRight className="size-4" />
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* User is authenticated but has no season role yet */
          <Card className="border-border">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2 text-amber-500">
                <Clock className="size-5" />
                <span className="font-mono text-xs uppercase tracking-wider font-semibold">
                  Season Access Pending · {activeSeasonName}
                </span>
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight">
                Your account is waiting for tournament role assignment
              </CardTitle>
              <CardDescription className="text-sm">
                Signed in as <strong className="text-foreground">{userName}</strong> ({userEmail}).
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              {params.reason === 'pending_access' && (
                <Alert className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Clock className="size-4 text-amber-500" />
                  <AlertTitle className="font-semibold text-xs">Role Assignment Required</AlertTitle>
                  <AlertDescription className="text-xs mt-1">
                    The requested page requires an authorized tournament role. Because your account has not yet been provisioned as a Player, Franchise Representative, or Operator for this season, access is held in staging.
                  </AlertDescription>
                </Alert>
              )}

              {params.reason === 'admin_required' && (
                <Alert variant="destructive">
                  <ShieldAlert className="size-4" />
                  <AlertDescription className="text-xs">
                    Administrative privileges are required to access the requested console.
                  </AlertDescription>
                </Alert>
              )}

              <p className="text-sm text-muted-foreground leading-relaxed">
                Your account is securely authenticated with Supabase Auth. In accordance with Avanthi Cricket Championship governance, privileged access to player registration forms, franchise bidding desks, and operator consoles is provisioned by tournament administrators.
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                {/* Player Info Box (Pending) */}
                <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4">
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    <Trophy className="size-4 text-primary" />
                    <span>Tournament Players</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-normal">
                    If you are a student participating in the auction, tournament coordinators verify your student enrollment before granting player credentials.
                  </p>
                  <div className="mt-auto flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-600 dark:text-amber-400">
                    <Clock className="size-3.5 shrink-0" />
                    <span>Awaiting Admin Role Assignment</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    Once activated by an admin, the registration portal will unlock for your account.
                  </span>
                </div>

                {/* Franchise Info Box (Pending) */}
                <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4">
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    <Users className="size-4 text-primary" />
                    <span>Franchise Representatives</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-normal">
                    Franchise coordinators assign bidding seats directly through official team rosters prior to the live hammer stage. Contact the Super Admin if your seat is not yet visible.
                  </p>
                  <div className="mt-auto flex items-center gap-2 rounded-md border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-xs font-medium text-blue-600 dark:text-blue-400">
                    <Shield className="size-3.5 shrink-0" />
                    <span>Franchise Seat Assignment Pending</span>
                  </div>
                  <Link
                    href="/teams"
                    className="inline-flex items-center text-[11px] font-medium text-primary hover:underline"
                  >
                    View Official Franchises
                    <ExternalLink className="ml-1 size-3" />
                  </Link>
                </div>
              </div>

              {/* Status Refresh & Public Links */}
              <div className="flex flex-col gap-3 rounded-lg border border-dashed bg-muted/30 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">Explore public features while waiting:</span>
                  <Link
                    href="/onboarding"
                    className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <RotateCw className="size-3" />
                    Check Status
                  </Link>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href="/auction" className={buttonVariants({ variant: "outline", size: "sm" })}>
                    <Radio className="mr-1.5 size-3.5 text-red-500" />
                    Public Auction Feed
                  </Link>
                  <Link href="/players" className={buttonVariants({ variant: "outline", size: "sm" })}>
                    <Users className="mr-1.5 size-3.5" />
                    Player Directory
                  </Link>
                  <Link href="/teams" className={buttonVariants({ variant: "outline", size: "sm" })}>
                    <Trophy className="mr-1.5 size-3.5" />
                    Franchise Standings
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
