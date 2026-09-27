'use client';

// =============================================================================
// ACC Auction Portal — Realtime Synchronization Hook & Component
// =============================================================================
// Synchronization model:
// - INITIATING BROWSER: Server Action -> DB transaction -> revalidatePath() ->
//   Server Action returns authoritative RSC payload -> browser commits tree.
// - OTHER BROWSERS: Supabase Realtime event -> short burst coalescing ->
//   single router.refresh() -> authoritative RSC state.
// - FALLBACK RECOVERY: Only refreshes on heartbeat when Realtime channel is
//   unavailable/degraded (not SUBSCRIBED), never polling unconditionally.
// =============================================================================

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export type RealtimeChannelHealth =
  | 'CONNECTING'
  | 'SUBSCRIBED'
  | 'CHANNEL_ERROR'
  | 'TIMED_OUT'
  | 'CLOSED';

// Per-tab in-flight action counter to prevent self-echo Realtime events from
// firing a competing router.refresh() while a local Server Action is actively
// in flight and returning its own revalidated RSC payload.
let activeLocalActionCount = 0;
const activeCoordinators = new Set<{
  notifyLocalActionStarted: () => void;
  notifyLocalActionCompleted: (didMutate: boolean) => void;
}>();

export function isLocalActionEchoWindowActive(): boolean {
  return activeLocalActionCount > 0;
}

export async function runWithLocalActionTracking<T extends { success: boolean }>(
  actionFn: () => Promise<T>
): Promise<T> {
  activeLocalActionCount += 1;
  for (const coord of activeCoordinators) {
    coord.notifyLocalActionStarted();
  }
  try {
    const result = await actionFn();
    const didMutate = Boolean(result && result.success);
    activeLocalActionCount = Math.max(0, activeLocalActionCount - 1);
    for (const coord of activeCoordinators) {
      coord.notifyLocalActionCompleted(didMutate);
    }
    return result;
  } catch (err) {
    activeLocalActionCount = Math.max(0, activeLocalActionCount - 1);
    for (const coord of activeCoordinators) {
      coord.notifyLocalActionCompleted(false);
    }
    throw err;
  }
}

export function resetLocalActionTrackingForTests(): void {
  activeLocalActionCount = 0;
  activeCoordinators.clear();
}

export interface RealtimeRefreshCoordinatorOptions {
  onRefresh: () => void;
  coalesceMs?: number;
  inFlightWindowMs?: number;
  now?: () => number;
  isLocalActionSuppressed?: () => boolean;
}

export interface RealtimeRefreshCoordinator {
  handleRealtimeEvent: () => void;
  handleHeartbeatTick: () => void;
  setChannelStatus: (status: RealtimeChannelHealth) => void;
  getChannelStatus: () => RealtimeChannelHealth;
  notifyLocalActionStarted: () => void;
  notifyLocalActionCompleted: (didMutate: boolean) => void;
  dispose: () => void;
}

