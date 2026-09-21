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
  onExpire?: () => void;
  size?: 'sm' | 'md' | 'lg';
}

export function AuctionTimer({
  startedAt,
  durationSeconds,
  isActive,
  onExpire,
  size = 'md',
}: AuctionTimerProps) {
  const [remaining, setRemaining] = useState<number>(() => {
    if (!startedAt || !isActive) return durationSeconds;
    const deadline = new Date(startedAt).getTime() + durationSeconds * 1000;
    return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  });

  useEffect(() => {
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
  }, [startedAt, durationSeconds, isActive, onExpire]);

  const percentage = Math.max(
    0,
    Math.min(100, (remaining / durationSeconds) * 100)
  );

  const isUrgent = remaining <= 5 && remaining > 0;
  const isExpired = remaining === 0 && isActive;

  const colorClass = isExpired
    ? 'text-red-500'
    : isUrgent
    ? 'text-amber-500 animate-pulse'
    : 'text-emerald-400';

  const barColor = isExpired
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
        {isActive && (
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
        )}
      </div>

      <div className={`font-mono font-bold tracking-tight ${sizeClasses.text} ${colorClass}`}>
        {isActive ? `${remaining}s` : 'WAITING'}
      </div>

      <div className={`w-full bg-zinc-800 rounded-full overflow-hidden mt-3 ${sizeClasses.height}`}>
        <div
          className={`h-full transition-all duration-300 ease-linear rounded-full ${barColor}`}
          style={{ width: `${isActive ? percentage : 100}%` }}
        />
      </div>
    </div>
  );
}
