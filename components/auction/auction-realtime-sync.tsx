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
  fallbackIntervalMs = 1500,
}: AuctionRealtimeSyncProps) {
  const router = useRouter();
  const lastRefreshTime = useRef<number>(Date.now());

  useEffect(() => {
    if (!seasonId) return;

    const supabase = createClient();
    let debounceTimer: NodeJS.Timeout | null = null;
    const DEBOUNCE_MS = 250;

    const triggerRefresh = () => {
      const now = Date.now();
      const elapsed = now - lastRefreshTime.current;

      if (elapsed > DEBOUNCE_MS) {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
        lastRefreshTime.current = now;
        router.refresh();
      } else {
        // Trailing debounce: ensures rapid events arriving within debounce window are never lost
        if (!debounceTimer) {
          debounceTimer = setTimeout(() => {
            debounceTimer = null;
            lastRefreshTime.current = Date.now();
            router.refresh();
          }, DEBOUNCE_MS - elapsed);
        }
      }
    };

    // 1. Setup Supabase Realtime Channel (shared deterministic channel across all clients for this season)
    const channelName = `acc-auction-${seasonId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'broadcast',
        { event: 'auction_update' },
        () => {
          triggerRefresh();
        }
      )
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
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [seasonId, router, fallbackIntervalMs]);

  return null;
}