export function createRealtimeRefreshCoordinator({
  onRefresh,
  coalesceMs = 80,
  inFlightWindowMs = 300,
  isLocalActionSuppressed,
}: RealtimeRefreshCoordinatorOptions): RealtimeRefreshCoordinator {
  const checkSuppressed = isLocalActionSuppressed ?? (() => isLocalActionEchoWindowActive());
  let channelStatus: RealtimeChannelHealth = 'CONNECTING';
  let coalesceTimer: ReturnType<typeof setTimeout> | null = null;
  let inFlightTimer: ReturnType<typeof setTimeout> | null = null;
  let isRefreshInFlight = false;
  let hasQueuedRefreshAfterInFlight = false;
  let sawEventDuringLocalAction = false;
  let isDisposed = false;

  const executeSingleRefresh = () => {
    if (isDisposed) return;

    if (checkSuppressed()) {
      sawEventDuringLocalAction = true;
      return;
    }

    if (isRefreshInFlight) {
      hasQueuedRefreshAfterInFlight = true;
      return;
    }

    isRefreshInFlight = true;
    hasQueuedRefreshAfterInFlight = false;
    onRefresh();

    if (inFlightTimer) {
      clearTimeout(inFlightTimer);
    }
    inFlightTimer = setTimeout(() => {
      inFlightTimer = null;
      isRefreshInFlight = false;
      if (hasQueuedRefreshAfterInFlight && !isDisposed) {
        hasQueuedRefreshAfterInFlight = false;
        executeSingleRefresh();
      }
    }, inFlightWindowMs);
  };

  const scheduleCoalescedRefresh = () => {
    if (isDisposed) return;

    if (checkSuppressed()) {
      sawEventDuringLocalAction = true;
      if (coalesceTimer) {
        clearTimeout(coalesceTimer);
        coalesceTimer = null;
      }
      return;
    }

    // Pure trailing burst coalescing: resets the short timer across multi-table
    // events (auction_lots, auction_events, season_config) so only ONE refresh fires.
    if (coalesceTimer) {
      clearTimeout(coalesceTimer);
    }
    coalesceTimer = setTimeout(() => {
      coalesceTimer = null;
      executeSingleRefresh();
    }, coalesceMs);
  };

  return {
    handleRealtimeEvent: () => {
      scheduleCoalescedRefresh();
    },
    handleHeartbeatTick: () => {
      if (isDisposed) return;
      // Do NOT poll while Realtime is healthy ('SUBSCRIBED')
      if (channelStatus === 'SUBSCRIBED') {
        return;
      }
      scheduleCoalescedRefresh();
    },
    setChannelStatus: (status: RealtimeChannelHealth) => {
      channelStatus = status;
    },
    getChannelStatus: () => channelStatus,
    notifyLocalActionStarted: () => {
      sawEventDuringLocalAction = false;
      if (coalesceTimer) {
        clearTimeout(coalesceTimer);
        coalesceTimer = null;
      }
    },
    notifyLocalActionCompleted: (didMutate: boolean) => {
      // If the local action failed (did not mutate) and a Realtime event arrived
      // while it was in flight, immediately schedule a refresh so the UI catches up.
      if (!didMutate && sawEventDuringLocalAction) {
        sawEventDuringLocalAction = false;
        scheduleCoalescedRefresh();
      } else {
        sawEventDuringLocalAction = false;
      }
    },
    dispose: () => {
      isDisposed = true;
      if (coalesceTimer) {
        clearTimeout(coalesceTimer);
        coalesceTimer = null;
      }
      if (inFlightTimer) {
        clearTimeout(inFlightTimer);
        inFlightTimer = null;
      }
    },
  };
}

interface AuctionRealtimeSyncProps {
  seasonId: string;
  fallbackIntervalMs?: number;
}

export function AuctionRealtimeSync({
  seasonId,
  fallbackIntervalMs = 5000,
}: AuctionRealtimeSyncProps) {
  const router = useRouter();

  useEffect(() => {
    if (!seasonId) return;

    const supabase = createClient();
    const coordinator = createRealtimeRefreshCoordinator({
      onRefresh: () => {
        router.refresh();
      },
    });

    activeCoordinators.add(coordinator);

    const channelName = `acc-auction-${seasonId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'broadcast',
        { event: 'auction_update' },
        () => {
          coordinator.handleRealtimeEvent();
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
          coordinator.handleRealtimeEvent();
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
          coordinator.handleRealtimeEvent();
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
          coordinator.handleRealtimeEvent();
        }
      )
      .subscribe((status) => {
        if (
          status === 'SUBSCRIBED' ||
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          coordinator.setChannelStatus(status);
        }
      });

    // Fallback recovery heartbeat: only triggers a refresh when Realtime is NOT 'SUBSCRIBED'
    const interval = setInterval(() => {
      coordinator.handleHeartbeatTick();
    }, fallbackIntervalMs);

    return () => {
      clearInterval(interval);
      activeCoordinators.delete(coordinator);
      coordinator.dispose();
      supabase.removeChannel(channel);
    };
  }, [seasonId, router, fallbackIntervalMs]);

  return null;
}
