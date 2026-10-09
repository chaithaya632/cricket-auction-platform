'use client';

// =============================================================================
// ACC Match System — Client Realtime Broadcast Sync Component
// =============================================================================
// Listens for Supabase Realtime Broadcast notifications on `acc-match-${matchId}`.
// Reuses the proven auction refresh-coalescing coordinator:
//   - coalesceMs: 80ms (trailing debouncing)
//   - inFlightWindowMs: 150ms (prevents overlapping router.refresh storms)
//   - Fallback heartbeat polling only when channel status is not SUBSCRIBED
// =============================================================================

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  createRealtimeRefreshCoordinator,
  type RealtimeChannelHealth,
} from '@/components/auction/auction-realtime-sync';

interface MatchRealtimeSyncProps {
  matchId: string;
  fallbackIntervalMs?: number;
}

export function MatchRealtimeSync({
  matchId,
  fallbackIntervalMs = 5000,
}: MatchRealtimeSyncProps) {
  const router = useRouter();

  useEffect(() => {
    if (!matchId) return;

    const supabase = createClient();
    const coordinator = createRealtimeRefreshCoordinator({
      onRefresh: () => {
        router.refresh();
      },
      coalesceMs: 80,
      inFlightWindowMs: 150,
    });

    const channelName = `acc-match-${matchId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'broadcast',
        { event: 'match_update' },
        () => {
          coordinator.handleRealtimeEvent();
        }
      )
      .subscribe((status: any) => {
        if (
          status === 'SUBSCRIBED' ||
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          coordinator.setChannelStatus(status as RealtimeChannelHealth);
        }
      });

    // Fallback recovery heartbeat: only triggers a refresh when Realtime is NOT 'SUBSCRIBED'
    const interval = setInterval(() => {
      coordinator.handleHeartbeatTick();
    }, fallbackIntervalMs);

    return () => {
      clearInterval(interval);
      coordinator.dispose();
      supabase.removeChannel(channel);
    };
  }, [matchId, router, fallbackIntervalMs]);

  return null;
}
