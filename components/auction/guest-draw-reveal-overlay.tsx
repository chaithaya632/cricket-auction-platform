'use client';

// =============================================================================
// ACC Auction Portal — Components: Cinematic Guest Draw Reveal Overlay
// =============================================================================
// Features:
// - Prominent, cinematic player-card popup on projector & spectator screens (§Feature 1)
// - Brief ornate card-back presentation (0.6s) followed by 3D card-flip reveal
// - Displays real authoritative player data: name, photo, role, roll/branch, bucket, base price
// - Holds revealed card visible for ~2.3 seconds
// - Smooth physical transition gliding into the active floor (~0.5s)
// - Strict event deduplication: ignores duplicate broadcasts and stale reconnected events
// - Never blocks bidding or modifies timer/lot state: presentation-only layer
// - Fully accessible with @media (prefers-reduced-motion: reduce) support
// =============================================================================

import React, { useState, useEffect, useRef } from 'react';
import type { AuctionLotWithDetails } from '@/lib/auction/types';
import { subscribeAuctionDelta } from '@/components/auction/auction-realtime-sync';
import { Sparkles, Trophy } from 'lucide-react';

const seenGuestDrawEvents = new Set<string>();

export function resetGuestDrawDeduplicationForTests(): void {
  seenGuestDrawEvents.clear();
}

interface GuestDrawCandidatePayload {
  lotId: string;
  drawNumber: number;
  playerName: string;
  photoUrl: string | null;
  bucket: string;
  basePrice: number;
  role?: string | null;
  rollNumber?: string | null;
  branch?: string | null;
  academicYear?: number | string | null;
  programme?: string | null;
}

interface GuestDrawRevealOverlayProps {
  seasonId?: string;
  currentLot?: AuctionLotWithDetails | null;
  onTransitionComplete?: () => void;
  /** For direct unit testing or manual invocation */
  manualCandidate?: GuestDrawCandidatePayload | null;
}

