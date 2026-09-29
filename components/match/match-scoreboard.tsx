'use client';

// =============================================================================
// ACC Match System — Live Scoreboard & Scorecard Presentation
// =============================================================================

import React, { useState } from 'react';
import Image from 'next/image';
import type { MatchDetails, InningsScorecard } from '@/lib/matches/types';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface MatchScoreboardProps {
  details: MatchDetails;
}

export function MatchScoreboard({ details }: MatchScoreboardProps) {
  const { match, teamA, teamB, innings1, innings2, activeInnings, currentStriker, currentNonStriker, currentBowler } = details;

  const [activeTab, setActiveTab] = useState<'live' | 'scorecard' | 'teams'>('live');
  const [scorecardInnings, setScorecardInnings] = useState<'inn1' | 'inn2'>('inn1');

  const isLive = match.status === 'live' || match.status === 'toss' || match.status === 'innings_break';

  return (
    <div className="space-y-6">
      {/* 1. HERO MATCH SCORE HEADER */}
      <div className="rounded-3xl border border-zinc-800 bg-gradient-to-b from-zinc-900/90 to-zinc-950/90 p-6 md:p-8 shadow-2xl backdrop-blur-xl">
        {/* Status & Toss Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-5 mb-6 border-b border-zinc-800/80">
          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                isLive
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse'
                  : match.status === 'completed'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
              }`}
            >
              {match.status.replace('_', ' ')}
            </span>
            <span className="text-xs text-zinc-400 font-semibold">• T20 • {match.venue || 'ACC Stadium'}</span>
          </div>

          {match.result_summary ? (
            <span className="text-xs font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-3 py-1 rounded-full">
              {match.result_summary}
            </span>
          ) : match.toss_winner_id ? (
            <span className="text-xs text-zinc-400 font-medium">
              Toss:{' '}
              <strong className="text-zinc-200">
                {match.toss_winner_id === teamA.id ? teamA.name : teamB.name}
              </strong>{' '}
              opted to <strong className="text-zinc-200">{match.toss_decision}</strong> first
            </span>
          ) : null}
        </div>

        {/* Live Innings Score Display */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          {/* Team A */}
          <div
            className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${
              activeInnings?.innings.batting_team_id === teamA.id
                ? 'bg-zinc-800/60 border-zinc-700 shadow-md'
                : 'bg-zinc-900/40 border-zinc-800/60 opacity-80'
            }`}
          >
            <div className="size-14 rounded-2xl bg-zinc-800 border border-zinc-700/80 flex items-center justify-center overflow-hidden shrink-0">
              {teamA.logoUrl ? (
                <Image src={teamA.logoUrl} alt={teamA.name} width={56} height={56} className="object-cover" />
              ) : (
                <span className="font-black text-base text-zinc-300">{teamA.shortName}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-zinc-100 truncate">{teamA.name}</h3>
              <span className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">{teamA.shortName}</span>
            </div>
            <div className="text-right">
              {innings1 && (
                <div className="text-2xl md:text-3xl font-black text-zinc-100 tracking-tight">
                  {innings1.innings.total_runs}
                  <span className="text-lg text-zinc-400 font-semibold">/{innings1.innings.total_wickets}</span>
                </div>
              )}
              {innings1 && (
                <div className="text-xs text-zinc-400 font-medium">{innings1.oversDisplay} ov</div>
              )}
            </div>
          </div>

          {/* Team B */}
          <div
            className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${
              activeInnings?.innings.batting_team_id === teamB.id
                ? 'bg-zinc-800/60 border-zinc-700 shadow-md'
                : 'bg-zinc-900/40 border-zinc-800/60 opacity-80'
            }`}
          >
            <div className="size-14 rounded-2xl bg-zinc-800 border border-zinc-700/80 flex items-center justify-center overflow-hidden shrink-0">
              {teamB.logoUrl ? (
                <Image src={teamB.logoUrl} alt={teamB.name} width={56} height={56} className="object-cover" />
              ) : (
                <span className="font-black text-base text-zinc-300">{teamB.shortName}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-zinc-100 truncate">{teamB.name}</h3>
              <span className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">{teamB.shortName}</span>
            </div>
            <div className="text-right">
              {innings2 ? (
                <>
                  <div className="text-2xl md:text-3xl font-black text-zinc-100 tracking-tight">
                    {innings2.innings.total_runs}
                    <span className="text-lg text-zinc-400 font-semibold">/{innings2.innings.total_wickets}</span>
                  </div>
                  <div className="text-xs text-zinc-400 font-medium">{innings2.oversDisplay} ov</div>
                </>
              ) : (
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Yet to bat</span>
              )}
            </div>
          </div>
        </div>

        {/* Current Rates & Chase Target */}
        {activeInnings && (
          <div className="mt-6 pt-5 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-6">
              <div>
                <span className="text-zinc-500 font-bold uppercase tracking-wider mr-1.5">CRR:</span>
                <span className="text-zinc-200 font-extrabold text-sm">{activeInnings.runRate}</span>
              </div>
              {activeInnings.requiredRunRate !== null && (
                <div>
                  <span className="text-zinc-500 font-bold uppercase tracking-wider mr-1.5">RRR:</span>
                  <span className="text-amber-400 font-extrabold text-sm">{activeInnings.requiredRunRate}</span>
                </div>
              )}
              {activeInnings.innings.target_runs && (
                <div>
                  <span className="text-zinc-500 font-bold uppercase tracking-wider mr-1.5">Target:</span>
                  <span className="text-emerald-400 font-extrabold text-sm">{activeInnings.innings.target_runs}</span>
                </div>
              )}
            </div>

            {/* Current Over Delivery Badges */}
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-500 font-bold uppercase tracking-wider mr-1">Over:</span>
              {activeInnings.currentOverDeliveries.length > 0 ? (
                activeInnings.currentOverDeliveries.map((badge, idx) => (
                  <span
                    key={`${badge.id}-${idx}`}
                    className={`size-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                      badge.isWicket
                        ? 'bg-red-500 text-white'
                        : badge.runs === 4
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : badge.runs === 6
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                        : badge.isExtra
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                        : 'bg-zinc-800 text-zinc-300 border border-zinc-700/60'
                    }`}
                  >
                    {badge.display}
                  </span>
                ))
              ) : (
                <span className="text-zinc-600 text-xs italic">First ball of over</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 2. ON-CREASE BATTERS & CURRENT BOWLER */}
      {isLive && activeInnings && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Batters on Crease */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-xl">
            <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">Batters on Crease</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-500 px-3 pb-1 border-b border-zinc-800/60">
                <span>Batter</span>
                <div className="flex items-center gap-6">
                  <span className="w-8 text-right">R</span>
                  <span className="w-8 text-right">B</span>
                  <span className="w-8 text-right">4s</span>
                  <span className="w-8 text-right">6s</span>
                  <span className="w-12 text-right">SR</span>
                </div>
              </div>

              {[currentStriker, currentNonStriker].filter(Boolean).map((batter, idx) => (
                <div
                  key={batter!.registrationId}
                  className="flex items-center justify-between text-xs px-3 py-2 rounded-xl bg-zinc-800/40 border border-zinc-800/60"
                >
                  <div className="flex items-center gap-1.5 font-bold text-zinc-100 truncate">
                    <span>{batter!.playerName}</span>
                    {batter!.isStriker && <span className="text-amber-400 font-black">*</span>}
                  </div>
                  <div className="flex items-center gap-6 font-semibold text-zinc-300">
                    <span className="w-8 text-right font-black text-zinc-100">{batter!.runs}</span>
                    <span className="w-8 text-right text-zinc-400">{batter!.balls}</span>
                    <span className="w-8 text-right text-zinc-400">{batter!.fours}</span>
                    <span className="w-8 text-right text-zinc-400">{batter!.sixes}</span>
                    <span className="w-12 text-right text-zinc-300">{batter!.strikeRate}</span>
                  </div>
                </div>
              ))}

              {!currentStriker && !currentNonStriker && (
                <div className="text-xs text-zinc-500 italic p-3 text-center">Batters yet to be selected</div>
              )}
            </div>
          </div>

          {/* Current Bowler */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-xl">
            <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">Current Bowler</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-500 px-3 pb-1 border-b border-zinc-800/60">
                <span>Bowler</span>
                <div className="flex items-center gap-6">
                  <span className="w-8 text-right">O</span>
                  <span className="w-8 text-right">M</span>
                  <span className="w-8 text-right">R</span>
                  <span className="w-8 text-right">W</span>
                  <span className="w-12 text-right">Econ</span>
                </div>
              </div>

              {currentBowler ? (
                <div className="flex items-center justify-between text-xs px-3 py-2 rounded-xl bg-zinc-800/40 border border-zinc-800/60">
                  <span className="font-bold text-zinc-100 truncate">{currentBowler.playerName}</span>
                  <div className="flex items-center gap-6 font-semibold text-zinc-300">
                    <span className="w-8 text-right text-zinc-400">{currentBowler.overs}</span>
                    <span className="w-8 text-right text-zinc-400">{currentBowler.maidens}</span>
                    <span className="w-8 text-right text-zinc-400">{currentBowler.runsConceded}</span>
                    <span className="w-8 text-right font-black text-red-400">{currentBowler.wickets}</span>
                    <span className="w-12 text-right text-zinc-300">{currentBowler.economy}</span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-zinc-500 italic p-3 text-center">Bowler yet to be selected</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. SCORECARD TABS */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-xl">
        <Tabs defaultValue="inn1" onValueChange={(v) => setScorecardInnings(v as any)}>
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-800">
            <h3 className="text-sm font-bold text-zinc-200 uppercase tracking-wider">Full Scorecard</h3>
            <TabsList className="bg-zinc-800 border border-zinc-700/80">
              <TabsTrigger value="inn1" className="text-xs">
                Innings 1 ({innings1?.battingTeamShortName || 'Team A'})
              </TabsTrigger>
              <TabsTrigger value="inn2" className="text-xs" disabled={!innings2}>
                Innings 2 ({innings2?.battingTeamShortName || 'Team B'})
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="inn1">
            {innings1 ? (
              <ScorecardInningsView inningsScorecard={innings1} />
            ) : (
              <div className="p-8 text-center text-xs text-zinc-500">Innings 1 has not started yet.</div>
            )}
          </TabsContent>

          <TabsContent value="inn2">
            {innings2 ? (
              <ScorecardInningsView inningsScorecard={innings2} />
            ) : (
              <div className="p-8 text-center text-xs text-zinc-500">Innings 2 has not started yet.</div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function ScorecardInningsView({ inningsScorecard }: { inningsScorecard: InningsScorecard }) {
  return (
    <div className="space-y-6">
      {/* Batting Scorecard */}
      <div>
        <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Batting</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-[11px] font-bold text-zinc-400 uppercase">
                <th className="py-2.5 px-3">Batter</th>
                <th className="py-2.5 px-3">Dismissal</th>
                <th className="py-2.5 px-3 text-right">R</th>
                <th className="py-2.5 px-3 text-right">B</th>
                <th className="py-2.5 px-3 text-right">4s</th>
                <th className="py-2.5 px-3 text-right">6s</th>
                <th className="py-2.5 px-3 text-right">SR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {inningsScorecard.batters.map((b) => (
                <tr key={b.registrationId} className="hover:bg-zinc-800/30">
                  <td className="py-2.5 px-3 font-bold text-zinc-200">
                    {b.playerName} {b.isOnCrease && <span className="text-amber-400">*</span>}
                  </td>
                  <td className="py-2.5 px-3 text-zinc-400 text-[11px]">
                    {b.isOut ? b.dismissalText || 'out' : b.isOnCrease ? 'not out' : ''}
                  </td>
                  <td className="py-2.5 px-3 text-right font-black text-zinc-100">{b.runs}</td>
                  <td className="py-2.5 px-3 text-right text-zinc-400">{b.balls}</td>
                  <td className="py-2.5 px-3 text-right text-zinc-400">{b.fours}</td>
                  <td className="py-2.5 px-3 text-right text-zinc-400">{b.sixes}</td>
                  <td className="py-2.5 px-3 text-right text-zinc-300 font-semibold">{b.strikeRate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Extras Summary */}
        <div className="mt-3 p-3 rounded-xl bg-zinc-800/40 border border-zinc-800/60 flex items-center justify-between text-xs text-zinc-400">
          <span>
            <strong>Extras:</strong> {inningsScorecard.extras.total} (b {inningsScorecard.extras.byes}, lb{' '}
            {inningsScorecard.extras.legByes}, w {inningsScorecard.extras.wides}, nb{' '}
            {inningsScorecard.extras.noBalls})
          </span>
          <span className="font-bold text-zinc-200">
            Total: {inningsScorecard.innings.total_runs}/{inningsScorecard.innings.total_wickets} (
            {inningsScorecard.oversDisplay} ov)
          </span>
        </div>
      </div>

      {/* Bowling Scorecard */}
      <div>
        <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Bowling</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-[11px] font-bold text-zinc-400 uppercase">
                <th className="py-2.5 px-3">Bowler</th>
                <th className="py-2.5 px-3 text-right">O</th>
                <th className="py-2.5 px-3 text-right">M</th>
                <th className="py-2.5 px-3 text-right">R</th>
                <th className="py-2.5 px-3 text-right">W</th>
                <th className="py-2.5 px-3 text-right">Econ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {inningsScorecard.bowlers.map((bowl) => (
                <tr key={bowl.registrationId} className="hover:bg-zinc-800/30">
                  <td className="py-2.5 px-3 font-bold text-zinc-200">{bowl.playerName}</td>
                  <td className="py-2.5 px-3 text-right text-zinc-400">{bowl.overs}</td>
                  <td className="py-2.5 px-3 text-right text-zinc-400">{bowl.maidens}</td>
                  <td className="py-2.5 px-3 text-right text-zinc-400">{bowl.runsConceded}</td>
                  <td className="py-2.5 px-3 text-right font-black text-red-400">{bowl.wickets}</td>
                  <td className="py-2.5 px-3 text-right text-zinc-300 font-semibold">{bowl.economy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Fall of Wickets */}
      {inningsScorecard.fallOfWickets.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Fall of Wickets</h4>
          <div className="p-3 rounded-xl bg-zinc-800/40 border border-zinc-800/60 text-xs text-zinc-300 flex flex-wrap gap-x-4 gap-y-1">
            {inningsScorecard.fallOfWickets.map((fow) => (
              <span key={fow.wicketNumber}>
                <strong>
                  {fow.runs}-{fow.wicketNumber}
                </strong>{' '}
                ({fow.playerName}, {fow.overs} ov)
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
