'use client';

// =============================================================================
// ACC Auction Portal — Components: Operator Control Console
// =============================================================================

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  selectLotAction,
  confirmSaleAction,
  markUnsoldAction,
  undoSaleAction,
} from '@/lib/auction/actions';
import type { AuctionLotWithDetails, RestoreToMode } from '@/lib/auction/types';

interface OperatorControlsProps {
  activeLot: AuctionLotWithDetails | null;
  upcomingLots: AuctionLotWithDetails[];
  lastSoldLotId?: string | null;
}

export function OperatorControls({
  activeLot,
  upcomingLots,
  lastSoldLotId,
}: OperatorControlsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showUndoModal, setShowUndoModal] = useState(false);
  const [undoMode, setUndoMode] = useState<RestoreToMode>('resume_bidding');

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

  const canHammer =
    activeLot &&
    activeLot.status === 'in_progress' &&
    activeLot.current_price !== null &&
    activeLot.highest_bidder_franchise_id !== null;

  const canPass = activeLot && activeLot.status === 'in_progress';

  return (
    <div className="space-y-6">
      {/* Feedback Messages */}
      {errorMsg && (
        <div className="rounded-xl bg-red-950/80 border border-red-800/80 p-4 text-xs text-red-200">
          <strong>Action Failed:</strong> {errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="rounded-xl bg-emerald-950/80 border border-emerald-800/80 p-4 text-xs text-emerald-200">
          <strong>Success:</strong> {successMsg}
        </div>
      )}

      {/* Active Lot Execution Panel */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
          Auctioneer Floor Controls
        </h3>

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
            disabled={!lastSoldLotId || isPending}
            className={`py-4 px-4 rounded-xl font-bold text-sm transition-all duration-150 flex flex-col items-center justify-center gap-1 ${
              lastSoldLotId && !isPending
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
                className="px-4 py-2 rounded-lg text-xs font-semibold text-zinc-400 hover:text-zinc-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUndoSale}
                disabled={isPending}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white shadow"
              >
                {isPending ? 'Processing Undo...' : 'Confirm Undo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upcoming Player Queue Selector */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl space-y-4">
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
                  disabled={Boolean(activeLot && activeLot.status === 'in_progress') || isPending}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                    !activeLot || activeLot.status !== 'in_progress'
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
