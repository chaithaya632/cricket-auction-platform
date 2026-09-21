'use client';

// =============================================================================
// ACC Auction Portal — Career Statistics Form Dialog
// =============================================================================

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  savePlayerCareerStatsAction,
  adminSavePlayerCareerStatsAction,
} from '@/lib/players/actions';
import type { PlayerCareerStats } from '@/lib/players/types';
import { X, Trophy, Loader2 } from 'lucide-react';

interface CareerStatsDialogProps {
  registrationId: string;
  initialStats?: PlayerCareerStats;
  isAdmin?: boolean;
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (stats: PlayerCareerStats) => void;
}

export function CareerStatsDialog({
  registrationId,
  initialStats,
  isAdmin = false,
  isOpen,
  onClose,
  onSaved,
}: CareerStatsDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [matches, setMatches] = useState<number | string>(initialStats?.matches ?? 0);
  const [runs, setRuns] = useState<number | string>(initialStats?.runs ?? 0);
  const [battingAvg, setBattingAvg] = useState<number | string>(initialStats?.battingAvg ?? 0);
  const [strikeRate, setStrikeRate] = useState<number | string>(initialStats?.strikeRate ?? 0);
  const [highestScore, setHighestScore] = useState<number | string>(initialStats?.highestScore ?? 0);
  const [wickets, setWickets] = useState<number | string>(initialStats?.wickets ?? 0);
  const [bowlingAvg, setBowlingAvg] = useState<number | string>(initialStats?.bowlingAvg ?? 0);
  const [economy, setEconomy] = useState<number | string>(initialStats?.economy ?? 0);
  const [catches, setCatches] = useState<number | string>(initialStats?.catches ?? 0);
  const [stumpings, setStumpings] = useState<number | string>(initialStats?.stumpings ?? 0);
  const [notes, setNotes] = useState<string>(initialStats?.notes ?? '');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const statsPayload: PlayerCareerStats = {
      matches: Math.max(0, Number(matches) || 0),
      runs: Math.max(0, Number(runs) || 0),
      battingAvg: Math.max(0, Number(battingAvg) || 0),
      strikeRate: Math.max(0, Number(strikeRate) || 0),
      highestScore: Math.max(0, Number(highestScore) || 0),
      wickets: Math.max(0, Number(wickets) || 0),
      bowlingAvg: Math.max(0, Number(bowlingAvg) || 0),
      economy: Math.max(0, Number(economy) || 0),
      catches: Math.max(0, Number(catches) || 0),
      stumpings: Math.max(0, Number(stumpings) || 0),
      notes: notes.trim(),
    };

    startTransition(async () => {
      const res = isAdmin
        ? await adminSavePlayerCareerStatsAction(registrationId, statsPayload)
        : await savePlayerCareerStatsAction(registrationId, statsPayload);

      if (!res.success) {
        setErrorMsg(res.error || 'Failed to save career statistics.');
      } else {
        setSuccessMsg('Career statistics saved successfully!');
        if (onSaved) onSaved(statsPayload);
        router.refresh();
        setTimeout(() => {
          onClose();
        }, 800);
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl text-zinc-100">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Trophy className="size-5" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight text-zinc-100">
                Update Career Statistics
              </h2>
              <p className="text-xs text-zinc-400">
                Official metrics visible to franchise bidders during the auction
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors cursor-pointer"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Feedback Messages */}
        {errorMsg && (
          <div className="mt-4 rounded-xl bg-red-950/80 border border-red-800/80 p-3.5 text-xs text-red-200">
            <strong>Error:</strong> {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="mt-4 rounded-xl bg-emerald-950/80 border border-emerald-800/80 p-3.5 text-xs text-emerald-200">
            <strong>Success:</strong> {successMsg}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          {/* Batting Metrics */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-2.5">
              Batting Statistics
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  Matches Played
                </label>
                <input
                  type="number"
                  min="0"
                  value={matches}
                  onChange={(e) => setMatches(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  Total Runs
                </label>
                <input
                  type="number"
                  min="0"
                  value={runs}
                  onChange={(e) => setRuns(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  Batting Average
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={battingAvg}
                  onChange={(e) => setBattingAvg(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  Strike Rate
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={strikeRate}
                  onChange={(e) => setStrikeRate(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  Highest Score
                </label>
                <input
                  type="number"
                  min="0"
                  value={highestScore}
                  onChange={(e) => setHighestScore(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Bowling Metrics */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2.5">
              Bowling Statistics
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  Wickets Taken
                </label>
                <input
                  type="number"
                  min="0"
                  value={wickets}
                  onChange={(e) => setWickets(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  Bowling Average
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={bowlingAvg}
                  onChange={(e) => setBowlingAvg(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  Economy Rate
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={economy}
                  onChange={(e) => setEconomy(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Fielding Metrics */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400 mb-2.5">
              Fielding Statistics
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  Catches
                </label>
                <input
                  type="number"
                  min="0"
                  value={catches}
                  onChange={(e) => setCatches(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  Stumpings
                </label>
                <input
                  type="number"
                  min="0"
                  value={stumpings}
                  onChange={(e) => setStumpings(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-sky-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
              Tournament Highlights & Achievements
            </label>
            <textarea
              rows={2}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Man of the Match in 2025 Inter-College Finals, Hat-trick against ECE..."
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-100 focus:border-amber-500 focus:outline-none resize-none"
            />
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-400 px-5 py-2 text-xs font-black text-zinc-950 shadow transition-colors cursor-pointer disabled:opacity-50"
            >
              {isPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Career Stats</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
