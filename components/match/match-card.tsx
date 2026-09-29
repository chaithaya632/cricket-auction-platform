import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Calendar, MapPin, Radio, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import type { DbMatch } from '@/lib/matches/types';

interface MatchCardProps {
  match: DbMatch & {
    teamA: { id: string; name: string; short_name: string; logo_url: string | null; color_primary: string | null };
    teamB: { id: string; name: string; short_name: string; logo_url: string | null; color_primary: string | null };
  };
  inningsSummary?: {
    teamAScore?: string;
    teamBScore?: string;
  };
}

export function MatchCard({ match, inningsSummary }: MatchCardProps) {
  const isLive = match.status === 'live' || match.status === 'toss' || match.status === 'innings_break';
  const isCompleted = match.status === 'completed';

  return (
    <Link
      href={`/matches/${match.id}`}
      className={`group block rounded-2xl border p-5 transition-all shadow-lg hover:shadow-xl ${
        isLive
          ? 'bg-zinc-900/90 border-red-500/40 hover:border-red-500'
          : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700'
      }`}
    >
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-800/80">
        <div className="flex items-center gap-2">
          {isLive ? (
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/30">
              <Radio className="size-3 animate-pulse" />
              Live
            </span>
          ) : isCompleted ? (
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              Completed
            </span>
          ) : (
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/30">
              Upcoming
            </span>
          )}
          <span className="text-xs text-zinc-400 font-medium">T20 • Max {match.max_overs} ov</span>
        </div>

        {match.scheduled_at && (
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <Calendar className="size-3.5" />
            <span>{format(new Date(match.scheduled_at), 'dd MMM, hh:mm a')}</span>
          </div>
        )}
      </div>

      {/* Teams and Scores */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-center">
        {/* Team A */}
        <div className="md:col-span-2 flex items-center gap-3">
          <div className="size-11 rounded-xl bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center overflow-hidden shrink-0">
            {match.teamA.logo_url ? (
              <Image src={match.teamA.logo_url} alt={match.teamA.name} width={44} height={44} className="object-cover" />
            ) : (
              <span className="font-black text-sm text-zinc-300">{match.teamA.short_name}</span>
            )}
          </div>
          <div className="min-w-0">
            <h4 className="font-bold text-zinc-100 truncate text-sm">{match.teamA.name}</h4>
            <span className="text-xs text-zinc-400 font-semibold">{match.teamA.short_name}</span>
          </div>
          {inningsSummary?.teamAScore && (
            <div className="ml-auto text-sm font-black text-zinc-100">{inningsSummary.teamAScore}</div>
          )}
        </div>

        {/* VS Divider */}
        <div className="md:col-span-1 text-center font-black text-xs text-zinc-500 uppercase tracking-widest">
          VS
        </div>

        {/* Team B */}
        <div className="md:col-span-2 flex items-center justify-end md:flex-row-reverse gap-3">
          <div className="size-11 rounded-xl bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center overflow-hidden shrink-0">
            {match.teamB.logo_url ? (
              <Image src={match.teamB.logo_url} alt={match.teamB.name} width={44} height={44} className="object-cover" />
            ) : (
              <span className="font-black text-sm text-zinc-300">{match.teamB.short_name}</span>
            )}
          </div>
          <div className="min-w-0 text-left md:text-right">
            <h4 className="font-bold text-zinc-100 truncate text-sm">{match.teamB.name}</h4>
            <span className="text-xs text-zinc-400 font-semibold">{match.teamB.short_name}</span>
          </div>
          {inningsSummary?.teamBScore && (
            <div className="mr-auto md:mr-0 md:ml-auto text-sm font-black text-zinc-100">{inningsSummary.teamBScore}</div>
          )}
        </div>
      </div>

      {/* Match Result or Venue Footer */}
      <div className="mt-4 pt-3 border-t border-zinc-800/60 flex items-center justify-between text-xs text-zinc-400">
        <div className="flex items-center gap-1.5 truncate">
          {match.venue && (
            <>
              <MapPin className="size-3.5 shrink-0 text-zinc-500" />
              <span className="truncate">{match.venue}</span>
            </>
          )}
          {match.result_summary && (
            <span className="font-semibold text-emerald-400 ml-2">
              • {match.result_summary}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-zinc-400 group-hover:text-zinc-100 font-semibold transition-colors shrink-0">
          <span>Match Center</span>
          <ChevronRight className="size-4" />
        </div>
      </div>
    </Link>
  );
}
