'use client';

// =============================================================================
// ACC Auction Portal — Components: Auction Countdown Timer
// =============================================================================
// Authoritative timer derived strictly from lot.started_at + configured duration.
// The browser NEVER determines the starting timestamp; it only computes
// elapsed time from the database timestamp.
//
// PHASE 5 ENHANCEMENTS:
// - Explicit TIME UP visual state when remaining reach 0 and lot is in_progress.
// - Quick extension controls (+10s, +20s, +30s) and END LOT (Hammer / Unsold).
// - Listens to realtime delta broadcasts (TIMER_EXTENDED, BID_PLACED) to reset
//   or extend the timer immediately without awaiting full router.refresh().
// =============================================================================

import React, { useEffect, useState } from 'react';
import {
  extendTimerAction,
  confirmSaleAction,
  markUnsoldAction,
} from '@/lib/auction/actions';
import {
  runWithLocalActionTracking,
  subscribeAuctionDelta,
  getCalibratedNow,
} from '@/components/auction/auction-realtime-sync';

interface AuctionTimerProps {
  startedAt: string | null;
  durationSeconds: number;
  isActive: boolean;
  isPaused?: boolean;
  pausedRemainingSeconds?: number | null;
  onExpire?: () => void;
  onRemainingChange?: (remaining: number) => void;
  size?: 'sm' | 'md' | 'lg';
  lotId?: string | null;
  highestBidderId?: string | null;
  showControls?: boolean;
  onExtend?: (seconds: 10 | 20 | 30) => void;
  onEndLot?: () => void;
}

export function getDeterministicInitialRemaining({
  durationSeconds,
  isPaused = false,
  pausedRemainingSeconds,
}: {
  durationSeconds: number;
  isPaused?: boolean;
  pausedRemainingSeconds?: number | null;
}): number {
  if (isPaused && pausedRemainingSeconds !== null && pausedRemainingSeconds !== undefined) {
    return Math.max(0, pausedRemainingSeconds);
  }
  return Math.max(0, durationSeconds);
}

