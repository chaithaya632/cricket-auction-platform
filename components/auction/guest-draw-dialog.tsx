'use client';

// =============================================================================
// ACC Auction Portal — Components: Guest Draw Dialog (§14, §15, §16, §17)
// =============================================================================
// Features:
// - Fixed snapshot ordering (draw_number ASC) for stable card numbering (01, 02...).
// - Cards do NOT shift numbers when players are drawn.
// - Zero permanent player consumption (no stale sessionStorage caching).
// - Instant 3D card flip animation (<250ms / 0ms) revealing player details.
// - 2-second visual reveal hold before transferring player to the floor.
// - Server independently validates lotId, bucket, and status === 'pending'.
// - Seamless pre-start and in-progress live auction support.
// =============================================================================

import React, { useState, useEffect } from 'react';
import {
  getGuestDrawSnapshotAction,
  callGuestDrawNumberAction,
} from '@/lib/auction/actions';
import { runWithLocalActionTracking } from '@/components/auction/auction-realtime-sync';
import type {
  GuestDrawCandidate,
  AuctionLotWithDetails,
  AuctionSessionState,
} from '@/lib/auction/types';
import { X, Sparkles, Loader2, CheckCircle2 } from 'lucide-react';

interface GuestDrawDialogProps {
  isOpen: boolean;
  onClose: () => void;
  seasonId: string;
  activeBuckets: string[];
  initialBucket?: string;
  hasActiveFloorPlayer?: boolean;
  onPlayerDrawn?: (
    lotId: string,
    playerName: string,
    activeLot?: AuctionLotWithDetails | null,
    sessionState?: AuctionSessionState
  ) => void;
}

