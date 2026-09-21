'use client';

// =============================================================================
// ACC Auction Portal — Components: Recent Auction Activity Stream
// =============================================================================

import React from 'react';
import type { AuctionEventDTO } from '@/lib/auction/types';

interface RecentActivityStreamProps {
  events: AuctionEventDTO[];
}

export function RecentActivityStream({ events }: RecentActivityStreamProps) {
  if (!events || events.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 text-center text-xs text-zinc-500">
        No recent auction events recorded yet.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 shadow-lg space-y-4">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <h3 className="text-xs uppercase font-bold tracking-wider text-zinc-400">
          Live Activity Feed
        </h3>
        <span className="text-[10px] text-zinc-500 font-mono">
          Seq #{events[0]?.sequence_number}
        </span>
      </div>

      <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
        {events.map((e) => {
          const time = new Date(e.created_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          });

          return (
            <div
              key={e.id}
              className="rounded-lg bg-zinc-950/70 border border-zinc-800/60 p-3 text-xs flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                    e.event_type === 'BID_PLACED'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : e.event_type === 'SALE'
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      : e.event_type === 'UNSOLD'
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                      : e.event_type === 'UNDO_SALE'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'bg-zinc-800 text-zinc-300'
                  }`}
                >
                  {e.event_type.replace('_', ' ')}
                </span>

                <div className="min-w-0 truncate">
                  {e.franchise ? (
                    <span className="font-semibold text-zinc-200">
                      {e.franchise.name}
                    </span>
                  ) : (
                    <span className="text-zinc-400 font-medium">Auction System</span>
                  )}
                  {e.reason && (
                    <span className="text-zinc-500 block text-[10px] truncate">
                      {e.reason}
                    </span>
                  )}
                </div>
              </div>

              <div className="text-right shrink-0">
                {e.price !== null && (
                  <span className="font-mono font-bold text-emerald-400 block text-xs">
                    ₹{e.price}
                  </span>
                )}
                <span className="text-[10px] text-zinc-500 font-mono block">{time}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