export function AuctionTimer({
  startedAt,
  durationSeconds,
  isActive,
  isPaused = false,
  pausedRemainingSeconds,
  onExpire,
  onRemainingChange,
  size = 'md',
  lotId = null,
  highestBidderId = null,
  showControls = false,
  onExtend,
  onEndLot,
}: AuctionTimerProps) {
  const [effectiveStartedAt, setEffectiveStartedAt] = useState<string | null>(startedAt);
  const [effectiveDuration, setEffectiveDuration] = useState<number>(durationSeconds);
  const [isExtending, setIsExtending] = useState(false);
  const [timerFeedback, setTimerFeedback] = useState<string | null>(null);

  const onExpireRef = React.useRef(onExpire);
  onExpireRef.current = onExpire;

  const onRemainingChangeRef = React.useRef(onRemainingChange);
  onRemainingChangeRef.current = onRemainingChange;

  const intervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const lastPausedRemainingRef = React.useRef<number | null>(null);
  const resumeAnchorRef = React.useRef<{
    resumedAt: number;
    remainingAtResume: number;
    startedAtWhenResumed: string | null;
  } | null>(null);
  const wasPausedRef = React.useRef<boolean>(isPaused);

  useEffect(() => {
    setEffectiveStartedAt(startedAt);
    setEffectiveDuration(durationSeconds);
  }, [startedAt, durationSeconds]);

  // Subscribe to instantaneous broadcast deltas
  useEffect(() => {
    return subscribeAuctionDelta((payload) => {
      if (lotId && payload.lotId && payload.lotId !== lotId) return;

      if (payload.type === 'TIMER_EXTENDED') {
        if (payload.startedAt) setEffectiveStartedAt(payload.startedAt);
        if (payload.durationSeconds) setEffectiveDuration(payload.durationSeconds);
      } else if (payload.type === 'BID_PLACED') {
        if (payload.startedAt) setEffectiveStartedAt(payload.startedAt);
        if (payload.durationSeconds) setEffectiveDuration(payload.durationSeconds);
      } else if (payload.type === 'RESUME') {
        if (payload.startedAt) setEffectiveStartedAt(payload.startedAt);
      }
    });
  }, [lotId]);

  const [remaining, setRemaining] = useState<number>(() =>
    getDeterministicInitialRemaining({
      durationSeconds: effectiveDuration,
      isPaused,
      pausedRemainingSeconds,
    })
  );

  // Sync remaining change to callback
  useEffect(() => {
    onRemainingChangeRef.current?.(remaining);
  }, [remaining]);

  // Exactly ONE interval management loop
  useEffect(() => {
    // Clear any previous interval immediately
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (isPaused) {
      // Freeze timer immediately at the exact displayed value (or pausedRemainingSeconds if provided)
      const frozen =
        pausedRemainingSeconds !== null && pausedRemainingSeconds !== undefined
          ? Math.max(0, pausedRemainingSeconds)
          : remaining;
      lastPausedRemainingRef.current = frozen;
      resumeAnchorRef.current = null;
      wasPausedRef.current = true;
      setRemaining(frozen);
      return;
    }

    // Transition from paused -> live: establish resume anchor to eliminate clock jitter
    if (wasPausedRef.current && !isPaused) {
      wasPausedRef.current = false;
      const baseRemaining =
        lastPausedRemainingRef.current !== null
          ? lastPausedRemainingRef.current
          : pausedRemainingSeconds !== null && pausedRemainingSeconds !== undefined
          ? pausedRemainingSeconds
          : remaining;
      resumeAnchorRef.current = {
        resumedAt: getCalibratedNow(),
        remainingAtResume: baseRemaining,
        startedAtWhenResumed: effectiveStartedAt,
      };
    } else {
      wasPausedRef.current = false;
    }

    if (!effectiveStartedAt || !isActive) {
      setRemaining(effectiveDuration);
      return;
    }

    const computeLiveRemaining = () => {
      const nowMs = getCalibratedNow();
      // If we have an active resume anchor and effectiveStartedAt hasn't changed yet,
      // count down smoothly from the anchor to eliminate the 20 -> 16 -> 20 jump.
      if (resumeAnchorRef.current) {
        if (effectiveStartedAt !== resumeAnchorRef.current.startedAtWhenResumed) {
          // Parent/server caught up with the updated started_at timestamp
          resumeAnchorRef.current = null;
        } else {
          const elapsedSec = (nowMs - resumeAnchorRef.current.resumedAt) / 1000;
          return Math.max(0, Math.ceil(resumeAnchorRef.current.remainingAtResume - elapsedSec));
        }
      }

      const deadline = new Date(effectiveStartedAt).getTime() + effectiveDuration * 1000;
      return Math.max(0, Math.ceil((deadline - nowMs) / 1000));
    };

    const initialLeft = computeLiveRemaining();
    setRemaining(initialLeft);
    if (initialLeft <= 0) {
      onExpireRef.current?.();
      return;
    }

    intervalRef.current = setInterval(() => {
      const left = computeLiveRemaining();
      setRemaining(left);

      if (left <= 0) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        onExpireRef.current?.();
      }
    }, 200);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [effectiveStartedAt, effectiveDuration, isActive, isPaused, pausedRemainingSeconds]);

  const handleExtend = async (seconds: 10 | 20 | 30) => {
    // 1. Instant optimistic update in visible UI
    setRemaining((prev) => prev + seconds);
    setEffectiveDuration((prev) => prev + seconds);
    setTimerFeedback(`+${seconds}s added`);

    // 2. Delegate to parent handler if available
    if (onExtend) {
      onExtend(seconds);
      return;
    }

    // 3. Otherwise invoke server action directly
    if (!lotId || isExtending) return;
    setIsExtending(true);
    try {
      const res = await runWithLocalActionTracking(() => extendTimerAction(lotId, seconds));
      if (!res.success) {
        setTimerFeedback(res.error || 'Failed to extend timer');
      }
    } catch (err: any) {
      setTimerFeedback(err?.message || 'Error extending timer');
    } finally {
      setIsExtending(false);
    }
  };

  const handleEndLot = async () => {
    if (onEndLot) {
      onEndLot();
      return;
    }
    if (!lotId || isExtending) return;
    setIsExtending(true);
    setTimerFeedback(null);
    try {
      if (highestBidderId) {
        const res = await runWithLocalActionTracking(() => confirmSaleAction(lotId));
        if (!res.success) setTimerFeedback(res.error || 'Failed to confirm sale');
      } else {
        const res = await runWithLocalActionTracking(() => markUnsoldAction(lotId));
        if (!res.success) setTimerFeedback(res.error || 'Failed to mark unsold');
      }
    } catch (err: any) {
      setTimerFeedback(err?.message || 'Error concluding lot');
    } finally {
      setIsExtending(false);
    }
  };

  const displayRemaining = isPaused
    ? (pausedRemainingSeconds !== null && pausedRemainingSeconds !== undefined
        ? Math.max(0, pausedRemainingSeconds)
        : remaining)
    : remaining;

  const percentage = Math.max(
    0,
    Math.min(100, (displayRemaining / effectiveDuration) * 100)
  );

  const isUrgent = !isPaused && displayRemaining <= 5 && displayRemaining > 0;
  const isTimeUp = !isPaused && displayRemaining === 0 && isActive;

  const colorClass = isPaused
    ? 'text-amber-400'
    : isTimeUp
    ? 'text-red-500'
    : isUrgent
    ? 'text-amber-500 animate-pulse'
    : 'text-emerald-400';

  const barColor = isPaused
    ? 'bg-amber-500'
    : isTimeUp
    ? 'bg-red-500'
    : isUrgent
    ? 'bg-amber-500'
    : 'bg-emerald-500';

  const sizeClasses = {
    sm: {
      text: 'text-2xl',
      height: 'h-1.5',
      pad: 'py-1',
    },
    md: {
      text: 'text-4xl',
      height: 'h-2.5',
      pad: 'py-2',
    },
    lg: {
      text: 'text-6xl font-black',
      height: 'h-4',
      pad: 'py-4',
    },
  }[size];

  return (
    <div className={`flex flex-col items-center w-full ${sizeClasses.pad}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs uppercase tracking-widest text-zinc-400 font-semibold">
          Auction Timer
        </span>
        {isActive && !isPaused && !isTimeUp && (
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
        )}
        {isTimeUp && (
          <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-ping" />
        )}
        {isPaused && (
          <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
        )}
      </div>

      {isTimeUp ? (
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="px-4 py-1 rounded-full bg-red-600/30 border border-red-500 text-red-400 font-black tracking-widest text-xl sm:text-2xl animate-pulse">
              TIME UP
            </span>
          </div>
        </div>
      ) : (
        <div className={`font-mono font-bold tracking-tight ${sizeClasses.text} ${colorClass}`}>
          {isPaused ? `PAUSED (${displayRemaining}s)` : isActive ? `${displayRemaining}s` : 'WAITING'}
        </div>
      )}

      {showControls && isActive && (
        <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
          <button
            type="button"
            onClick={() => handleExtend(10)}
            disabled={isExtending}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 active:scale-95 border border-zinc-700 text-xs font-bold text-amber-400 cursor-pointer disabled:opacity-50 transition-all"
          >
            +10s
          </button>
          <button
            type="button"
            onClick={() => handleExtend(20)}
            disabled={isExtending}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 active:scale-95 border border-zinc-700 text-xs font-bold text-amber-400 cursor-pointer disabled:opacity-50 transition-all"
          >
            +20s
          </button>
          <button
            type="button"
            onClick={() => handleExtend(30)}
            disabled={isExtending}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 active:scale-95 border border-zinc-700 text-xs font-bold text-amber-400 cursor-pointer disabled:opacity-50 transition-all"
          >
            +30s
          </button>
          <button
            type="button"
            onClick={handleEndLot}
            disabled={isExtending}
            className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 active:scale-95 text-xs font-bold text-white shadow-lg cursor-pointer disabled:opacity-50 transition-all flex items-center gap-1.5"
          >
            <span>🔨</span>
            <span>END LOT</span>
          </button>
        </div>
      )}

      {timerFeedback && (
        <span className="text-[11px] font-semibold text-zinc-400 mt-1">
          {timerFeedback}
        </span>
      )}

      <div className={`w-full bg-zinc-800 rounded-full overflow-hidden mt-3 ${sizeClasses.height}`}>
        <div
          className={`h-full transition-all duration-300 ease-linear rounded-full ${barColor}`}
          style={{ width: `${isActive || isPaused ? percentage : 100}%` }}
        />
      </div>
    </div>
  );
}
