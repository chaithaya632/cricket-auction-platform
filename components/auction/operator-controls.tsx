'use client';

// =============================================================================
// ACC Auction Portal — Components: Operator Control Console
// =============================================================================

import React, { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  startAuctionAction,
  startAuctionAgainAction,
  pauseAuctionAction,
  resumeAuctionAction,
  endAuctionAction,
  selectLotAction,
  confirmSaleAction,
  markUnsoldAction,
  skipLotAction,
  recallSkippedLotAction,
  undoSaleAction,
  adminProxyBidAction,
  adminStartRoundTwoAction,
  adminAutoAllotLotAction,
  adminRelaxBucketMinimumAction,
  bringDownUnsoldLotAction,
  reAuctionUnsoldLotAction,
} from '@/lib/auction/actions';
import type {
  AuctionLotWithDetails,
  AuctionSessionState,
  RestoreToMode,
} from '@/lib/auction/types';
import type { BucketScarcityReport } from '@/domain/scarcity';
import { Play, Pause, Square, Loader2, AlertCircle, ShieldAlert, Users, RotateCcw, Award } from 'lucide-react';

export interface OperatorSoldLotItem {
  id: string;
  draw_number: number;
  player_name: string;
  franchise_name: string;
  price: number;
  bucket: string;
}

export interface OperatorFranchiseOption {
  id: string;
  name: string;
  short_name: string;
}

interface OperatorControlsProps {
  activeLot: AuctionLotWithDetails | null;
  upcomingLots: AuctionLotWithDetails[];
  unsoldLots?: AuctionLotWithDetails[];
  lastSoldLotId?: string | null;
  soldLots?: OperatorSoldLotItem[];
  franchises?: OperatorFranchiseOption[];
  sessionState: AuctionSessionState;
  isSuperAdmin?: boolean;
  scarcityReport?: BucketScarcityReport | null;
}

