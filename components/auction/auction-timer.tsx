'use client';

// =============================================================================
// ACC Auction Portal — Components: Auction Countdown Timer
// =============================================================================
// Authoritative timer derived strictly from lot.started_at + configured duration.
// The browser NEVER determines the starting timestamp; it only computes
// elapsed time from the database timestamp.
// =============================================================================

import React, { useEffect, useState } from 'react';

interface AuctionTimerProps {
  startedAt: string | null;
  durationSeconds: number;
  isActive: boolean;
  isPaused?: boolean;
  pausedRemainingSeconds?: number | null;
  onExpire?: () => void;
  size?: 'sm' | 'md' | 'lg';
}

export function AuctionTimer({
  startedAt,
  durationSeconds,
  isActive,
  isPaused = false,
  pausedRemainingSeconds,
  onExpire,
  size = 'md',
}: AuctionTimerProps) {
  const [remaining, setRemaining] = useState<number>(() => {
    if (isPaused) {
      if (pausedRemainingSeconds !== null && pausedRemainingSeconds !== undefined) {
        return Math.max(0, pausedRemainingSeconds);
      }
      if (startedAt) {
        const deadline = new Date(startedAt).getTime() + durationSeconds * 1000;
        return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      }
      return durationSeconds;
    }
    if (!startedAt || !isActive) return durationSeconds;
    const deadline = new Date(startedAt).getTime() + durationSeconds * 1000;
    return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  });

  useEffect(() => {
    if (isPaused) {
      const frozen =
        pausedRemainingSeconds !== null && pausedRemainingSeconds !== undefined
          ? Math.max(0, pausedRemainingSeconds)
          : startedAt
          ? Math.max(0, Math.ceil((new Date(startedAt).getTime() + durationSeconds * 1000 - Date.now()) / 1000))
          : durationSeconds;
      setRemaining(frozen);
      return;
    }

    if (!startedAt || !isActive) {
      setRemaining(durationSeconds);
      return;
    }

    const interval = setInterval(() => {
      const deadline = new Date(startedAt).getTime() + durationSeconds * 1000;
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(left);

      if (left <= 0) {
        clearInterval(interval);
        if (onExpire) {
          onExpire();
        }
      }
    }, 200);

    return () => clearInterval(interval);
  }, [startedAt, durationSeconds, isActive, isPaused, pausedRemainingSeconds, onExpire]);

  const displayRemaining = isPaused
    ? (pausedRemainingSeconds !== null && pausedRemainingSeconds !== undefined
        ? Math.max(0, pausedRemainingSeconds)
        : remaining)
    : remaining;

  const percentage = Math.max(
    0,
    Math.min(100, (displayRemaining / durationSeconds) * 100)
  );

  const isUrgent = !isPaused && displayRemaining <= 5 && displayRemaining > 0;
  const isExpired = !isPaused && displayRemaining === 0 && isActive;

  const colorClass = isPaused
    ? 'text-amber-400'
    : isExpired
    ? 'text-red-500'
    : isUrgent
    ? 'text-amber-500 animate-pulse'
    : 'text-emerald-400';

  const barColor = isPaused
    ? 'bg-amber-500'
    : isExpired
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
        {isActive && !isPaused && (
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
        )}
        {isPaused && (
          <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
        )}
      </div>

      <div className={`font-mono font-bold tracking-tight ${sizeClasses.text} ${colorClass}`}>
        {isPaused ? `PAUSED (${displayRemaining}s)` : isActive ? `${displayRemaining}s` : 'WAITING'}
      </div>

      <div className={`w-full bg-zinc-800 rounded-full overflow-hidden mt-3 ${sizeClasses.height}`}>
        <div
          className={`h-full transition-all duration-300 ease-linear rounded-full ${barColor}`}
          style={{ width: `${isActive || isPaused ? percentage : 100}%` }}
        />
      </div>
    </div>
  );
}
