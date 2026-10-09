'use client';

// =============================================================================
// ACC Auction Portal — Components: Recent Auction Activity Stream
// =============================================================================

import React, { useState, useEffect } from 'react';
import type { AuctionEventDTO } from '@/lib/auction/types';
import { subscribeAuctionDelta } from '@/components/auction/auction-realtime-sync';

interface RecentActivityStreamProps {
  events: AuctionEventDTO[];
}

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/**
 * Formats an ISO timestamp deterministically in India Standard Time (UTC+05:30)
 * using pure UTC arithmetic so SSR (Node/UTC) and browser hydration (any locale/timezone)
 * always produce identical markup without React hydration error #418.
 */
export function formatActivityTimestampIST(isoString: string): string {
  const epochMs = Date.parse(isoString);
  if (Number.isNaN(epochMs)) {
    return '--:--:--';
  }
  const istDate = new Date(epochMs + IST_OFFSET_MS);
  const hours24 = istDate.getUTCHours();
  const minutes = String(istDate.getUTCMinutes()).padStart(2, '0');
  const seconds = String(istDate.getUTCSeconds()).padStart(2, '0');
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = String(hours24 % 12 || 12).padStart(2, '0');
  return `${hours12}:${minutes}:${seconds} ${period}`;
}

export function RecentActivityStream({ events: initialEvents }: RecentActivityStreamProps) {
  const [events, setEvents] = useState<AuctionEventDTO[]>(initialEvents || []);

  useEffect(() => {
    setEvents(initialEvents || []);
  }, [initialEvents]);

  useEffect(() => {
    return subscribeAuctionDelta((payload) => {
      if (payload.type === 'BID_PLACED') {
        const newEvent: AuctionEventDTO = {
          id: `evt-${Date.now()}-${Math.random()}`,
          season_id: payload.seasonId,
          auction_lot_id: payload.lotId || '',
          event_type: 'BID_PLACED',
          actor_user_id: '',
          franchise_id: payload.highestBidderId || null,
          price: payload.currentPrice ?? null,
          reason: null,
          payload: null,
          sequence_number: payload.sequenceNumber ?? '...',
          created_at: payload.serverTimestamp || new Date().toISOString(),
          franchise: payload.highestBidderId
            ? {
                id: payload.highestBidderId,
                name: payload.highestBidderName || 'Franchise',
                short_name: payload.highestBidderShortName || '',
                primary_color: payload.highestBidderPrimaryColor || null,
                secondary_color: null,
              }
            : null,
        };
        setEvents((prev) => [newEvent, ...prev.slice(0, 24)]);
      } else if (payload.type === 'SALE' || payload.type === 'UNSOLD') {
        const newEvent: AuctionEventDTO = {
          id: `evt-${Date.now()}-${Math.random()}`,
          season_id: payload.seasonId,
          auction_lot_id: payload.lotId || '',
          event_type: payload.type as any,
          actor_user_id: '',
          franchise_id: payload.highestBidderId || null,
          price: payload.currentPrice ?? null,
          reason: payload.type === 'SALE' ? 'Sold by hammer' : 'Passed unsold',
          payload: null,
          sequence_number: payload.sequenceNumber ?? '...',
          created_at: payload.serverTimestamp || new Date().toISOString(),
        };
        setEvents((prev) => [newEvent, ...prev.slice(0, 24)]);
      }
    });
  }, []);

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
          const time = formatActivityTimestampIST(e.created_at);

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