export function GuestDrawRevealOverlay({
  seasonId,
  currentLot,
  onTransitionComplete,
  manualCandidate,
}: GuestDrawRevealOverlayProps) {
  const [candidate, setCandidate] = useState<GuestDrawCandidatePayload | null>(null);
  // Phase: 'card_back' | 'revealed' | 'transitioning_to_floor' | 'closed'
  const [phase, setPhase] = useState<'card_back' | 'revealed' | 'transitioning_to_floor' | 'closed'>('closed');

  const onCompleteRef = useRef(onTransitionComplete);
  onCompleteRef.current = onTransitionComplete;

  const candidateRef = useRef(candidate);
  candidateRef.current = candidate;

  // Handle manualCandidate injection for testing
  useEffect(() => {
    if (manualCandidate) {
      const dedupeKey = `guest-draw:${manualCandidate.lotId}:${manualCandidate.drawNumber}`;
      if (seenGuestDrawEvents.has(dedupeKey)) return;
      seenGuestDrawEvents.add(dedupeKey);

      setCandidate(manualCandidate);
      startRevealSequence();
    }
  }, [manualCandidate]);

  // Realtime delta listener for authoritative Guest Draw events
  useEffect(() => {
    return subscribeAuctionDelta((payload) => {
      // Must be an authoritative PLAYER_SELECTED with isGuestDraw flag
      if (payload.type !== 'PLAYER_SELECTED' || !payload.isGuestDraw) return;
      if (!payload.lotId) return;

      const dedupeKey = `guest-draw:${payload.lotId}:${payload.guestDrawCardNumber || payload.sequenceNumber || ''}`;
      if (seenGuestDrawEvents.has(dedupeKey)) return;

      // Ignore stale events older than 6 seconds (e.g. on late reconnect)
      if (payload.serverTimestamp) {
        const ageMs = Date.now() - new Date(payload.serverTimestamp).getTime();
        if (ageMs > 6000) return;
      }

      seenGuestDrawEvents.add(dedupeKey);

      const activeLot = payload.activeLot as AuctionLotWithDetails | undefined;
      const playerName =
        activeLot?.player?.full_name ||
        (payload as any).playerName ||
        'Selected Player';

      const candidateData: GuestDrawCandidatePayload = {
        lotId: payload.lotId,
        drawNumber: (payload.guestDrawCardNumber as number) || activeLot?.draw_number || 1,
        playerName,
        photoUrl: activeLot?.player?.photo_url || null,
        bucket: payload.guestDrawBucket || activeLot?.bucket || 'B3',
        basePrice: activeLot?.base_price ?? (payload as any).basePrice ?? 20,
        role: activeLot?.skills?.derived_player_type || null,
        rollNumber: (activeLot?.registration as any)?.roll_number || null,
        branch: activeLot?.registration?.branch || null,
        academicYear: activeLot?.registration?.academic_year || null,
        programme: activeLot?.registration?.programme || null,
      };

      setCandidate(candidateData);
      startRevealSequence();
    });
  }, [seasonId]);

  const startRevealSequence = () => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      setPhase('revealed');
      // Hold for 2.2 seconds then close
      setTimeout(() => {
        setPhase('closed');
        setCandidate(null);
        onCompleteRef.current?.();
      }, 2200);
      return;
    }

    // Step 1: Card-back display (0.6s)
    setPhase('card_back');

    // Step 2: 3D Flip reveal front of card
    const flipTimer = setTimeout(() => {
      setPhase('revealed');
    }, 600);

    // Step 3: Hold front of card visible (~2.2s), then begin glide to floor
    const glideTimer = setTimeout(() => {
      setPhase('transitioning_to_floor');
    }, 2800);

    // Step 4: Transition finished (total ~3.3s), unmount overlay
    const completeTimer = setTimeout(() => {
      setPhase('closed');
      setCandidate(null);
      onCompleteRef.current?.();
    }, 3300);

    return () => {
      clearTimeout(flipTimer);
      clearTimeout(glideTimer);
      clearTimeout(completeTimer);
    };
  };

  if (phase === 'closed' || !candidate) {
    return null;
  }

  const isCardBack = phase === 'card_back';
  const isTransitioning = phase === 'transitioning_to_floor';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Guest Draw Player Card Reveal"
      data-testid="guest-draw-reveal-overlay"
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md transition-opacity duration-300 ${
        isTransitioning ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Ambient Golden Stage Spotlight */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-b from-amber-500/20 via-amber-600/10 to-transparent rounded-full blur-3xl pointer-events-none" />

      {/* Main Cinematic Card Container */}
      <div
        className={`relative w-full max-w-xl transition-all duration-500 ${
          isCardBack
            ? 'scale-95'
            : isTransitioning
            ? 'animate-card-glide-to-floor'
            : 'animate-card-reveal-flip scale-100'
        }`}
      >
        {isCardBack ? (
          /* ================================================================= */
          /* CARD BACK: Ornate Golden ACC Auction Crest                        */
          /* ================================================================= */
          <div
            data-testid="guest-draw-card-back"
            className="rounded-3xl border-4 border-amber-400/80 bg-gradient-to-br from-amber-950 via-zinc-950 to-amber-950 p-10 md:p-14 text-center shadow-2xl relative overflow-hidden"
          >
            <div className="absolute inset-2 rounded-2xl border-2 border-dashed border-amber-400/40 pointer-events-none" />
            <div className="size-24 rounded-full bg-amber-500/20 border-2 border-amber-400/60 flex items-center justify-center mx-auto text-4xl shadow-inner animate-pulse">
              🏏
            </div>
            <div className="mt-6 space-y-2">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest bg-amber-500/25 text-amber-300 border border-amber-400/50">
                <Sparkles className="size-3.5" />
                <span>OFFICIAL GUEST DRAW</span>
              </span>
              <h2 className="text-3xl sm:text-4xl font-black text-amber-200 tracking-tight">
                CARD #{candidate.drawNumber < 10 ? `0${candidate.drawNumber}` : candidate.drawNumber}
              </h2>
              <p className="text-sm font-mono text-amber-400/80 uppercase tracking-widest">
                BUCKET {candidate.bucket} · REVEALING PLAYER...
              </p>
            </div>
          </div>
        ) : (
          /* ================================================================= */
          /* CARD FRONT: Revealed Authoritative Player Details                 */
          /* ================================================================= */
          <div
            data-testid="guest-draw-card-front"
            className="rounded-3xl border-4 border-amber-400 bg-gradient-to-b from-zinc-900 via-zinc-950 to-black p-8 sm:p-10 shadow-2xl relative overflow-hidden ring-4 ring-amber-400/30"
          >
            {/* Top Ornate Ribbon */}
            <div className="flex items-center justify-between border-b border-amber-500/30 pb-4 mb-6">
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-400/40 text-xs font-black uppercase tracking-wider font-mono">
                  BUCKET {candidate.bucket}
                </span>
                <span className="px-3 py-1 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-mono font-bold">
                  CARD #{candidate.drawNumber}
                </span>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-amber-300">
                <Trophy className="size-3.5 text-amber-400" />
                <span>GUEST DRAW REVEAL</span>
              </span>
            </div>

            {/* Player Portrait & Monogram */}
            <div className="flex flex-col items-center text-center">
              <div className="relative size-36 sm:size-44 rounded-2xl bg-zinc-800 border-4 border-amber-400 overflow-hidden shadow-2xl flex items-center justify-center">
                {candidate.photoUrl ? (
                  <img
                    src={candidate.photoUrl}
                    alt={candidate.playerName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-5xl sm:text-6xl font-black text-amber-400">
                    {candidate.playerName.charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="absolute inset-0 ring-1 ring-inset ring-amber-300/40 rounded-2xl pointer-events-none" />
              </div>

              {/* Player Name */}
              <h2 className="mt-5 text-3xl sm:text-4xl font-black text-zinc-100 tracking-tight">
                {candidate.playerName}
              </h2>

              {/* Badges / Roles */}
              <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
                {candidate.role && (
                  <span className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40 text-xs font-black uppercase tracking-wider">
                    {candidate.role.replace(/_/g, ' ')}
                  </span>
                )}
                {candidate.rollNumber && (
                  <span className="px-3 py-1 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700 text-xs font-mono font-bold">
                    {candidate.rollNumber}
                  </span>
                )}
              </div>

              {/* Academic metadata */}
              {(candidate.branch || candidate.academicYear) && (
                <p className="text-xs text-zinc-400 mt-2 font-medium">
                  {candidate.branch ? `${candidate.branch} · ` : ''}
                  {candidate.academicYear ? `Year ${candidate.academicYear}` : ''}
                  {candidate.programme ? ` (${candidate.programme.toUpperCase()})` : ''}
                </p>
              )}

              {/* Base Price Spotlight */}
              <div className="mt-6 w-full pt-4 border-t border-zinc-800 flex items-center justify-between px-4 rounded-xl bg-amber-500/10 border border-amber-400/30">
                <span className="text-xs font-black uppercase tracking-widest text-amber-400">
                  OPENING BASE PRICE
                </span>
                <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-400">
                  ₹{candidate.basePrice}
                </span>
              </div>
            </div>

            {/* Bottom transition indicator */}
            <div className="mt-5 text-center">
              <span className="text-[11px] font-mono text-amber-300/70 uppercase tracking-widest animate-pulse">
                ⚡ Ready for Live Floor Bidding ⚡
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
