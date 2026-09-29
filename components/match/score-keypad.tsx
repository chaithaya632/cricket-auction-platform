'use client';

// =============================================================================
// ACC Match System — Tablet/Laptop Scorer Console Keypad
// =============================================================================

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Users,
  ShieldAlert,
  Loader2,
  Check,
} from 'lucide-react';
import type { MatchDetails, ExtrasType, WicketType } from '@/lib/matches/types';
import { recordDeliveryAction, undoLatestDeliveryAction } from '@/lib/matches/actions';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface ScoreKeypadProps {
  details: MatchDetails;
}

export function ScoreKeypad({ details }: ScoreKeypadProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const { match, activeInnings, currentStriker, currentNonStriker, currentBowler } = details;

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Wicket Modal state
  const [showWicketModal, setShowWicketModal] = useState(false);
  const [wicketType, setWicketType] = useState<WicketType>('bowled');
  const [dismissedPlayerId, setDismissedPlayerId] = useState<string>(
    currentStriker?.registrationId || ''
  );
  const [incomingBatterId, setIncomingBatterId] = useState<string>('');

  // Undo confirmation state
  const [showUndoModal, setShowUndoModal] = useState(false);
  const [undoReason, setUndoReason] = useState<string>('Scorer correction');

  if (!activeInnings) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 text-center text-zinc-400">
        No active innings in progress. Please start an innings first.
      </div>
    );
  }

  // Calculate remaining eligible batters from Playing XI who haven't batted yet
  const battingPlayingXI =
    activeInnings.innings.batting_team_id === details.teamA.id
      ? details.teamAPlayingXI
      : details.teamBPlayingXI;

  const outPlayerIds = new Set(
    activeInnings.batters.filter((b) => b.isOut).map((b) => b.registrationId)
  );
  const onCreaseIds = new Set(
    [currentStriker?.registrationId, currentNonStriker?.registrationId].filter(Boolean) as string[]
  );

  const availableIncomingBatters = battingPlayingXI.filter(
    (p) => !outPlayerIds.has(p.playerRegistrationId) && !onCreaseIds.has(p.playerRegistrationId)
  );

  // Compute next expected delivery sequence
  const latestDelivery = activeInnings.recentDeliveries[0];
  const nextSequence = (latestDelivery?.delivery_sequence || 0) + 1;
  const currentLegalBalls = activeInnings.innings.total_legal_balls;
  const currentOverNumber = Math.floor(currentLegalBalls / 6);
  const currentBallNumber = (currentLegalBalls % 6) + 1;

  // Handle single ball submission
  const handleScoreBall = (
    runsBatter: number,
    extrasType: ExtrasType = 'none',
    extrasRuns: number = 0,
    isWicket: boolean = false,
    wType?: WicketType,
    dPlayerId?: string,
    inBatterId?: string
  ) => {
    if (isPending) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!currentStriker || !currentNonStriker || !currentBowler) {
      setErrorMsg('Please ensure striker, non-striker, and bowler are selected.');
      return;
    }

    // Generate genuine client-side submission UUID for idempotency
    const submissionId = crypto.randomUUID();

    startTransition(async () => {
      const res = await recordDeliveryAction({
        matchId: match.id,
        inningsId: activeInnings.innings.id,
        submissionId,
        expectedSequence: nextSequence,
        overNumber: currentOverNumber,
        ballNumber: currentBallNumber,
        strikerId: currentStriker.registrationId,
        nonStrikerId: currentNonStriker.registrationId,
        bowlerId: currentBowler.registrationId,
        runsBatter,
        extrasType,
        extrasRuns,
        isWicket,
        wicketType: wType || null,
        dismissedPlayerId: dPlayerId || null,
        incomingBatterId: inBatterId || null,
      });

      if (!res.success) {
        if (res.code === 'STALE_MATCH_STATE' || res.error?.includes('already been updated')) {
          setErrorMsg('The match state has already been updated. The scorecard has been refreshed.');
          router.refresh();
        } else {
          setErrorMsg(res.error || 'Failed to record delivery.');
        }
      } else {
        setSuccessMsg(
          isWicket
            ? 'WICKET recorded successfully!'
            : `${runsBatter + extrasRuns} runs recorded.`
        );
        setShowWicketModal(false);
      }
    });
  };

  // Handle Undo Latest Delivery
  const handleUndoLatest = () => {
    if (isPending) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    startTransition(async () => {
      const res = await undoLatestDeliveryAction({
        matchId: match.id,
        inningsId: activeInnings.innings.id,
        reason: undoReason,
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Failed to undo delivery.');
      } else {
        setSuccessMsg('Latest delivery undone and scorecard updated.');
        setShowUndoModal(false);
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* 1. SCORER HEADS-UP DISPLAY */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-5 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-zinc-800">
          <div>
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Innings {activeInnings.innings.innings_number} • {activeInnings.battingTeamName} Batting
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-4xl font-black text-zinc-100 tracking-tight">
                {activeInnings.innings.total_runs}/{activeInnings.innings.total_wickets}
              </span>
              <span className="text-lg text-zinc-400 font-bold">({activeInnings.oversDisplay} ov)</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowUndoModal(true)}
              disabled={isPending || activeInnings.recentDeliveries.length === 0}
              className="text-xs border-amber-500/30 text-amber-400 hover:bg-amber-500/10 gap-1.5"
            >
              <RotateCcw className="size-3.5" />
              Undo Last Ball
            </Button>
          </div>
        </div>

        {/* Current Players on Pitch */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 text-xs">
          <div className="p-3 rounded-xl bg-zinc-800/40 border border-zinc-800 flex items-center justify-between">
            <span className="text-zinc-400">Striker (*):</span>
            <span className="font-bold text-zinc-100">
              {currentStriker ? `${currentStriker.playerName} (${currentStriker.runs})` : 'Not Selected'}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-zinc-800/40 border border-zinc-800 flex items-center justify-between">
            <span className="text-zinc-400">Non-Striker:</span>
            <span className="font-bold text-zinc-100">
              {currentNonStriker ? `${currentNonStriker.playerName} (${currentNonStriker.runs})` : 'Not Selected'}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-zinc-800/40 border border-zinc-800 flex items-center justify-between">
            <span className="text-zinc-400">Bowler:</span>
            <span className="font-bold text-zinc-100">
              {currentBowler ? `${currentBowler.playerName} (${currentBowler.wickets}/${currentBowler.runsConceded})` : 'Not Selected'}
            </span>
          </div>
        </div>

        {/* Current Over Badges */}
        <div className="mt-4 pt-3 border-t border-zinc-800/60 flex items-center gap-2 text-xs">
          <span className="text-zinc-400 font-bold">This Over:</span>
          <div className="flex items-center gap-1.5">
            {activeInnings.currentOverDeliveries.map((b, idx) => (
              <span
                key={`${b.id}-${idx}`}
                className="size-7 rounded-full bg-zinc-800 border border-zinc-700 font-black text-xs flex items-center justify-center text-zinc-200"
              >
                {b.display}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Feedback Messages */}
      {errorMsg && (
        <div className="rounded-xl bg-red-950/80 border border-red-800/80 p-4 text-xs text-red-200 flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0 text-red-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="rounded-xl bg-emerald-950/80 border border-emerald-800/80 p-4 text-xs text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* 2. LARGE SCORING KEYPAD */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-6 shadow-2xl">
        <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-4">
          Record Delivery
        </h4>

        {/* Runs Row */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-4">
          {[0, 1, 2, 3, 4, 6].map((run) => (
            <button
              key={run}
              type="button"
              disabled={isPending}
              onClick={() => handleScoreBall(run)}
              className={`h-16 rounded-2xl font-black text-2xl flex items-center justify-center shadow-lg transition-all active:scale-95 disabled:opacity-50 ${
                run === 4
                  ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40'
                  : run === 6
                  ? 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40'
                  : 'bg-zinc-800 hover:bg-zinc-700/80 text-zinc-100 border border-zinc-700/80'
              }`}
            >
              {run}
            </button>
          ))}
        </div>

        {/* Extras & Wicket Row */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleScoreBall(0, 'wide', 1)}
            className="h-14 rounded-xl bg-blue-950/50 hover:bg-blue-900/50 text-blue-300 border border-blue-800/60 font-black text-sm flex items-center justify-center transition-all active:scale-95 disabled:opacity-50"
          >
            Wide (+1)
          </button>

          <button
            type="button"
            disabled={isPending}
            onClick={() => handleScoreBall(0, 'no_ball', 1)}
            className="h-14 rounded-xl bg-blue-950/50 hover:bg-blue-900/50 text-blue-300 border border-blue-800/60 font-black text-sm flex items-center justify-center transition-all active:scale-95 disabled:opacity-50"
          >
            No Ball (+1)
          </button>

          <button
            type="button"
            disabled={isPending}
            onClick={() => handleScoreBall(0, 'bye', 1)}
            className="h-14 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 font-bold text-sm flex items-center justify-center transition-all active:scale-95 disabled:opacity-50"
          >
            Bye (1B)
          </button>

          <button
            type="button"
            disabled={isPending}
            onClick={() => handleScoreBall(0, 'leg_bye', 1)}
            className="h-14 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 font-bold text-sm flex items-center justify-center transition-all active:scale-95 disabled:opacity-50"
          >
            Leg Bye (1Lb)
          </button>

          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              setDismissedPlayerId(currentStriker?.registrationId || '');
              setIncomingBatterId(availableIncomingBatters[0]?.playerRegistrationId || '');
              setShowWicketModal(true);
            }}
            className="h-14 rounded-xl col-span-2 sm:col-span-1 bg-red-600 hover:bg-red-500 text-white font-black text-base flex items-center justify-center shadow-lg shadow-red-950/50 transition-all active:scale-95 disabled:opacity-50"
          >
            WICKET
          </button>
        </div>
      </div>

      {/* 3. WICKET DISMISSAL MODAL */}
      <Dialog open={showWicketModal} onOpenChange={setShowWicketModal}>
        <DialogContent className="sm:max-w-md bg-zinc-950 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle className="text-base font-bold uppercase tracking-wider text-red-400">
              Record Wicket Dismissal
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            {/* Dismissal Type */}
            <div>
              <label className="block text-zinc-400 font-bold mb-1.5 uppercase">Dismissal Type</label>
              <select
                value={wicketType}
                onChange={(e) => setWicketType(e.target.value as WicketType)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-2.5 text-zinc-100 font-semibold focus:outline-none focus:border-red-500"
              >
                <option value="bowled">Bowled</option>
                <option value="caught">Caught</option>
                <option value="lbw">LBW</option>
                <option value="stumped">Stumped</option>
                <option value="run_out">Run Out</option>
                <option value="hit_wicket">Hit Wicket</option>
              </select>
            </div>

            {/* Dismissed Batter (Selectable for run out) */}
            <div>
              <label className="block text-zinc-400 font-bold mb-1.5 uppercase">Dismissed Batter</label>
              <select
                value={dismissedPlayerId}
                onChange={(e) => setDismissedPlayerId(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-2.5 text-zinc-100 font-semibold focus:outline-none focus:border-red-500"
              >
                {currentStriker && (
                  <option value={currentStriker.registrationId}>
                    {currentStriker.playerName} (Striker)
                  </option>
                )}
                {currentNonStriker && (
                  <option value={currentNonStriker.registrationId}>
                    {currentNonStriker.playerName} (Non-Striker)
                  </option>
                )}
              </select>
            </div>

            {/* Incoming Batter Selection */}
            {availableIncomingBatters.length > 0 && (
              <div>
                <label className="block text-zinc-400 font-bold mb-1.5 uppercase">Incoming Batter</label>
                <select
                  value={incomingBatterId}
                  onChange={(e) => setIncomingBatterId(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-2.5 text-zinc-100 font-semibold focus:outline-none focus:border-red-500"
                >
                  <option value="">Select next batter...</option>
                  {availableIncomingBatters.map((p) => (
                    <option key={p.playerRegistrationId} value={p.playerRegistrationId}>
                      {p.playerName} ({p.playerType || 'Player'})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowWicketModal(false)}
              className="border-zinc-800 text-zinc-400"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={isPending}
              onClick={() =>
                handleScoreBall(
                  0,
                  'none',
                  0,
                  true,
                  wicketType,
                  dismissedPlayerId,
                  incomingBatterId || undefined
                )
              }
              className="bg-red-600 hover:bg-red-500 text-white font-bold"
            >
              Confirm Wicket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 4. UNDO CONFIRMATION MODAL */}
      <Dialog open={showUndoModal} onOpenChange={setShowUndoModal}>
        <DialogContent className="sm:max-w-md bg-zinc-950 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle className="text-base font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
              <RotateCcw className="size-4" />
              Undo Latest Delivery
            </DialogTitle>
          </DialogHeader>

          <p className="text-xs text-zinc-300">
            This will mark the latest delivery as reversed, restore the previous ball count and score,
            and keep an immutable audit trail.
          </p>

          <DialogFooter className="gap-2 sm:gap-0 mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowUndoModal(false)}
              className="border-zinc-800 text-zinc-400"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={isPending}
              onClick={handleUndoLatest}
              className="bg-amber-600 hover:bg-amber-500 text-white font-bold"
            >
              Confirm Reversal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
