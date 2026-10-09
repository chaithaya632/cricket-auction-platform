'use client';

// =============================================================================
// ACC Auction Portal — Components: Auction Hammer & Stamp Animations
// =============================================================================
// Features:
// - Hardware-accelerated realistic wooden & brass auction gavel swing (§Feature 2, 3)
// - Shockwave impact & particle burst at exact point of contact (~350ms)
// - Authentic Web Audio synthesized wooden gavel knock + gold bell chime
// - Bold, unmistakable SOLD / UNSOLD rubber stamp treatment readable from auditorium
// - Strict event deduplication: prevents duplicate playback on re-renders/broadcast replays
// - Zero state mutation: presentation-only layer (never alters timers or lot status)
// - Fully accessible with @media (prefers-reduced-motion: reduce) compliance
// =============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { playHammerStrikeSound } from '@/lib/auction/audio';

// In-memory deduplication set across component re-renders
const animatedLotEvents = new Set<string>();

export function resetHammerAnimationDeduplicationForTests(): void {
  animatedLotEvents.clear();
}

interface AuctionHammerStampProps {
  status: 'in_progress' | 'sold' | 'unsold' | 'pending' | string;
  lotId?: string | null;
  size?: 'normal' | 'projector';
  onAnimationComplete?: () => void;
}

