import React from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getMatches } from '@/lib/matches/queries';
import { MatchCard } from '@/components/match/match-card';
import { Trophy, Calendar, Radio, CheckCircle2 } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function MatchesPage() {
  const supabase = await createClient();
  const allMatches = await getMatches(supabase);

  const liveMatches = allMatches.filter(
    (m) => m.status === 'live' || m.status === 'toss' || m.status === 'innings_break'
  );
  const upcomingMatches = allMatches.filter((m) => m.status === 'scheduled');
  const completedMatches = allMatches.filter((m) => m.status === 'completed' || m.status === 'abandoned');

  return (
    <main className="min-h-screen bg-black text-zinc-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-10">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-amber-400 mb-1">
              <Trophy className="size-4" />
              ACC Championship Tournament
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-zinc-100 tracking-tight">
              Live Matches & Fixtures
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              Ball-by-ball coverage, live scorecards, and YouTube stream embeds.
            </p>
          </div>
        </div>

        {/* 1. Live Matches Section */}
        {liveMatches.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-red-500 animate-ping" />
              <h2 className="text-sm font-black uppercase tracking-wider text-red-400 flex items-center gap-1.5">
                <Radio className="size-4" />
                Live Now ({liveMatches.length})
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {liveMatches.map((match) => (
                <MatchCard key={match.id} match={match as any} />
              ))}
            </div>
          </section>
        )}

        {/* 2. Upcoming Matches */}
        <section className="space-y-4">
          <h2 className="text-sm font-black uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
            <Calendar className="size-4 text-zinc-500" />
            Upcoming Fixtures ({upcomingMatches.length})
          </h2>
          {upcomingMatches.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {upcomingMatches.map((match) => (
                <MatchCard key={match.id} match={match as any} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-8 text-center text-xs text-zinc-500">
              No upcoming fixtures scheduled yet.
            </div>
          )}
        </section>

        {/* 3. Completed Matches */}
        {completedMatches.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-sm font-black uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
              <CheckCircle2 className="size-4 text-emerald-500" />
              Completed Results ({completedMatches.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {completedMatches.map((match) => (
                <MatchCard key={match.id} match={match as any} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
