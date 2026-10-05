'use client';

// =============================================================================
// ACC Auction Portal — Components: Guest Draw Dialog (§14, §15, §16, §17)
// =============================================================================
// Features:
// - Fixed snapshot ordering (draw_number ASC) for stable card numbering (01, 02...).
// - Cards do NOT shift numbers when players are drawn.
// - Persisted in sessionStorage across tab interactions during the session.
// - Server independently validates lotId, bucket, and status === 'pending'.
// - 3D card flip animation when guest number is picked.
// =============================================================================

import React, { useState, useEffect } from 'react';
import {
  getGuestDrawSnapshotAction,
  callGuestDrawNumberAction,
} from '@/lib/auction/actions';
import { runWithLocalActionTracking } from '@/components/auction/auction-realtime-sync';
import type { GuestDrawCandidate } from '@/lib/auction/types';
import { X, Sparkles, Loader2, CheckCircle2 } from 'lucide-react';

interface GuestDrawDialogProps {
  isOpen: boolean;
  onClose: () => void;
  seasonId: string;
  activeBuckets: string[];
  initialBucket?: string;
  onPlayerDrawn?: (lotId: string, playerName: string) => void;
}

export function GuestDrawDialog({
  isOpen,
  onClose,
  seasonId,
  activeBuckets,
  initialBucket,
  onPlayerDrawn,
}: GuestDrawDialogProps) {
  const [selectedBucket, setSelectedBucket] = useState<string>(
    initialBucket || activeBuckets[0] || 'B3'
  );
  const [candidates, setCandidates] = useState<GuestDrawCandidate[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [revealedLotId, setRevealedLotId] = useState<string | null>(null);
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

  const getStorageKey = (b: string) => `acc_guest_draw_snapshot_${seasonId}_${b}`;

  const loadSnapshot = async (bucket: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setRevealedLotId(null);

    // Try loading from sessionStorage first for snapshot stability (§15, §16)
    if (typeof window !== 'undefined') {
      try {
        const cached = sessionStorage.getItem(getStorageKey(bucket));
        if (cached) {
          const parsed = JSON.parse(cached) as GuestDrawCandidate[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            setCandidates(parsed);
            setIsLoading(false);
            return;
          }
        }
      } catch {
        // Fallback to server query
      }
    }

    try {
      const res = await getGuestDrawSnapshotAction(bucket);
      if (res.success && res.data) {
        setCandidates(res.data);
        if (typeof window !== 'undefined') {
          try {
            sessionStorage.setItem(getStorageKey(bucket), JSON.stringify(res.data));
          } catch {}
        }
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
    if (candidate.drawn || isDrawing) return;

    setErrorMessage(null);
    setSuccessMessage(null);
    setIsDrawing(true);
    setRevealedLotId(candidate.lotId);

    try {
      const res = await runWithLocalActionTracking(() =>
        callGuestDrawNumberAction(candidate.lotId, candidate.bucket)
      );

      if (!res.success) {
        setErrorMessage(res.error || 'Failed to select player from card.');
        setRevealedLotId(null);
      } else {
        // Mark as drawn in snapshot
        const updated = candidates.map((c) =>
          c.lotId === candidate.lotId ? { ...c, drawn: true } : c
        );
        setCandidates(updated);
        if (typeof window !== 'undefined') {
          try {
            sessionStorage.setItem(getStorageKey(selectedBucket), JSON.stringify(updated));
          } catch {}
        }

        setSuccessMessage(
          `Card ${candidate.cardLabel}: ${candidate.playerName} brought to floor!`
        );
        if (onPlayerDrawn) {
          onPlayerDrawn(candidate.lotId, candidate.playerName);
        }

        // Auto close after brief reveal
        setTimeout(() => {
          onClose();
        }, 1200);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error executing guest draw.');
      setRevealedLotId(null);
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
                <span className="text-xs font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  Fixed Cards
                </span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                The guest chooses any card number verbally. Click that exact card to bring the player to the floor.
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
                const isRevealed = revealedLotId === card.lotId;
                const isDrawn = card.drawn;

                return (
                  <button
                    key={card.lotId}
                    type="button"
                    onClick={() => handleCardClick(card)}
                    disabled={isDrawn || isDrawing}
                    className={`group relative aspect-[3/4] rounded-2xl p-2.5 flex flex-col items-center justify-between border transition-all duration-300 select-none cursor-pointer ${
                      isDrawn
                        ? 'bg-zinc-950/40 border-zinc-800/40 text-zinc-600 opacity-40 cursor-not-allowed'
                        : isRevealed
                        ? 'bg-amber-500/20 border-amber-400 shadow-xl shadow-amber-500/30 scale-105'
                        : 'bg-gradient-to-b from-zinc-800 to-zinc-900 border-zinc-700/80 hover:border-amber-400 hover:shadow-lg hover:shadow-amber-500/10 hover:-translate-y-1 active:scale-95'
                    }`}
                  >
                    {/* Top card indicator */}
                    <div className="w-full flex items-center justify-between text-[10px] font-mono text-zinc-500">
                      <span className="font-bold text-amber-400/90">{card.bucketPlayerNumber || `${selectedBucket}${card.cardNumber}`}</span>
                      {isDrawn && <span className="text-red-400 font-bold">DRAWN</span>}
                    </div>

                    {/* Center Card Number / Player Name if revealed */}
                    {isRevealed || isDrawn ? (
                      <div className="text-center my-auto px-1">
                        <span className="block text-[11px] font-extrabold text-amber-300 leading-tight truncate max-w-[80px]">
                          {card.playerName}
                        </span>
                        <span className="block text-[10px] font-mono text-zinc-400 mt-1">
                          #{card.cardLabel} ({card.bucketPlayerNumber || `${selectedBucket}${card.cardNumber}`})
                        </span>
                      </div>
                    ) : (
                      <div className="my-auto flex flex-col items-center justify-center">
                        <span className="font-mono text-2xl sm:text-3xl font-black text-amber-400 group-hover:scale-110 transition-transform">
                          {card.cardLabel}
                        </span>
                        <span className="text-[11px] font-mono font-bold text-zinc-400 mt-0.5">
                          {card.bucketPlayerNumber || `${selectedBucket}${card.cardNumber}`}
                        </span>
                      </div>
                    )}

                    {/* Bottom Status */}
                    <div className="w-full text-center">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                        {isDrawn ? 'COMPLETED' : 'CLICK TO DRAW'}
                      </span>
                    </div>
                  </button>
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