export function AuctionHammerStamp({
  status,
  lotId,
  size = 'normal',
  onAnimationComplete,
}: AuctionHammerStampProps) {
  const isTargetStatus = status === 'sold' || status === 'unsold';
  const isProjector = size === 'projector';
  const dedupeKey = lotId ? `${lotId}:${status}` : null;

  // Animation phase: 'idle' | 'swinging' | 'struck' | 'settled'
  const [phase, setPhase] = useState<'idle' | 'swinging' | 'struck' | 'settled'>(() => {
    if (!isTargetStatus) return 'idle';
    if (dedupeKey && animatedLotEvents.has(dedupeKey)) return 'settled';
    return 'idle';
  });

  const onCompleteRef = useRef(onAnimationComplete);
  onCompleteRef.current = onAnimationComplete;

  useEffect(() => {
    if (!isTargetStatus || !lotId) {
      setPhase('idle');
      return;
    }

    if (animatedLotEvents.has(dedupeKey!)) {
      setPhase('settled');
      return;
    }

    // Check prefers-reduced-motion
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      animatedLotEvents.add(dedupeKey!);
      setPhase('settled');
      playHammerStrikeSound(status as 'sold' | 'unsold', lotId);
      onCompleteRef.current?.();
      return;
    }

    // Begin animated swing sequence
    animatedLotEvents.add(dedupeKey!);
    setPhase('swinging');

    // T = 350ms: Impact contact point (hammer hits, stamp slams, audio strikes)
    const impactTimer = setTimeout(() => {
      setPhase('struck');
      playHammerStrikeSound(status as 'sold' | 'unsold', lotId);
    }, 320);

    // T = 800ms: Gavel fades away, leaving bold stamp settled across card
    const settleTimer = setTimeout(() => {
      setPhase('settled');
      onCompleteRef.current?.();
    }, 850);

    return () => {
      clearTimeout(impactTimer);
      clearTimeout(settleTimer);
    };
  }, [status, lotId, dedupeKey, isTargetStatus]);

  if (!isTargetStatus || phase === 'idle') {
    return null;
  }

  const isSold = status === 'sold';
  const isSwinging = phase === 'swinging';
  const isStruck = phase === 'struck';
  const showHammer = phase === 'swinging' || phase === 'struck';

  return (
    <div
      className="absolute inset-0 pointer-events-none z-30 flex items-center justify-center overflow-hidden"
      aria-label={isSold ? 'Lot Sold Stamp' : 'Lot Unsold Stamp'}
      data-testid={isSold ? 'sold-stamp-container' : 'unsold-stamp-container'}
    >
      {/* 1. Realistic Wooden & Brass Auction Gavel (Swings during initial phase) */}
      {showHammer && (
        <div
          data-testid="auction-hammer"
          className={`absolute top-4 right-10 md:right-24 z-40 origin-[85%_15%] transition-opacity duration-300 ${
            isSwinging ? 'animate-hammer-swing' : 'opacity-90'
          }`}
          style={{ width: isProjector ? 180 : 130, height: isProjector ? 180 : 130 }}
        >
          <svg
            viewBox="0 0 200 200"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-full drop-shadow-2xl"
          >
            {/* Gavel Turned Handle */}
            <path
              d="M130 50 L40 140 C35 145 32 152 35 158 C38 164 45 166 51 162 L140 73 Z"
              fill="url(#handleGradient)"
              stroke="#2A1405"
              strokeWidth="2"
            />
            {/* Handle Grip End Ring */}
            <circle cx="36" cy="158" r="8" fill="#F59E0B" stroke="#B45309" strokeWidth="2" />
            <circle cx="44" cy="150" r="6" fill="#78350F" />

            {/* Gavel Head Joint Collar (Brass) */}
            <rect
              x="125"
              y="58"
              width="18"
              height="10"
              transform="rotate(45 125 58)"
              fill="#F59E0B"
              stroke="#B45309"
              strokeWidth="1.5"
            />

            {/* Gavel Cylinder Head (Hardwood with Brass Center Ring) */}
            <g transform="translate(145, 45) rotate(45)">
              {/* Left striking face */}
              <rect x="-35" y="-16" width="12" height="32" rx="3" fill="#3E1C00" stroke="#1F0D00" strokeWidth="1.5" />
              <rect x="-33" y="-14" width="8" height="28" rx="2" fill="#D97706" />

              {/* Main barrel wood body */}
              <rect x="-23" y="-18" width="46" height="36" rx="4" fill="url(#headGradient)" stroke="#2A1405" strokeWidth="2" />

              {/* Center brass decorative band */}
              <rect x="-6" y="-19" width="12" height="38" fill="url(#brassGradient)" stroke="#B45309" strokeWidth="1" />

              {/* Right striking face */}
              <rect x="23" y="-16" width="12" height="32" rx="3" fill="#3E1C00" stroke="#1F0D00" strokeWidth="1.5" />
              <rect x="25" y="-14" width="8" height="28" rx="2" fill="#D97706" />
            </g>

            {/* Gradients */}
            <defs>
              <linearGradient id="handleGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#92400E" />
                <stop offset="50%" stopColor="#78350F" />
                <stop offset="100%" stopColor="#451A03" />
              </linearGradient>
              <linearGradient id="headGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#78350F" />
                <stop offset="50%" stopColor="#451A03" />
                <stop offset="100%" stopColor="#1C0A00" />
              </linearGradient>
              <linearGradient id="brassGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#F59E0B" />
                <stop offset="50%" stopColor="#FDE68A" />
                <stop offset="100%" stopColor="#D97706" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      )}

      {/* 2. Impact Shockwave & Particle Burst (Fires at contact T ~ 320ms) */}
      {isStruck && (
        <>
          <div
            className={`absolute rounded-full border-4 ${
              isSold ? 'border-amber-400 bg-amber-400/20' : 'border-red-400 bg-red-400/20'
            } animate-shockwave`}
            style={{ width: isProjector ? 280 : 180, height: isProjector ? 280 : 180 }}
          />
          {/* Subtle spark particles */}
          {[...Array(6)].map((_, i) => (
            <span
              key={i}
              className={`absolute size-2 rounded-full ${
                isSold ? 'bg-amber-300' : 'bg-red-300'
              } animate-ping opacity-75`}
              style={{
                transform: `rotate(${i * 60}deg) translateY(-${isProjector ? 90 : 60}px)`,
              }}
            />
          ))}
        </>
      )}

      {/* 3. Authoritative Rubber Stamp (Slams down onto the card) */}
      {(isStruck || phase === 'settled') && (
        <div
          data-testid={isSold ? 'sold-stamp' : 'unsold-stamp'}
          className={`relative z-30 transition-transform ${
            phase === 'struck' ? 'animate-stamp-slam' : 'rotate-[-11deg]'
          }`}
        >
          {isSold ? (
            /* SOLD Stamp — Gold / Red Auction Luxury Treatment */
            <div className="relative px-8 py-4 sm:px-12 sm:py-6 rounded-2xl border-4 sm:border-8 border-amber-400 bg-gradient-to-br from-amber-950/90 via-zinc-950/95 to-red-950/90 shadow-[0_0_50px_rgba(245,158,11,0.45)] backdrop-blur-md text-center select-none ring-4 ring-amber-400/40">
              <div className="absolute inset-1 rounded-xl border-2 border-dashed border-amber-400/60 pointer-events-none" />
              <div className="flex items-center justify-center gap-3">
                <span className="text-amber-400 text-3xl sm:text-5xl">🔨</span>
                <span
                  className={`font-black uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-b from-amber-200 via-amber-300 to-amber-500 drop-shadow-[0_4px_12px_rgba(245,158,11,0.6)] ${
                    isProjector ? 'text-7xl sm:text-8xl' : 'text-5xl sm:text-7xl'
                  }`}
                  style={{ fontStretch: 'ultra-condensed' }}
                >
                  SOLD
                </span>
                <span className="text-amber-400 text-3xl sm:text-5xl">🔨</span>
              </div>
              <div className="mt-1 flex items-center justify-center gap-2">
                <span className="h-0.5 w-8 bg-amber-400/60" />
                <span className="text-[11px] sm:text-xs font-black uppercase tracking-[0.25em] text-amber-300/90 font-mono">
                  OFFICIAL HAMMER CONFIRMED
                </span>
                <span className="h-0.5 w-8 bg-amber-400/60" />
              </div>
            </div>
          ) : (
            /* UNSOLD Stamp — Subdued Gray / Red Treatment */
            <div className="relative px-8 py-4 sm:px-12 sm:py-6 rounded-2xl border-4 sm:border-8 border-red-500/80 bg-gradient-to-br from-zinc-950/95 via-red-950/80 to-zinc-950/95 shadow-[0_0_40px_rgba(239,68,68,0.35)] backdrop-blur-md text-center select-none ring-4 ring-red-500/30">
              <div className="absolute inset-1 rounded-xl border-2 border-dashed border-red-500/50 pointer-events-none" />
              <div className="flex items-center justify-center gap-3">
                <span className="text-red-400 text-3xl sm:text-5xl">⚖️</span>
                <span
                  className={`font-black uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-b from-red-200 via-red-400 to-red-600 drop-shadow-[0_4px_10px_rgba(239,68,68,0.5)] ${
                    isProjector ? 'text-7xl sm:text-8xl' : 'text-5xl sm:text-7xl'
                  }`}
                  style={{ fontStretch: 'ultra-condensed' }}
                >
                  UNSOLD
                </span>
                <span className="text-red-400 text-3xl sm:text-5xl">⚖️</span>
              </div>
              <div className="mt-1 flex items-center justify-center gap-2">
                <span className="h-0.5 w-8 bg-red-400/50" />
                <span className="text-[11px] sm:text-xs font-black uppercase tracking-[0.25em] text-red-300/80 font-mono">
                  PASSED · ROUND 2 ELIGIBLE
                </span>
                <span className="h-0.5 w-8 bg-red-400/50" />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
