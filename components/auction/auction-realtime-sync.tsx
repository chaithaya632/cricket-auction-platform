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
import type { AuctionBroadcastPayload } from '@/lib/auction/types';
import { playBidGavelChime } from '@/lib/auction/audio';

export type RealtimeChannelHealth =
  | 'CONNECTING'
  | 'SUBSCRIBED'
  | 'CHANNEL_ERROR'
  | 'TIMED_OUT'
  | 'CLOSED';

export type AuctionDeltaListener = (payload: AuctionBroadcastPayload) => void;
const deltaListeners = new Set<AuctionDeltaListener>();

// Monotonic event sequence tracker per season to eliminate stale / duplicate events
const latestSequences = new Map<string, number>();

export function getLatestSequence(seasonId: string): number {
  return latestSequences.get(seasonId) ?? 0;
}

export function setLatestSequence(seasonId: string, seq: number): void {
  latestSequences.set(seasonId, Math.max(latestSequences.get(seasonId) ?? 0, seq));
}

// Calibrated clock offset between server UTC and client local Date.now()
let serverClockOffsetMs = 0;
let hasServerClockSample = false;

export function getServerClockOffsetMs(): number {
  return serverClockOffsetMs;
}

export function getCalibratedNow(): number {
  return Date.now() + serverClockOffsetMs;
}

export function setServerClockOffsetForTests(offsetMs: number): void {
  serverClockOffsetMs = offsetMs;
  hasServerClockSample = true;
}

export function resetClockCalibrationForTests(): void {
  serverClockOffsetMs = 0;
  hasServerClockSample = false;
}

export function resetSequenceTrackingForTests(): void {
  latestSequences.clear();
  serverClockOffsetMs = 0;
  hasServerClockSample = false;
}

export function subscribeAuctionDelta(listener: AuctionDeltaListener): () => void {
  deltaListeners.add(listener);
  return () => {
    deltaListeners.delete(listener);
  };
}

export function notifyAuctionDelta(payload: AuctionBroadcastPayload): boolean {
  // 1. Monotonic sequence deduplication, ordering protection & gap detection
  if (payload.sequenceNumber !== undefined && payload.seasonId) {
    const seqNum =
      typeof payload.sequenceNumber === 'string'
        ? parseInt(payload.sequenceNumber, 10)
        : payload.sequenceNumber;

    if (!Number.isNaN(seqNum)) {
      const current = latestSequences.get(payload.seasonId) ?? 0;
      if (seqNum <= current && current > 0) {
        // Discard stale or duplicate event
        return false;
      }

      // Sequence gap detection: If current > 0 and seqNum > current + 1, one or more intermediate
      // broadcast packets were lost. Schedule a background reconciliation refresh immediately.
      if (current > 0 && seqNum > current + 1) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(
            `[RealtimeSync] Sequence gap detected: season ${payload.seasonId} jumped from ${current} to ${seqNum}. Scheduling background reconciliation.`
          );
        }
        for (const coord of activeCoordinators) {
          coord.handleRealtimeEvent?.();
        }
      }

      latestSequences.set(payload.seasonId, seqNum);
    }
  }

  // 2. Client latency telemetry & Server Clock Offset Calibration
  if (payload.serverTimestamp) {
    const serverTimeMs = new Date(payload.serverTimestamp).getTime();
    if (!Number.isNaN(serverTimeMs)) {
      const clientNow = Date.now();
      const currentOffset = serverTimeMs - clientNow;

      if (!hasServerClockSample) {
        serverClockOffsetMs = currentOffset;
        hasServerClockSample = true;
      } else {
        // Exponential moving average filter (alpha = 0.25) to smooth out transit jitter
        serverClockOffsetMs = Math.round(serverClockOffsetMs * 0.75 + currentOffset * 0.25);
      }

      const lagMs = clientNow + serverClockOffsetMs - serverTimeMs;
      if (lagMs >= 0 && lagMs < 60000) {
        if (process.env.NODE_ENV === 'development') {
          console.debug(
            `[RealtimeSync] Event ${payload.type} seq=${payload.sequenceNumber ?? 'N/A'} lag=${lagMs}ms clockOffset=${serverClockOffsetMs}ms`
          );
        }
      }
    }
  }

  // 3. Dispatch to all active delta listeners
  for (const listener of deltaListeners) {
    try {
      listener(payload);
    } catch (e) {
      console.error('[notifyAuctionDelta] Listener error:', e);
    }
  }

  return true;
}

// Per-tab in-flight action counter to prevent self-echo Realtime events from
// firing a competing router.refresh() while a local Server Action is actively
// in flight and returning its own revalidated RSC payload.
let activeLocalActionCount = 0;
const activeCoordinators = new Set<{
  notifyLocalActionStarted: () => void;
  notifyLocalActionCompleted: (didMutate: boolean) => void;
  handleRealtimeEvent?: () => void;
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
  inFlightWindowMs = 150,
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
      hasQueuedRefreshAfterInFlight = false;
      isRefreshInFlight = false;
      if (coalesceTimer) {
        clearTimeout(coalesceTimer);
        coalesceTimer = null;
      }
      if (inFlightTimer) {
        clearTimeout(inFlightTimer);
        inFlightTimer = null;
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
        (event: any) => {
          const payload = (event?.payload ?? event) as AuctionBroadcastPayload | undefined;
          let isAccepted = true;
          if (
            payload &&
            typeof payload === 'object' &&
            ('type' in payload || 'seasonId' in payload || 'sequenceNumber' in payload)
          ) {
            isAccepted = notifyAuctionDelta(payload);
            if (isAccepted && payload.type === 'BID_PLACED') {
              playBidGavelChime(payload.lotId, payload.currentPrice);
            }
          }
          if (isAccepted) {
            coordinator.handleRealtimeEvent();
          }
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
