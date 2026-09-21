'use client';

// =============================================================================
// ACC Auction Portal — Components: Operator Control Console
// =============================================================================

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  startAuctionAction,
  pauseAuctionAction,
  resumeAuctionAction,
  selectLotAction,
  confirmSaleAction,
  markUnsoldAction,
  undoSaleAction,
} from '@/lib/auction/actions';
import type {
  AuctionLotWithDetails,
  AuctionSessionState,
  RestoreToMode,
} from '@/lib/auction/types';
import { Play, Pause, Loader2, AlertCircle } from 'lucide-react';

interface OperatorControlsProps {
  activeLot: AuctionLotWithDetails | null;
  upcomingLots: AuctionLotWithDetails[];
  lastSoldLotId?: string | null;
  sessionState: AuctionSessionState;
}

export function OperatorControls({
  activeLot,
  upcomingLots,
  lastSoldLotId,
  sessionState,
}: OperatorControlsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showUndoModal, setShowUndoModal] = useState(false);
  const [undoMode, setUndoMode] = useState<RestoreToMode>('resume_bidding');

  const handleStartAuction = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    startTransition(async () => {
      const res = await startAuctionAction();
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to start auction.');
      } else {
        setSuccessMsg('Auction is now LIVE! Bidding floor is open.');
        router.refresh();
      }
    });
  };

  const handlePauseAuction = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    startTransition(async () => {
      const res = await pauseAuctionAction();
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to pause auction.');
      } else {
        setSuccessMsg('Auction session PAUSED.');
        router.refresh();
      }
    });
  };

  const handleResumeAuction = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    startTransition(async () => {
      const res = await resumeAuctionAction();
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to resume auction.');
      } else {
        setSuccessMsg('Auction session RESUMED and LIVE.');
        router.refresh();
      }
    });
  };

  const handleSelectLot = (lotId: string) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    startTransition(async () => {
      const res = await selectLotAction(lotId);
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to select lot.');
      } else {
        setSuccessMsg('Player brought to floor successfully.');
        router.refresh();
      }
    });
  };

  const handleConfirmSale = () => {
    if (!activeLot) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    startTransition(async () => {
      const res = await confirmSaleAction(activeLot.id);
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to confirm sale.');
      } else {
        setSuccessMsg(`Player SOLD for ₹${res.data?.price}!`);
        router.refresh();
      }
    });
  };

  const handleMarkUnsold = () => {
    if (!activeLot) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    startTransition(async () => {
      const res = await markUnsoldAction(activeLot.id);
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to mark unsold.');
      } else {
        setSuccessMsg('Player passed and marked UNSOLD.');
        router.refresh();
      }
    });
  };

  const handleUndoSale = () => {
    if (!lastSoldLotId) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    startTransition(async () => {
      const res = await undoSaleAction(lastSoldLotId, undoMode);
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to undo sale.');
      } else {
        setSuccessMsg(`Sale successfully undone (Mode: ${undoMode}).`);
        setShowUndoModal(false);
        router.refresh();
      }
    });
  };

  const isFloorActive = sessionState.isLive;
  const canHammer =
    isFloorActive &&
    activeLot &&
    activeLot.status === 'in_progress' &&
    activeLot.current_price !== null &&
    activeLot.highest_bidder_franchise_id !== null;

  const canPass = isFloorActive && activeLot && activeLot.status === 'in_progress';

  return (
    <div className="space-y-6">
      {/* Feedback Messages */}
      {errorMsg && (
        <div className="rounded-xl bg-red-950/80 border border-red-800/80 p-4 text-xs text-red-200 flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0 text-red-400" />
          <span><strong>Action Failed:</strong> {errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="rounded-xl bg-emerald-950/80 border border-emerald-800/80 p-4 text-xs text-emerald-200">
          <strong>Success:</strong> {successMsg}
        </div>
      )}

      {/* 1. SESSION LIFECYCLE CONTROLS */}
      {sessionState.isNotStarted ? (
        <div className="rounded-2xl border-2 border-dashed border-amber-500/40 bg-zinc-900/90 p-8 text-center space-y-5 shadow-2xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/15 px-3.5 py-1 text-xs font-bold text-amber-400 border border-amber-500/30 uppercase tracking-widest">
            <span className="inline-block size-2 rounded-full bg-amber-400" />
            AUCTION NOT STARTED
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <h2 className="text-xl font-black text-zinc-100 tracking-tight">
              Ready to Open Bidding Floor
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Starting the auction unlocks all operator controls, activates live room and projector telemetry, and permits franchises to place bids.
            </p>
          </div>
          <button
            type="button"
            onClick={handleStartAuction}
            disabled={isPending}
            className="inline-flex items-center gap-2.5 px-8 py-3.5 rounded-xl font-black text-sm bg-emerald-600 hover:bg-emerald-500 text-white shadow-xl shadow-emerald-950/50 transition-all duration-150 cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                <span>STARTING AUCTION...</span>
              </>
            ) : (
              <>
                <Play className="size-4" />
                <span>START AUCTION</span>
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-5 shadow-xl flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {sessionState.isLive ? (
                <span className="flex size-3 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full size-3 bg-emerald-500" />
                </span>
              ) : (
                <span className="size-3 rounded-full bg-amber-500" />
              )}
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                Session Status:
              </span>
            </div>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider ${
                sessionState.isLive
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              }`}
            >
              {sessionState.isLive ? 'AUCTION LIVE' : 'AUCTION PAUSED'}
            </span>
            {activeLot && (
              <span className="hidden sm:inline text-xs text-zinc-400 font-mono">
                Lot #{activeLot.draw_number} ({activeLot.player.full_name})
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {sessionState.isLive ? (
              <button
                type="button"
                onClick={handlePauseAuction}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-amber-400 font-bold text-xs border border-zinc-700 shadow transition-colors cursor-pointer"
              >
                <Pause className="size-3.5" />
                <span>PAUSE AUCTION</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleResumeAuction}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow transition-colors cursor-pointer"
              >
                <Play className="size-3.5" />
                <span>RESUME AUCTION</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 2. ACTIVE LOT EXECUTION PANEL */}
      <div className={`rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl space-y-4 ${sessionState.isNotStarted ? 'opacity-40 pointer-events-none' : ''}`}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
            Auctioneer Floor Controls
          </h3>
          {sessionState.isPaused && (
            <span className="text-xs text-amber-400 font-semibold">
              ⏸ Controls paused — click Resume above to proceed
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* HAMMER / SELL */}
          <button
            type="button"
            onClick={handleConfirmSale}
            disabled={!canHammer || isPending}
            className={`py-4 px-4 rounded-xl font-bold text-sm transition-all duration-150 flex flex-col items-center justify-center gap-1 ${
              canHammer && !isPending
                ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg cursor-pointer active:scale-95'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-800'
            }`}
          >
            <span className="text-xl">🔨</span>
            <span>HAMMER / SELL</span>
            <span className="text-[10px] font-normal opacity-80">
              {activeLot?.current_price ? `At ₹${activeLot.current_price}` : 'No bids'}
            </span>
          </button>

          {/* PASS / UNSOLD */}
          <button
            type="button"
            onClick={handleMarkUnsold}
            disabled={!canPass || isPending}
            className={`py-4 px-4 rounded-xl font-bold text-sm transition-all duration-150 flex flex-col items-center justify-center gap-1 ${
              canPass && !isPending
                ? 'bg-amber-600/80 hover:bg-amber-600 text-white shadow-lg cursor-pointer active:scale-95'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-800'
            }`}
          >
            <span className="text-xl">🛑</span>
            <span>PASS / UNSOLD</span>
            <span className="text-[10px] font-normal opacity-80">
              Move lot to unsold
            </span>
          </button>

          {/* UNDO LAST SALE */}
          <button
            type="button"
            onClick={() => setShowUndoModal(true)}
            disabled={!lastSoldLotId || isPending || !isFloorActive}
            className={`py-4 px-4 rounded-xl font-bold text-sm transition-all duration-150 flex flex-col items-center justify-center gap-1 ${
              lastSoldLotId && !isPending && isFloorActive
                ? 'bg-zinc-800 hover:bg-zinc-700 text-amber-400 border border-amber-500/40 shadow-lg cursor-pointer active:scale-95'
                : 'bg-zinc-800/50 text-zinc-600 cursor-not-allowed border border-zinc-800'
            }`}
          >
            <span className="text-xl">↩</span>
            <span>UNDO LAST SALE</span>
            <span className="text-[10px] font-normal opacity-80">
              Deterministic recovery
            </span>
          </button>
        </div>
      </div>

      {/* Undo Modal */}
      {showUndoModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
              <span className="text-amber-400">⚠</span> Confirm Undo Last Sale
            </h3>

            <p className="text-xs text-zinc-400 leading-relaxed">
              This will create an immutable <code>UNDO_SALE</code> event and restore
              the winning franchise&apos;s purse, bucket quota, and squad count.
            </p>

            <div className="space-y-2 text-xs">
              <label className="text-zinc-300 font-semibold block">
                Select Restoration Mode:
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-lg border border-zinc-800 hover:bg-zinc-800/60 cursor-pointer">
                <input
                  type="radio"
                  name="undoMode"
                  value="resume_bidding"
                  checked={undoMode === 'resume_bidding'}
                  onChange={() => setUndoMode('resume_bidding')}
                  className="mt-0.5 text-emerald-500"
                />
                <div>
                  <span className="font-bold text-zinc-200 block">
                    Resume Bidding (Recommended)
                  </span>
                  <span className="text-zinc-400 block text-[11px] mt-0.5">
                    Restores lot to <code>in_progress</code> with previous highest bid
                    and restarts the timer.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-lg border border-zinc-800 hover:bg-zinc-800/60 cursor-pointer">
                <input
                  type="radio"
                  name="undoMode"
                  value="return_to_queue"
                  checked={undoMode === 'return_to_queue'}
                  onChange={() => setUndoMode('return_to_queue')}
                  className="mt-0.5 text-amber-500"
                />
                <div>
                  <span className="font-bold text-zinc-200 block">
                    Return to Queue
                  </span>
                  <span className="text-zinc-400 block text-[11px] mt-0.5">
                    Resets lot to <code>pending</code> with cleared prices. Player can
                    be selected again later.
                  </span>
                </div>
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setShowUndoModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-zinc-400 hover:text-zinc-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUndoSale}
                disabled={isPending}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white shadow cursor-pointer"
              >
                {isPending ? 'Processing Undo...' : 'Confirm Undo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. UPCOMING PLAYER QUEUE SELECTOR */}
      <div className={`rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl space-y-4 ${sessionState.isNotStarted ? 'opacity-40 pointer-events-none' : ''}`}>
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
            Upcoming Lots in Queue ({upcomingLots.length})
          </h3>
          <span className="text-xs text-zinc-500 font-mono">
            Organized by Round & Bucket
          </span>
        </div>

        {upcomingLots.length === 0 ? (
          <div className="text-center py-8 text-xs text-zinc-500">
            No pending lots remaining in the auction queue.
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {upcomingLots.map((lot) => (
              <div
                key={lot.id}
                className="rounded-xl bg-zinc-950/70 border border-zinc-800/80 p-3.5 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs font-mono font-bold text-zinc-300">
                    #{lot.draw_number}
                  </span>
                  <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-400">
                    {lot.bucket}
                  </span>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-zinc-200 truncate">
                      {lot.player.full_name}
                    </h4>
                    <span className="text-[10px] text-zinc-500 block truncate">
                      {lot.registration.branch} • Year {lot.registration.academic_year} •
                      Base: ₹{lot.base_price}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleSelectLot(lot.id)}
                  disabled={Boolean(activeLot && activeLot.status === 'in_progress') || isPending || !isFloorActive}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                    (!activeLot || activeLot.status !== 'in_progress') && isFloorActive
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow'
                      : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  }`}
                >
                  Bring to Floor
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
