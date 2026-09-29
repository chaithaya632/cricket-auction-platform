'use client';

// =============================================================================
// ACC Match System — Scorer Initial Setup Panel
// =============================================================================
// Displayed when match toss, innings 1, or innings 2 opening players need selection.
// =============================================================================

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Play, AlertCircle, Users, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { startMatchAction, startInningsAction } from '@/lib/matches/actions';
import type { MatchDetails } from '@/lib/matches/types';

interface ScorerSetupPanelProps {
  details: MatchDetails;
}

export function ScorerSetupPanel({ details }: ScorerSetupPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const { match, activeInnings } = details;
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Setup form states
  const targetInningsNumber = match.current_innings_number || 1;
  const battingTeamId =
    targetInningsNumber === 1
      ? activeInnings?.innings.batting_team_id || match.team_a_id
      : activeInnings?.innings.batting_team_id || match.team_b_id;

  const battingXI =
    battingTeamId === details.teamA.id ? details.teamAPlayingXI : details.teamBPlayingXI;
  const bowlingXI =
    battingTeamId === details.teamA.id ? details.teamBPlayingXI : details.teamAPlayingXI;

  const [strikerId, setStrikerId] = useState(battingXI[0]?.playerRegistrationId || '');
  const [nonStrikerId, setNonStrikerId] = useState(battingXI[1]?.playerRegistrationId || '');
  const [bowlerId, setBowlerId] = useState(bowlingXI[0]?.playerRegistrationId || '');

  const handleStartInnings = () => {
    if (isPending) return;
    setErrorMsg(null);

    if (!strikerId || !nonStrikerId || !bowlerId) {
      setErrorMsg('Please select Striker, Non-Striker, and Opening Bowler.');
      return;
    }
    if (strikerId === nonStrikerId) {
      setErrorMsg('Striker and Non-Striker must be different players.');
      return;
    }

    startTransition(async () => {
      // If match is not live yet, start it
      if (match.status !== 'live') {
        const startRes = await startMatchAction(match.id);
        if (!startRes.success) {
          setErrorMsg(startRes.error || 'Failed to start match.');
          return;
        }
      }

      const res = await startInningsAction({
        matchId: match.id,
        inningsNumber: targetInningsNumber as 1 | 2,
        strikerId,
        nonStrikerId,
        bowlerId,
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Failed to start innings.');
      } else {
        router.refresh();
      }
    });
  };

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-6 shadow-2xl backdrop-blur-xl space-y-4">
      <div className="flex items-center gap-2 pb-3 border-b border-zinc-800">
        <Users className="size-5 text-amber-400" />
        <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">
          Innings {targetInningsNumber} Setup: Opening Players
        </h3>
      </div>

      {errorMsg && (
        <div className="rounded-xl bg-red-950/80 border border-red-800/80 p-3 text-xs text-red-200 flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0 text-red-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div>
          <label className="block text-zinc-400 font-bold mb-1.5 uppercase">Opening Striker (*)</label>
          <select
            value={strikerId}
            onChange={(e) => setStrikerId(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-2.5 text-zinc-100 font-semibold"
          >
            {battingXI.map((p) => (
              <option key={p.playerRegistrationId} value={p.playerRegistrationId}>
                {p.playerName} {p.isCaptain ? '(C)' : ''} {p.isWicketKeeper ? '(WK)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-zinc-400 font-bold mb-1.5 uppercase">Non-Striker</label>
          <select
            value={nonStrikerId}
            onChange={(e) => setNonStrikerId(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-2.5 text-zinc-100 font-semibold"
          >
            {battingXI.map((p) => (
              <option key={p.playerRegistrationId} value={p.playerRegistrationId}>
                {p.playerName} {p.isCaptain ? '(C)' : ''} {p.isWicketKeeper ? '(WK)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-zinc-400 font-bold mb-1.5 uppercase">Opening Bowler</label>
          <select
            value={bowlerId}
            onChange={(e) => setBowlerId(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-2.5 text-zinc-100 font-semibold"
          >
            {bowlingXI.map((p) => (
              <option key={p.playerRegistrationId} value={p.playerRegistrationId}>
                {p.playerName} ({p.bowlingStyle || 'Bowler'})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="pt-3 border-t border-zinc-800 flex justify-end">
        <Button
          disabled={isPending || battingXI.length === 0 || bowlingXI.length === 0}
          onClick={handleStartInnings}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold gap-2 text-xs"
        >
          <Play className="size-4" />
          Start Innings & Begin Scoring
        </Button>
      </div>
    </div>
  );
}