export function GuestDrawDialog({
  isOpen,
  onClose,
  seasonId,
  activeBuckets,
  initialBucket,
  hasActiveFloorPlayer = false,
  onPlayerDrawn,
}: GuestDrawDialogProps) {
  const [selectedBucket, setSelectedBucket] = useState<string>(
    initialBucket || activeBuckets[0] || 'B3'
  );
  const [candidates, setCandidates] = useState<GuestDrawCandidate[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [revealingLotId, setRevealingLotId] = useState<string | null>(null);
  const [revealedCandidate, setRevealedCandidate] = useState<GuestDrawCandidate | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Sync initial bucket when opened
  useEffect(() => {
    if (isOpen) {
      const target = initialBucket || activeBuckets[0] || 'B3';
      setSelectedBucket(target);
      loadSnapshot(target);
    }
  }, [isOpen, initialBucket]);

  const loadSnapshot = async (bucket: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setRevealingLotId(null);

    try {
      // Authoritatively fetch fresh candidates directly from database
      const res = await getGuestDrawSnapshotAction(bucket, seasonId);
      if (res.success && res.data) {
        setCandidates(res.data);
      } else {
        setErrorMessage(res.error || 'Failed to load guest draw cards.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to load guest draw cards.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBucketChange = (bucket: string) => {
    setSelectedBucket(bucket);
    void loadSnapshot(bucket);
  };

  const handleCardClick = async (candidate: GuestDrawCandidate) => {
    if (candidate.drawn || isDrawing || revealingLotId || hasActiveFloorPlayer) return;

    setErrorMessage(null);
    setSuccessMessage(null);
    setIsDrawing(true);

    // 1. INSTANT 3D FLIP & REVEAL: synchronous state update (<0ms)
    setRevealingLotId(candidate.lotId);
    setRevealedCandidate(candidate);

    try {
      // 2. Start server action concurrently with minimum 2-second visual reveal hold
      const actionPromise = runWithLocalActionTracking(() =>
        callGuestDrawNumberAction(candidate.lotId, candidate.bucket, seasonId)
      );
      const holdPromise = new Promise((resolve) => setTimeout(resolve, 2000));

      const [res] = await Promise.all([actionPromise, holdPromise]);

      if (!res.success) {
        setErrorMessage(res.error || 'Failed to select player from card.');
        // Revert 3D flip on error so card flips back
        setRevealingLotId(null);
        setRevealedCandidate(null);
        setIsDrawing(false);
        return;
      }

      // Mark as drawn in local state for this active dialog instance
      setCandidates((prev) =>
        prev.map((c) => (c.lotId === candidate.lotId ? { ...c, drawn: true } : c))
      );

      setSuccessMessage(
        `Card #${candidate.cardLabel}: ${candidate.playerName} brought to floor!`
      );

      if (onPlayerDrawn) {
        onPlayerDrawn(
          candidate.lotId,
          candidate.playerName,
          res.data?.activeLot,
          res.data?.sessionState
        );
      }

      // Brief delay so operator sees floor confirmation, then close
      setTimeout(() => {
        setRevealedCandidate(null);
        onClose();
      }, 600);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error executing guest draw.');
      setRevealingLotId(null);
      setRevealedCandidate(null);
    } finally {
      setIsDrawing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-3xl border border-amber-500/30 bg-gradient-to-b from-zinc-900 via-zinc-950 to-black p-6 sm:p-8 shadow-2xl overflow-hidden">
        {/* Ambient Top Glow */}
        <div className="absolute top-0 right-1/4 -mt-16 w-80 h-32 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Sparkles className="size-5" />
            </span>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-zinc-100 tracking-tight flex items-center gap-2">
                <span>Guest Draw</span>
                <span className="text-xs font-mono font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Guest Mode Ready
                </span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Guest Mode is active by default. The guest verbally selects any available numbered card for the active bucket; authorized operator clicks the card to reveal and bring the player to the floor.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-9 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Bucket Selector Pills */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-zinc-400 mr-1">Select Bucket:</span>
          {activeBuckets.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => handleBucketChange(b)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                selectedBucket === b
                  ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20 font-black'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
              }`}
            >
              Bucket {b}
            </button>
          ))}
        </div>

        {/* Messages */}
        {errorMessage && (
          <div className="mt-3 p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-300 text-xs font-semibold">
            {errorMessage}
          </div>
        )}
        {successMessage && (
          <div className="mt-3 p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
        )}

        {hasActiveFloorPlayer && (
          <div className="mt-3 p-3 rounded-xl bg-amber-950/70 border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center gap-2">
            <span>⚠️</span>
            <span>Cannot draw: a player is already active on the auction floor.</span>
          </div>
        )}

        {/* Reveal Status Banner during 2-second hold */}
        {revealedCandidate && (
          <div className="mt-3 p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center justify-between gap-3 animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-amber-400 shrink-0" />
              <span>
                Revealing {revealedCandidate.bucketPlayerNumber || `#${revealedCandidate.cardLabel}`} · Holding ~2-second presentation before moving to floor...
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 text-amber-400 font-mono text-[11px]">
              <Loader2 className="size-3.5 animate-spin" />
              <span>Moving to floor...</span>
            </div>
          </div>
        )}

        {/* Cards Grid */}
        <div className="mt-6 flex-1 overflow-y-auto pr-1">
          {isLoading ? (
            <div className="py-16 text-center text-zinc-400 flex flex-col items-center justify-center">
              <Loader2 className="size-8 animate-spin text-amber-400 mb-2" />
              <p className="text-sm">Loading card candidates for Bucket {selectedBucket}...</p>
            </div>
          ) : candidates.length === 0 ? (
            <div className="py-16 text-center text-zinc-500">
              <p className="text-sm">No players found in Bucket {selectedBucket}.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 sm:gap-4 pb-4">
              {candidates.map((card) => {
                const isFlipped = revealingLotId === card.lotId;
                const isDrawn = card.drawn;
                const displayPlayerNumber = card.bucketPlayerNumber || `${selectedBucket}${card.cardNumber}`;

                return (
                  <div
                    key={card.lotId}
                    className="relative aspect-[3/4] [perspective:1000px] select-none"
                    data-testid={`guest-draw-card-${card.cardNumber}`}
                  >
                    <div
                      className={`w-full h-full relative transition-transform duration-500 [transform-style:preserve-3d] ${
                        isFlipped ? '[transform:rotateY(180deg)]' : '[transform:rotateY(0deg)]'
                      }`}
                    >
                      {/* FRONT FACE (Numbered Card with Deterministic Bucket Number) */}
                      <button
                        type="button"
                        onClick={() => handleCardClick(card)}
                        disabled={isDrawn || isDrawing || Boolean(revealingLotId) || hasActiveFloorPlayer}
                        className={`absolute inset-0 [backface-visibility:hidden] rounded-2xl p-2.5 flex flex-col items-center justify-between border transition-all duration-200 select-none ${
                          isDrawn
                            ? 'bg-zinc-950/40 border-zinc-800/40 text-zinc-600 opacity-40 cursor-not-allowed'
                            : 'bg-gradient-to-b from-zinc-800 to-zinc-900 border-zinc-700/80 hover:border-amber-400 hover:shadow-lg hover:shadow-amber-500/20 hover:-translate-y-1 active:scale-95 cursor-pointer'
                        }`}
                      >
                        {/* Top card indicator */}
                        <div className="w-full flex items-center justify-between text-[10px] font-mono text-zinc-500">
                          <span className="font-bold text-amber-400/80">{displayPlayerNumber}</span>
                          {isDrawn && <span className="text-red-400 font-bold">DRAWN</span>}
                        </div>

                        {/* Center Card Number: Prominent number and bucket player code */}
                        <div className="my-auto flex flex-col items-center justify-center">
                          <span className="font-mono text-2xl sm:text-3xl font-black text-amber-400 group-hover:scale-110 transition-transform">
                            {card.cardLabel}
                          </span>
                          <span className="text-[11px] font-mono font-bold text-zinc-300 mt-0.5">
                            {displayPlayerNumber}
                          </span>
                        </div>

                        {/* Bottom Status */}
                        <div className="w-full text-center">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                            {isDrawn ? 'COMPLETED' : 'CLICK TO DRAW'}
                          </span>
                        </div>
                      </button>

                      {/* BACK FACE (Revealed Player Face with photo, category, base price) */}
                      <div
                        className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] rounded-2xl p-2 sm:p-2.5 flex flex-col items-center justify-between border-2 border-amber-400 bg-gradient-to-b from-amber-950 via-zinc-900 to-black shadow-xl shadow-amber-500/30 overflow-hidden"
                      >
                        {/* Top Header: Unique Auction Number & Bucket */}
                        <div className="w-full flex items-center justify-between text-[10px] font-mono">
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/30 text-amber-300 font-bold border border-amber-500/40 text-[9px]">
                            {displayPlayerNumber}
                          </span>
                          <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider animate-pulse">
                            REVEALED
                          </span>
                        </div>

                        {/* Player Photo (or avatar fallback) */}
                        {card.photoUrl ? (
                          <div className="relative size-10 sm:size-12 rounded-full overflow-hidden border-2 border-amber-400/80 my-0.5 shadow-md shrink-0">
                            <img
                              src={card.photoUrl}
                              alt={card.playerName}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.currentTarget as HTMLElement).style.display = 'none';
                              }}
                            />
                          </div>
                        ) : (
                          <div className="size-9 sm:size-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 font-bold text-xs shrink-0 my-0.5">
                            {card.playerName.charAt(0)}
                          </div>
                        )}

                        {/* Center: Full Player Details */}
                        <div className="text-center px-1 w-full space-y-0.5">
                          <span className="block text-xs font-black text-amber-200 leading-tight truncate">
                            {card.playerName}
                          </span>
                          <div className="flex items-center justify-center gap-1 flex-wrap">
                            {card.rollNumber && (
                              <span className="text-[9px] font-mono text-zinc-400">
                                {card.rollNumber}
                              </span>
                            )}
                            {card.category && (
                              <span className="text-[8px] font-extrabold uppercase px-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                {card.category}
                              </span>
                            )}
                          </div>
                          <div className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 font-bold font-mono text-[9px] border border-emerald-500/30">
                            <span>Base:</span>
                            <span>₹{card.basePrice.toLocaleString('en-IN')}</span>
                          </div>
                        </div>

                        {/* Bottom Status: Transitioning */}
                        <div className="w-full text-center py-0.5">
                          <span className="text-[9px] font-extrabold uppercase tracking-wider text-amber-400 flex items-center justify-center gap-1">
                            <Loader2 className="size-2.5 animate-spin text-amber-400" />
                            <span>Moving to floor...</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="mt-4 pt-4 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400">
          <span>
            {candidates.filter((c) => !c.drawn).length} of {candidates.length} cards remaining
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Convenient trigger button to open Guest Draw anywhere (e.g. public /live, projector).
 * Guest Mode is unlocked and available by default.
 */
export function GuestDrawTrigger({
  seasonId,
  activeBuckets,
  initialBucket,
  className,
}: {
  seasonId: string;
  activeBuckets: string[];
  initialBucket?: string;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={
          className ||
          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600/90 hover:bg-amber-500 text-white font-semibold text-xs shadow transition-all cursor-pointer active:scale-95'
        }
        title="Open Guest Draw (Available by default)"
      >
        <Sparkles className="size-3.5" />
        <span>Guest Draw</span>
      </button>

      {isOpen && (
        <GuestDrawDialog
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          seasonId={seasonId}
          activeBuckets={activeBuckets}
          initialBucket={initialBucket}
        />
      )}
    </>
  );
}