export function OperatorControls({
  activeLot,
  upcomingLots,
  unsoldLots = [],
  lastSoldLotId,
  soldLots = [],
  franchises = [],
  sessionState,
  isSuperAdmin = false,
  scarcityReport = null,
}: OperatorControlsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeQueueTab, setActiveQueueTab] = useState<'upcoming' | 'unsold' | 'sold'>('upcoming');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showUndoModal, setShowUndoModal] = useState(false);
  const [selectedUndoLotId, setSelectedUndoLotId] = useState<string>(
    lastSoldLotId || (soldLots[0]?.id ?? '')
  );
  const [undoMode, setUndoMode] = useState<RestoreToMode>('resume_bidding');
  const [showEndModal, setShowEndModal] = useState(false);
  const [endLotMode, setEndLotMode] = useState<'hammer' | 'unsold'>('hammer');

  // Super Admin Action states
  const [showProxyModal, setShowProxyModal] = useState(false);
  const [proxyFranchiseId, setProxyFranchiseId] = useState<string>(franchises[0]?.id || '');
  const [proxyBidAmount, setProxyBidAmount] = useState<number>(0);

  const [showRoundTwoModal, setShowRoundTwoModal] = useState(false);
  const [showRelaxBucketModal, setShowRelaxBucketModal] = useState(false);
  const [relaxBucket, setRelaxBucket] = useState<string>('B1');
  const [relaxMinimum, setRelaxMinimum] = useState<number>(1);
  const [relaxReason, setRelaxReason] = useState<string>(
    'Uniform bucket relaxation under §13 endgame procedures'
  );

  const [localSessionState, setLocalSessionState] = useState<AuctionSessionState>(sessionState);

  useEffect(() => {
    setLocalSessionState(sessionState);
  }, [sessionState]);

  useEffect(() => {
    if (lastSoldLotId) {
      setSelectedUndoLotId(lastSoldLotId);
    } else if (soldLots.length > 0) {
      setSelectedUndoLotId(soldLots[0].id);
    }
  }, [lastSoldLotId, soldLots]);

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

  const handleStartAuctionAgain = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    startTransition(async () => {
      const res = await startAuctionAgainAction();
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to restart auction session.');
      } else {
        setSuccessMsg('Auction session RESTARTED and LIVE! Bidding floor is reopened.');
        router.refresh();
      }
    });
  };

  const handlePauseAuction = () => {
    if (isPending) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    startTransition(async () => {
      const res = await pauseAuctionAction();
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to pause auction.');
      } else {
        setLocalSessionState((prev) => ({
          ...prev,
          status: 'paused',
          isLive: false,
          isPaused: true,
        }));
        setSuccessMsg('Auction session PAUSED.');
        router.refresh();
      }
    });
  };

  const handleResumeAuction = () => {
    if (isPending) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    startTransition(async () => {
      const res = await resumeAuctionAction();
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to resume auction.');
      } else {
        setLocalSessionState((prev) => ({
          ...prev,
          status: 'live',
          isLive: true,
          isPaused: false,
        }));
        setSuccessMsg('Auction session RESUMED and LIVE.');
        router.refresh();
      }
    });
  };

  const handleBringDownUnsoldLot = (lotId: string) => {
    if (isPending) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    startTransition(async () => {
      const res = await bringDownUnsoldLotAction(lotId);
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to return player to lot queue.');
      } else {
        setSuccessMsg('Player moved back to Lot Queue.');
        router.refresh();
      }
    });
  };

  const handleReAuctionUnsoldLot = (lotId: string) => {
    if (isPending) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    startTransition(async () => {
      const res = await reAuctionUnsoldLotAction(lotId);
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to re-auction player.');
      } else {
        setSuccessMsg(`Player queued for re-auction at base price ₹${res.data?.basePrice}.`);
        router.refresh();
      }
    });
  };

  const handleEndAuction = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    startTransition(async () => {
      const res = await endAuctionAction({ resolveActiveLotMode: endLotMode });
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to end auction.');
      } else {
        setSuccessMsg('Auction session has officially ENDED and status is COMPLETED.');
        setShowEndModal(false);
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

  const handleSkipLot = () => {
    if (!activeLot) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    startTransition(async () => {
      const res = await skipLotAction(activeLot.id, 'Skipped by operator (§10)');
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to skip lot.');
      } else {
        setSuccessMsg(`Player #${activeLot.draw_number} (${activeLot.player.full_name}) skipped. Can be recalled at the end of Bucket ${activeLot.bucket} (§10).`);
        router.refresh();
      }
    });
  };

  const handleUndoSale = () => {
    const targetLotId = selectedUndoLotId || lastSoldLotId;
    if (!targetLotId) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    startTransition(async () => {
      const res = await undoSaleAction(targetLotId, undoMode);
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to undo sale.');
      } else {
        setSuccessMsg(`Sale successfully undone (Mode: ${undoMode}).`);
        setShowUndoModal(false);
        router.refresh();
      }
    });
  };

  const handleOpenProxyModal = () => {
    if (!activeLot) return;
    const defaultNextBid =
      activeLot.current_price !== null
        ? activeLot.current_price + 5
        : activeLot.base_price;
    setProxyBidAmount(defaultNextBid);
    if (!proxyFranchiseId && franchises.length > 0) {
      setProxyFranchiseId(franchises[0].id);
    }
    setShowProxyModal(true);
  };

  const handleProxyBid = () => {
    if (!activeLot || !proxyFranchiseId || !proxyBidAmount) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    startTransition(async () => {
      const res = await adminProxyBidAction(
        activeLot.id,
        proxyFranchiseId,
        proxyBidAmount
      );
      if (!res.success) {
        setErrorMsg(res.error || 'Proxy bid failed.');
      } else {
        setSuccessMsg(`Proxy bid of ₹${proxyBidAmount} placed successfully (§16).`);
        setShowProxyModal(false);
        router.refresh();
      }
    });
  };

  const handleStartRoundTwo = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    startTransition(async () => {
      const res = await adminStartRoundTwoAction();
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to start Round 2.');
      } else {
        setSuccessMsg(`Round 2 activated! Reopened ${res.data?.reopenedCount} unsold player(s) at base price 20 credits (§13).`);
        setShowRoundTwoModal(false);
        router.refresh();
      }
    });
  };

  const handleAutoAllot = () => {
    if (!activeLot) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    startTransition(async () => {
      const res = await adminAutoAllotLotAction(activeLot.id);
      if (!res.success) {
        setErrorMsg(res.error || 'Auto-allotment failed.');
      } else {
        setSuccessMsg(`Player ALLOTTED to ${res.data?.franchiseName} at 20 credits under §13 endgame rules.`);
        router.refresh();
      }
    });
  };

  const handleRelaxBucket = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    startTransition(async () => {
      const res = await adminRelaxBucketMinimumAction(relaxBucket, relaxMinimum, relaxReason);
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to relax bucket quota.');
      } else {
        setSuccessMsg(`Bucket ${res.data?.bucket} quota relaxed to ${res.data?.newMinimum} uniformly across all franchises (§13, §40).`);
        setShowRelaxBucketModal(false);
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
      {/* SCARCITY WARNING BANNER (§12.3) */}
      {scarcityReport?.isWarningActive && (
        <div className="rounded-2xl border-2 border-amber-500 bg-amber-950/80 p-5 text-xs text-amber-200 shadow-2xl flex flex-wrap items-center justify-between gap-4 animate-pulse">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <span className="font-black uppercase tracking-wider text-amber-300 block text-sm">
                SCARCITY WARNING: Bucket {scarcityReport.bucket} (§12.3)
              </span>
              <p className="text-[11px] text-amber-200/90 mt-0.5">
                {scarcityReport.unsoldSupply} unsold player(s) remaining for {scarcityReport.totalPlayersNeeded} player need(s) across {scarcityReport.franchisesNeedingCount} franchise(s).
                Threshold: <strong>{scarcityReport.threshold}</strong>. Bidding is not blocked (§12.3).
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-lg bg-amber-500/20 text-amber-400 font-bold border border-amber-500/40 text-xs font-mono">
              SUPPLY: {scarcityReport.unsoldSupply} / NEED: {scarcityReport.totalPlayersNeeded}
            </span>
          </div>
        </div>
      )}

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
      {sessionState.isCompleted ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-5 shadow-xl flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="size-3 rounded-full bg-blue-500" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                  Session Status:
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  AUCTION SESSION COMPLETED
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-1">
                Official hammer floor was closed. You can restart the auction session to continue bidding on remaining lots.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleStartAuctionAgain}
            disabled={isPending}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-xs bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/50 transition-all duration-150 cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>REOPENING FLOOR...</span>
              </>
            ) : (
              <>
                <Play className="size-3.5 fill-current" />
                <span>START AUCTION AGAIN</span>
              </>
            )}
          </button>
        </div>
      ) : sessionState.isNotStarted ? (
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
              {localSessionState.isLive ? (
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
                localSessionState.isLive
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              }`}
            >
              {localSessionState.isLive ? 'AUCTION LIVE' : 'AUCTION PAUSED'}
            </span>
            {activeLot && (
              <span className="hidden sm:inline text-xs text-zinc-400 font-mono">
                Lot #{activeLot.draw_number} ({activeLot.player.full_name})
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {localSessionState.isLive ? (
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

            <button
              type="button"
              onClick={() => setShowEndModal(true)}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-950/80 hover:bg-red-900 text-red-300 hover:text-white font-bold text-xs border border-red-800 shadow transition-colors cursor-pointer"
            >
              <Square className="size-3.5 fill-current" />
              <span>END AUCTION</span>
            </button>
          </div>
        </div>
      )}

      {/* End Auction Confirmation Modal */}
      {showEndModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="rounded-2xl border border-red-900/80 bg-zinc-900 p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
              <span className="text-red-500">🛑</span> Confirm End Auction Session
            </h3>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Ending the auction completes the tournament season, closes the bidding floor, and disables any further bids or lot selection.
            </p>

            {activeLot && activeLot.status === 'in_progress' && (
              <div className="rounded-xl bg-zinc-950 p-3.5 border border-zinc-800 space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 block">
                  Active Lot in Progress
                </span>
                <p className="text-xs text-zinc-300">
                  Player: <strong>{activeLot.player.full_name}</strong> (Lot #{activeLot.draw_number})
                </p>
                {activeLot.highest_bidder ? (
                  <p className="text-xs text-zinc-400">
                    Current highest bid: <strong>₹{activeLot.current_price}</strong> by <strong>{activeLot.highest_bidder.name}</strong>
                  </p>
                ) : (
                  <p className="text-xs text-zinc-400">No bids placed on this lot yet.</p>
                )}

                <div className="pt-2 space-y-1.5">
                  <label className="text-[11px] font-semibold text-zinc-300 block">
                    How should this lot be resolved?
                  </label>
                  {activeLot.highest_bidder && (
                    <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                      <input
                        type="radio"
                        name="endLotMode"
                        value="hammer"
                        checked={endLotMode === 'hammer'}
                        onChange={() => setEndLotMode('hammer')}
                        className="text-red-500"
                      />
                      <span>Confirm sale to highest bidder (₹{activeLot.current_price})</span>
                    </label>
                  )}
                  <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                    <input
                      type="radio"
                      name="endLotMode"
                      value="unsold"
                      checked={endLotMode === 'unsold' || !activeLot.highest_bidder}
                      onChange={() => setEndLotMode('unsold')}
                      className="text-amber-500"
                    />
                    <span>Pass and mark lot UNSOLD</span>
                  </label>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setShowEndModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-zinc-400 hover:text-zinc-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEndAuction}
                disabled={isPending}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-500 text-white shadow cursor-pointer"
              >
                {isPending ? 'Ending Session...' : 'Confirm & End Auction'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. ACTIVE LOT EXECUTION PANEL */}
      <div className={`rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl space-y-4 ${localSessionState.isNotStarted ? 'opacity-40 pointer-events-none' : ''}`}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
            Auctioneer Floor Controls
          </h3>
          {localSessionState.isPaused && (
            <span className="text-xs text-amber-400 font-semibold">
              ⏸ Controls paused — click Resume above to proceed
            </span>
          )}
        </div>

        {activeLot?.status === 'unsold' && (
          <div className="rounded-xl border border-red-500/40 bg-zinc-950 p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-red-400 flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-red-400" />
                Unsold Player On Floor
              </span>
              <span className="text-xs font-mono font-bold text-zinc-400">
                Base Price: ₹{activeLot.base_price}
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Player #{activeLot.draw_number} ({activeLot.player.full_name}) received no bids. Choose an action to proceed:
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => handleBringDownUnsoldLot(activeLot.id)}
                disabled={isPending}
                className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold text-xs sm:text-sm shadow-md transition-all active:scale-95 cursor-pointer disabled:cursor-not-allowed flex items-center gap-2"
              >
                <span>⬇️</span>
                <span>BRING DOWN TO LOT QUEUE</span>
              </button>
              <button
                type="button"
                onClick={() => handleReAuctionUnsoldLot(activeLot.id)}
                disabled={isPending}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs sm:text-sm shadow-md transition-all active:scale-95 cursor-pointer disabled:cursor-not-allowed flex items-center gap-2"
              >
                <span>🔄</span>
                <span>RE-AUCTION</span>
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* HAMMER / SELL */}
          <button
            type="button"
            onClick={handleConfirmSale}
            disabled={!canHammer || isPending}
            className={`py-4 px-3 rounded-xl font-bold text-xs sm:text-sm transition-all duration-150 flex flex-col items-center justify-center gap-1 ${
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
            className={`py-4 px-3 rounded-xl font-bold text-xs sm:text-sm transition-all duration-150 flex flex-col items-center justify-center gap-1 ${
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

          {/* SKIP LOT (§10) */}
          <button
            type="button"
            onClick={handleSkipLot}
            disabled={!canPass || isPending}
            className={`py-4 px-3 rounded-xl font-bold text-xs sm:text-sm transition-all duration-150 flex flex-col items-center justify-center gap-1 ${
              canPass && !isPending
                ? 'bg-purple-900/80 hover:bg-purple-800 text-purple-200 border border-purple-700 shadow-lg cursor-pointer active:scale-95'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-800'
            }`}
          >
            <span className="text-xl">⏭</span>
            <span>SKIP LOT</span>
            <span className="text-[10px] font-normal opacity-80">
              Recalled at bucket end (§10)
            </span>
          </button>

          {/* UNDO SALE */}
          <button
            type="button"
            onClick={() => setShowUndoModal(true)}
            disabled={(!lastSoldLotId && soldLots.length === 0) || isPending || !isFloorActive}
            className={`py-4 px-3 rounded-xl font-bold text-xs sm:text-sm transition-all duration-150 flex flex-col items-center justify-center gap-1 ${
              (lastSoldLotId || soldLots.length > 0) && !isPending && isFloorActive
                ? 'bg-zinc-800 hover:bg-zinc-700 text-amber-400 border border-amber-500/40 shadow-lg cursor-pointer active:scale-95'
                : 'bg-zinc-800/50 text-zinc-600 cursor-not-allowed border border-zinc-800'
            }`}
          >
            <span className="text-xl">↩</span>
            <span>UNDO SALE</span>
            <span className="text-[10px] font-normal opacity-80">
              Deterministic recovery (§12.4)
            </span>
          </button>
        </div>
      </div>

      {/* 2.5 SUPER ADMIN GOVERNANCE CONTROLS (§12.4, §13, §16, §40) */}
      {isSuperAdmin && (
        <div className="rounded-2xl border border-amber-500/40 bg-zinc-900/90 p-5 shadow-xl space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
            <div className="flex items-center gap-2">
              <ShieldAlert className="size-4 text-amber-400" />
              <h3 className="text-xs font-black uppercase tracking-wider text-amber-400">
                Super Admin Governance Suite (§12.4, §13, §16, §40)
              </h3>
            </div>
            <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/30 uppercase">
              Full Authority
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
            {/* Proxy Bid on Active Lot */}
            <button
              type="button"
              onClick={handleOpenProxyModal}
              disabled={!activeLot || activeLot.status !== 'in_progress' || isPending || !isFloorActive}
              className="p-3 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 font-bold text-xs border border-zinc-700 transition flex flex-col items-center justify-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Users className="size-4 text-blue-400" />
              <span>Proxy Bid</span>
              <span className="text-[10px] font-normal text-zinc-400">On behalf of team (§16)</span>
            </button>

            {/* Auto-Allot Active Lot */}
            <button
              type="button"
              onClick={handleAutoAllot}
              disabled={!activeLot || isPending}
              className="p-3 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 font-bold text-xs border border-zinc-700 transition flex flex-col items-center justify-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Award className="size-4 text-emerald-400" />
              <span>Auto-Allot</span>
              <span className="text-[10px] font-normal text-zinc-400">Endgame priority (§13)</span>
            </button>

            {/* Start Round 2 */}
            <button
              type="button"
              onClick={() => setShowRoundTwoModal(true)}
              disabled={isPending}
              className="p-3 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-amber-300 font-bold text-xs border border-amber-500/30 transition flex flex-col items-center justify-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RotateCcw className="size-4 text-amber-400" />
              <span>Start Round 2</span>
              <span className="text-[10px] font-normal text-zinc-400">Reopen unsold at ₹20 (§13)</span>
            </button>

            {/* Uniform Bucket Relaxation */}
            <button
              type="button"
              onClick={() => setShowRelaxBucketModal(true)}
              disabled={isPending}
              className="p-3 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-purple-300 font-bold text-xs border border-purple-500/30 transition flex flex-col items-center justify-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="text-sm">⚖</span>
              <span>Relax Bucket</span>
              <span className="text-[10px] font-normal text-zinc-400">Lower quota (§7, §40)</span>
            </button>
          </div>
        </div>
      )}

      {/* Undo Modal */}
      {showUndoModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
              <span className="text-amber-400">⚠</span> Confirm Undo Sale (§12.4)
            </h3>

            <p className="text-xs text-zinc-400 leading-relaxed">
              This will create an immutable <code>UNDO_SALE</code> event and restore
              the winning franchise&apos;s purse, bucket quota, and squad count without cascading rollbacks.
            </p>

            {soldLots.length > 0 && (
              <div className="space-y-1 text-xs">
                <label className="text-zinc-300 font-semibold block">
                  Select Target Sale to Undo:
                </label>
                <select
                  value={selectedUndoLotId}
                  onChange={(e) => setSelectedUndoLotId(e.target.value)}
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-xs text-zinc-200"
                >
                  {soldLots.map((sl) => (
                    <option key={sl.id} value={sl.id}>
                      Lot #{sl.draw_number} — {sl.player_name} (₹{sl.price} to {sl.franchise_name})
                    </option>
                  ))}
                </select>
              </div>
            )}

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

      {/* Proxy Bid Modal (§16) */}
      {showProxyModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
              <span className="text-blue-400">🛡</span> Submit Proxy Bid (§16)
            </h3>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Place a bid on behalf of a franchise that has experienced network disconnection or technical failure on the floor.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-zinc-300 font-semibold block mb-1">
                  Select Franchise:
                </label>
                <select
                  value={proxyFranchiseId}
                  onChange={(e) => setProxyFranchiseId(e.target.value)}
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-xs text-zinc-200"
                >
                  {franchises.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.short_name})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-zinc-300 font-semibold block mb-1">
                  Bid Amount (₹ Credits):
                </label>
                <input
                  type="number"
                  min="20"
                  step="5"
                  value={proxyBidAmount}
                  onChange={(e) => setProxyBidAmount(Number(e.target.value))}
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-xs text-zinc-100 font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setShowProxyModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-zinc-400 hover:text-zinc-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleProxyBid}
                disabled={isPending}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow cursor-pointer"
              >
                {isPending ? 'Submitting Proxy...' : 'Submit Proxy Bid'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Start Round 2 Confirmation Modal (§13) */}
      {showRoundTwoModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="rounded-2xl border border-amber-500/60 bg-zinc-900 p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
              <span className="text-amber-400">🔄</span> Start Round 2 (§13)
            </h3>

            <p className="text-xs text-zinc-400 leading-relaxed">
              This will reopen all <strong>unsold</strong> and un-recalled <strong>skipped</strong> players from Round 1 and reset their base price to exactly <strong>20 credits</strong>.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setShowRoundTwoModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-zinc-400 hover:text-zinc-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStartRoundTwo}
                disabled={isPending}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white shadow cursor-pointer"
              >
                {isPending ? 'Reopening Lots...' : 'Activate Round 2'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Uniform Bucket Relaxation Modal (§7, §13, §40) */}
      {showRelaxBucketModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="rounded-2xl border border-purple-500/60 bg-zinc-900 p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
              <span className="text-purple-400">⚖</span> Relax Bucket Minimum (§7, §13, §40)
            </h3>

            <p className="text-xs text-zinc-400 leading-relaxed">
              If player supply in a bucket is genuinely insufficient, Super Admin may relax the required quota (e.g. from 2 to 1) uniformly for all franchises.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-zinc-300 font-semibold block mb-1">
                  Bucket:
                </label>
                <select
                  value={relaxBucket}
                  onChange={(e) => setRelaxBucket(e.target.value)}
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-xs text-zinc-200"
                >
                  {['B1', 'B2', 'B3', 'B4', 'B5'].map((b) => (
                    <option key={b} value={b}>
                      Bucket {b}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-zinc-300 font-semibold block mb-1">
                  New Required Minimum:
                </label>
                <select
                  value={relaxMinimum}
                  onChange={(e) => setRelaxMinimum(Number(e.target.value))}
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-xs text-zinc-200 font-mono"
                >
                  <option value={1}>1 Player (Relax from 2)</option>
                  <option value={0}>0 Players (Full Exemption)</option>
                </select>
              </div>

              <div>
                <label className="text-zinc-300 font-semibold block mb-1">
                  Administrative Reason (Logged to Audit Trail):
                </label>
                <input
                  type="text"
                  value={relaxReason}
                  onChange={(e) => setRelaxReason(e.target.value)}
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-xs text-zinc-100"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setShowRelaxBucketModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-zinc-400 hover:text-zinc-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRelaxBucket}
                disabled={isPending}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white shadow cursor-pointer"
              >
                {isPending ? 'Applying Relaxation...' : 'Apply Uniform Relaxation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. PLAYER QUEUE & LOT STATUS SELECTOR */}
      <div className={`rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl space-y-4 ${sessionState.isNotStarted ? 'opacity-40 pointer-events-none' : ''}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveQueueTab('upcoming')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeQueueTab === 'upcoming'
                  ? 'bg-zinc-800 text-zinc-100 shadow border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Upcoming ({upcomingLots.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveQueueTab('unsold')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeQueueTab === 'unsold'
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span>Unsold Lots</span>
              <span className="rounded-full bg-red-500/30 px-1.5 py-0.2 text-[10px] font-mono">
                {unsoldLots.length}
              </span>
            </button>
            {soldLots.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveQueueTab('sold')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeQueueTab === 'sold'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span>Sold ({soldLots.length})</span>
              </button>
            )}
          </div>
          <span className="text-xs text-zinc-500 font-mono">
            {activeQueueTab === 'upcoming'
              ? 'Organized by Round & Bucket'
              : activeQueueTab === 'unsold'
              ? 'Round 2 Reopening Candidate (§13)'
              : 'Completed Floor Sales'}
          </span>
        </div>

        {activeQueueTab === 'upcoming' && (
          upcomingLots.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <p className="text-xs text-zinc-400">
                No pending lots remaining in the active queue.
              </p>
              {unsoldLots.length > 0 && (
                <div className="space-y-2 pt-1">
                  <p className="text-[11px] text-zinc-500">
                    {unsoldLots.length} player{unsoldLots.length === 1 ? '' : 's'} went unsold in Round 1 and will reopen in Round 2 (§13).
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveQueueTab('unsold')}
                    className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 border border-zinc-700 cursor-pointer"
                  >
                    View Unsold Lots ({unsoldLots.length}) →
                  </button>
                </div>
              )}
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
          )
        )}

        {activeQueueTab === 'unsold' && (
          unsoldLots.length === 0 ? (
            <div className="text-center py-8 text-xs text-zinc-500">
              No unsold players recorded.
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {unsoldLots.map((lot) => (
                <div
                  key={lot.id}
                  className="rounded-xl bg-zinc-950/70 border border-red-900/30 p-3.5 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs font-mono font-bold text-zinc-300">
                      #{lot.draw_number}
                    </span>
                    <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-400">
                      {lot.bucket}
                    </span>
                    <span className="rounded bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-400 border border-red-500/30">
                      UNSOLD
                    </span>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-zinc-200 truncate">
                        {lot.player.full_name}
                      </h4>
                      <span className="text-[10px] text-zinc-500 block truncate">
                        {lot.registration.branch} • Year {lot.registration.academic_year} • Base: ₹{lot.base_price} • Round {lot.round}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleBringDownUnsoldLot(lot.id)}
                      disabled={isPending}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-600/80 hover:bg-amber-600 disabled:opacity-50 text-white font-bold text-xs shadow transition-all cursor-pointer disabled:cursor-not-allowed flex items-center gap-1"
                      title="Return player to lot queue at original base price"
                    >
                      <span>⬇️</span>
                      <span>Queue</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReAuctionUnsoldLot(lot.id)}
                      disabled={isPending}
                      className="px-2.5 py-1.5 rounded-lg bg-blue-600/80 hover:bg-blue-600 disabled:opacity-50 text-white font-bold text-xs shadow transition-all cursor-pointer disabled:cursor-not-allowed flex items-center gap-1"
                      title="Re-auction player at original base price"
                    >
                      <span>🔄</span>
                      <span>Re-Auction</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {activeQueueTab === 'sold' && (
          soldLots.length === 0 ? (
            <div className="text-center py-8 text-xs text-zinc-500">
              No completed sales recorded yet.
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {soldLots.map((sl) => (
                <div
                  key={sl.id}
                  className="rounded-xl bg-zinc-950/70 border border-emerald-900/30 p-3.5 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs font-mono font-bold text-zinc-300">
                      #{sl.draw_number}
                    </span>
                    <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-400">
                      {sl.bucket}
                    </span>
                    <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30">
                      SOLD
                    </span>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-zinc-200 truncate">
                        {sl.player_name}
                      </h4>
                      <span className="text-[10px] text-zinc-400 block truncate">
                        Won by <strong className="text-emerald-400">{sl.franchise_name}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-xs font-mono font-bold text-emerald-400 block">
                      ₹{sl.price}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
