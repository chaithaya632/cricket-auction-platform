import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMatchFullDetails } from '@/lib/matches/queries';
import { MatchScoreboard } from '@/components/match/match-scoreboard';
import { YouTubePlayer } from '@/components/match/youtube-player';
import { MatchRealtimeSync } from '@/components/match/match-realtime-sync';
import { ChevronLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface MatchPageProps {
  params: Promise<{
    matchId: string;
  }>;
}

export default async function MatchDetailPage({ params }: MatchPageProps) {
  const { matchId } = await params;
  const supabase = await createClient();
  const details = await getMatchFullDetails(supabase, matchId);

  if (!details) {
    notFound();
  }

  const isLive = details.match.status === 'live' || details.match.status === 'toss' || details.match.status === 'innings_break';

  return (
    <main className="min-h-screen bg-black text-zinc-100 py-8 px-4 sm:px-6 lg:px-8">
      {/* Realtime Broadcast Client Listener */}
      <MatchRealtimeSync matchId={matchId} />

      <div className="max-w-6xl mx-auto space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link
            href="/matches"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            <ChevronLeft className="size-4" />
            <span>All Matches</span>
          </Link>
        </div>

        {/* Live Video Embed */}
        <YouTubePlayer
          videoId={details.match.youtube_video_id}
          title={`${details.teamA.name} vs ${details.teamB.name} - Live Stream`}
          isLive={isLive}
        />

        {/* Live Scoreboard & Scorecard */}
        <MatchScoreboard details={details} />
      </div>
    </main>
  );
}
