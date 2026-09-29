import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireMatchScorer } from '@/lib/matches/permissions';
import { getMatchFullDetails } from '@/lib/matches/queries';
import { getUserPermissionContext } from '@/lib/permissions/context';
import { DashboardShell } from '@/components/acc/dashboard-shell';
import { getSessionUser } from '@/lib/acc/server-session';
import { ScoreKeypad } from '@/components/match/score-keypad';
import { ScorerSetupPanel } from '@/components/match/scorer-setup-panel';
import { MatchScoreboard } from '@/components/match/match-scoreboard';
import { MatchRealtimeSync } from '@/components/match/match-realtime-sync';
import { ChevronLeft, ExternalLink, Radio } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface ScorerPageProps {
  params: Promise<{
    matchId: string;
  }>;
}

export default async function ScorerConsolePage({ params }: ScorerPageProps) {
  const { matchId } = await params;

  // Authorize match scorer or admin (fails closed)
  const [sessionUser, scorerCtx, supabase] = await Promise.all([
    getSessionUser('admin'),
    requireMatchScorer(matchId),
    createClient(),
  ]);
  const permContext = await getUserPermissionContext(supabase, scorerCtx.user);

  const details = await getMatchFullDetails(supabase, matchId);
  if (!details) {
    notFound();
  }

  const needsOpeningSetup =
    !details.currentStriker || !details.currentNonStriker || !details.currentBowler;

  const isLive =
    details.match.status === 'live' ||
    details.match.status === 'toss' ||
    details.match.status === 'innings_break';

  return (
    <DashboardShell
      role="admin"
      user={sessionUser}
      breadcrumb="Scorer Console"
    >
      {/* Realtime Broadcast Client Listener */}
      <MatchRealtimeSync matchId={matchId} />

      <div className="max-w-6xl mx-auto py-4 space-y-6">
        {/* Navigation & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <Link
              href="/admin/matches"
              className="size-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              <ChevronLeft className="size-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">
                  Official Scorer Console
                </span>
                {isLive && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/30">
                    <Radio className="size-2.5 animate-pulse" />
                    Live
                  </span>
                )}
              </div>
              <h1 className="text-lg font-black text-zinc-100">
                {details.teamA.name} <span className="text-zinc-500">vs</span> {details.teamB.name}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/matches/${matchId}`}
              target="_blank"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 text-xs font-bold text-zinc-300 transition-colors"
            >
              <span>View Public Match Center</span>
              <ExternalLink className="size-3.5" />
            </Link>
          </div>
        </div>

        {/* Initial Setup if opening players need selection */}
        {needsOpeningSetup && details.match.status !== 'completed' && (
          <ScorerSetupPanel details={details} />
        )}

        {/* Scoring Keypad (when match is ready) */}
        {!needsOpeningSetup && details.match.status !== 'completed' && (
          <ScoreKeypad details={details} />
        )}

        {/* Full Live Scoreboard */}
        <div className="pt-4 border-t border-zinc-800">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-4">
            Authoritative Match Scorecard
          </h3>
          <MatchScoreboard details={details} />
        </div>
      </div>
    </DashboardShell>
  );
}
