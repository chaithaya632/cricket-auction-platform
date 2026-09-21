import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { getUserPermissionContext } from '@/lib/permissions/context';
import { AccLogo } from '@/components/acc/brand';
import { LogoutButton } from '@/components/auth/logout-button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
          <Alert className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <UserCheck className="size-5 text-emerald-500" />
            <AlertTitle className="font-semibold">Active Season Access Verified</AlertTitle>
            <AlertDescription className="mt-2 text-sm">
              Your account has authorized role access for <strong>{activeSeasonName}</strong>. You may proceed directly to your assigned workspace.
            </AlertDescription>
            <div className="mt-4 flex flex-wrap gap-3">
              {hasAdminRole && (
                <Button render={<Link href="/admin" />} size="sm">
                  Go to Admin Console
                  <ChevronRight className="ml-1 size-4" />
                </Button>
              )}
              {hasFranchiseRole && (
                <Button render={<Link href="/franchise" />} size="sm">
                  Go to Franchise Portal
                  <ChevronRight className="ml-1 size-4" />
                </Button>
              )}
              {hasPlayerRole && (
                <Button render={<Link href="/player" />} size="sm">
                  Go to Player Portal
                  <ChevronRight className="ml-1 size-4" />
                </Button>
              )}
            </div>
          </Alert>
        ) : (
          /* User is authenticated but has no season role yet */
          <Card className="border-border">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2 text-amber-500">
                <Clock className="size-5" />
                <span className="font-mono text-xs uppercase tracking-wider">
                  Season Onboarding · {activeSeasonName}
                </span>
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight">
                Your account is awaiting access/setup.
              </CardTitle>
              <CardDescription className="text-sm">
                Signed in as <strong className="text-foreground">{userName}</strong> ({userEmail}).
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              {params.reason === 'admin_required' && (
                <Alert variant="destructive">
                  <ShieldAlert className="size-4" />
                  <AlertDescription>
                    Administrative privileges are required to access the requested console.
                  </AlertDescription>
                </Alert>
              )}

              <p className="text-sm text-muted-foreground leading-relaxed">
                Your user account is securely authenticated. In accordance with Avanthi Cricket Championship regulations, privileged access to operator consoles, franchise bidding desks, and player registries is provisioned administratively by the tournament committee.
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-4">
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    <Trophy className="size-4 text-primary" />
                    <span>Tournament Players</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-normal">
                    If you are a student participating in the auction, tournament coordinators verify your academic credentials before activating your player profile. Once activated, visit the player registration portal.
                  </p>
                  <Link
                    href="/player/registration"
                    className="mt-auto inline-flex items-center text-xs font-medium text-primary hover:underline"
                  >
                    Player Registration Portal
                    <ExternalLink className="ml-1 size-3" />
                  </Link>
                </div>

                <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-4">
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    <Users className="size-4 text-primary" />
                    <span>Franchise Representatives</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-normal">
                    Franchise coordinators assign bidding seats directly through official team rosters prior to the live hammer stage. Contact the Super Admin if your seat is not yet visible.
                  </p>
                  <Link
                    href="/teams"
                    className="mt-auto inline-flex items-center text-xs font-medium text-primary hover:underline"
                  >
                    View Official Franchises
                    <ExternalLink className="ml-1 size-3" />
                  </Link>
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-lg border border-dashed bg-muted/30 p-4">
                <span className="text-xs font-semibold text-foreground">While waiting, you can explore public features:</span>
                <div className="flex flex-wrap gap-2">
                  <Button render={<Link href="/auction" />} variant="outline" size="sm">
                    <Radio className="mr-1.5 size-3.5 text-red-500" />
                    Public Auction Feed
                  </Button>
                  <Button render={<Link href="/players" />} variant="outline" size="sm">
                    <Users className="mr-1.5 size-3.5" />
                    Player Directory
                  </Button>
                  <Button render={<Link href="/teams" />} variant="outline" size="sm">
                    <Trophy className="mr-1.5 size-3.5" />
                    Franchise Standings
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
