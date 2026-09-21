'use client';

// =============================================================================
// ACC Auction Portal — Global Live Auction Notification Banner
// =============================================================================

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Flame, ArrowRight, Gavel } from 'lucide-react';

interface LiveAuctionBannerProps {
  initialIsLive?: boolean;
  seasonId: string;
  role: 'franchise' | 'player';
  seasonName?: string;
}

export function LiveAuctionBanner({
  initialIsLive = false,
  seasonId,
  role,
  seasonName = 'ACC 2026',
}: LiveAuctionBannerProps) {
  const [isLive, setIsLive] = useState(initialIsLive);

  useEffect(() => {
    setIsLive(initialIsLive);
  }, [initialIsLive]);

  useEffect(() => {
    if (!seasonId) return;

    const supabase = createClient();
    const channelName = `live-banner-${seasonId}-${Math.random().toString(36).substring(2, 7)}`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'season_config',
          filter: `season_id=eq.${seasonId}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (row && row.key === 'auction_session_status') {
            setIsLive(row.value === 'live');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [seasonId]);

  if (!isLive) return null;

  const targetHref = role === 'franchise' ? '/franchise/auction' : '/player/auction';
  const actionLabel = role === 'franchise' ? 'JOIN LIVE AUCTION' : 'WATCH LIVE AUCTION';
  const subtitle =
    role === 'franchise'
      ? 'Live bidding floor is open. Place bids in real time for your squad.'
      : 'Official hammer floor is live. Watch real-time player bids and lot sales.';

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 p-4 sm:p-5 shadow-xl text-white mb-6 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex size-3.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
            <span className="relative inline-flex rounded-full size-3.5 bg-white shadow-sm" />
          </span>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-black tracking-wider text-xs uppercase bg-white/20 px-2 py-0.5 rounded text-white shadow-sm">
                🔴 AUCTION IS LIVE
              </span>
              <span className="text-xs font-bold opacity-90">{seasonName}</span>
            </div>
            <p className="text-xs opacity-90 mt-1 font-medium">{subtitle}</p>
          </div>
        </div>

        <Link
          href={targetHref}
          className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-xs font-black text-emerald-800 shadow-md hover:bg-emerald-50 transition-all active:scale-95 cursor-pointer shrink-0"
        >
          {role === 'franchise' ? <Gavel className="size-4 text-emerald-600" /> : <Flame className="size-4 text-emerald-600" />}
          <span>{actionLabel}</span>
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}
