'use client';

// =============================================================================
// ACC Auction Portal — Components: Auditorium Projector Control Dock (§26)
// =============================================================================
// Rendered ONLY for authenticated admin/operators.
// Floating, compact, non-intrusive bottom dock providing live floor control:
// - Pause / Resume
// - Sold (Hammer)
// - Mark Unsold
// - Quick Timer Extensions (+10s, +20s, +30s)
// =============================================================================

import React, { useState } from 'react';
import {
  pauseAuctionAction,
  resumeAuctionAction,
  confirmSaleAction,
  markUnsoldAction,
  extendTimerAction,
} from '@/lib/auction/actions';
import { runWithLocalActionTracking } from '@/components/auction/auction-realtime-sync';
import type { AuctionLotWithDetails, AuctionSessionState } from '@/lib/auction/types';
import { Play, Pause, Gavel, XCircle, Clock, Loader2 } from 'lucide-react';

interface ProjectorControlDockProps {
  activeLot: AuctionLotWithDetails | null;
  sessionState: AuctionSessionState;
}

export function ProjectorControlDock({
  activeLot,
  sessionState,
}: ProjectorControlDockProps) {
  const [isPending, setIsPending] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const runDockAction = async (actionFn: () => Promise<{ success: boolean; error?: string }>, successText: string) => {
    if (isPending) return;
    setIsPending(true);
    setActionFeedback(null);
    try {
      const res = await runWithLocalActionTracking(actionFn);
      if (!res.success) {
        setActionFeedback(res.error || 'Action failed');
      } else {
        setActionFeedback(successText);
        setTimeout(() => setActionFeedback(null), 2500);
      }
    } catch (err: any) {
      setActionFeedback(err?.message || 'Action error');
    } finally {
      setIsPending(false);
    }
  };

  const hasBids = Boolean(activeLot?.highest_bidder_franchise_id && activeLot.current_price !== null);
  const isFloorActive = Boolean(activeLot && activeLot.status === 'in_progress');

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center pointer-events-auto">
      {/* Action feedback toast */}
      {actionFeedback && (
        <div className="mb-2 px-3 py-1 rounded-full bg-zinc-900/90 border border-amber-500/40 text-amber-300 text-xs font-bold shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2">
          {actionFeedback}
        </div>
      )}

      {/* Dock Bar */}
      <div className="flex items-center gap-1.5 p-1.5 sm:p-2 rounded-2xl bg-zinc-950/90 border border-zinc-700/60 shadow-2xl backdrop-blur-xl">
        {/* Pause / Resume */}
        {sessionState.isPaused ? (
          <button
            type="button"
            onClick={() => runDockAction(() => resumeAuctionAction(), 'Resumed')}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
            title="Resume Auction"
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4 fill-white" />}
            <span className="hidden sm:inline">Resume</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => runDockAction(() => pauseAuctionAction(), 'Paused')}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 active:scale-95 text-white font-bold text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
            title="Pause Auction"
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Pause className="size-4 fill-white" />}
            <span className="hidden sm:inline">Pause</span>
          </button>
        )}

        <div className="h-6 w-px bg-zinc-800 mx-1" />

        {/* Sold / Hammer */}
        <button
          type="button"
          onClick={() => {
            if (!activeLot) return;
            void runDockAction(() => confirmSaleAction(activeLot.id), 'SOLD Hammer Confirmed');
          }}
          disabled={isPending || !isFloorActive || !hasBids}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs shadow-md transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          title="Confirm Sale (Hammer)"
        >
          <Gavel className="size-4" />
          <span>SOLD</span>
        </button>

        {/* Mark Unsold */}
        <button
          type="button"
          onClick={() => {
            if (!activeLot) return;
            void runDockAction(() => markUnsoldAction(activeLot.id), 'Marked Unsold');
          }}
          disabled={isPending || !isFloorActive}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-600 hover:bg-red-500 active:scale-95 text-white font-bold text-xs shadow-md transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          title="Mark Unsold"
        >
          <XCircle className="size-4" />
          <span>UNSOLD</span>
        </button>

        <div className="h-6 w-px bg-zinc-800 mx-1" />

        {/* Quick Timer Extensions */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              if (!activeLot) return;
              void runDockAction(() => extendTimerAction(activeLot.id, 10), '+10s Extended');
            }}
            disabled={isPending || !isFloorActive}
            className="px-2.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:scale-95 border border-zinc-700 text-amber-400 font-bold text-xs transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title="Extend Timer by 10s"
          >
            +10s
          </button>
          <button
            type="button"
            onClick={() => {
              if (!activeLot) return;
              void runDockAction(() => extendTimerAction(activeLot.id, 20), '+20s Extended');
            }}
            disabled={isPending || !isFloorActive}
            className="px-2.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:scale-95 border border-zinc-700 text-amber-400 font-bold text-xs transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title="Extend Timer by 20s"
          >
            +20s
          </button>
          <button
            type="button"
            onClick={() => {
              if (!activeLot) return;
              void runDockAction(() => extendTimerAction(activeLot.id, 30), '+30s Extended');
            }}
            disabled={isPending || !isFloorActive}
            className="px-2.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:scale-95 border border-zinc-700 text-amber-400 font-bold text-xs transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title="Extend Timer by 30s"
          >
            +30s
          </button>
        </div>
      </div>
    </div>
  );
}
