'use client';

// =============================================================================
// ACC Auction Portal — Realtime Synchronization Hook & Component
// =============================================================================

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface AuctionRealtimeSyncProps {
  seasonId: string;
  fallbackIntervalMs?: number;
}

export function AuctionRealtimeSync({
  seasonId,
  fallbackIntervalMs = 4000,
}: AuctionRealtimeSyncProps) {
  const router = useRouter();
  const lastRefreshTime = useRef<number>(Date.now());

  useEffect(() => {
    if (!seasonId) return;

    const supabase = createClient();

    const triggerRefresh = () => {
      const now = Date.now();
      // Debounce refreshes within 500ms to avoid churn
      if (now - lastRefreshTime.current > 500) {
        lastRefreshTime.current = now;
        router.refresh();
      }
    };

    // 1. Setup Supabase Realtime Channels
    const channelName = `acc-auction-${seasonId}-${Math.random().toString(36).substring(2, 7)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'auction_lots',
          filter: `season_id=eq.${seasonId}`,
        },
        () => {
          triggerRefresh();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'auction_events',
          filter: `season_id=eq.${seasonId}`,
        },
        () => {
          triggerRefresh();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'season_config',
          filter: `season_id=eq.${seasonId}`,
        },
        () => {
          triggerRefresh();
        }
      )
      .subscribe();

    // 2. Periodic heartbeat fallback (guarantees synchronization across background tabs or proxy delays)
    const interval = setInterval(() => {
      triggerRefresh();
    }, fallbackIntervalMs);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [seasonId, router, fallbackIntervalMs]);

  return null;
}
