'use client';

// =============================================================================
// ACC Auction Portal — Components: Instant Auction Operator Floor
// =============================================================================
// Coordinates instant sub-50ms UI updates across ActiveLotCard, AuctionTimer,
// and OperatorControls using authoritative server action returns and delta sync,
// preventing multi-second delays caused by full RSC tree revalidations.
// =============================================================================

import React, { useState, useEffect } from 'react';
import { ActiveLotCard } from '@/components/auction/active-lot-card';
import { AuctionTimer } from '@/components/auction/auction-timer';
import {
  OperatorControls,
  type OperatorSoldLotItem,
  type OperatorRecoveryLotItem,
  type OperatorFranchiseOption,
} from '@/components/auction/operator-controls';
import type {
  AuctionLotWithDetails,
  AuctionSessionState,
  AuctionConfigDTO,
} from '@/lib/auction/types';
import type { BucketScarcityReport } from '@/domain/scarcity';
import {
  subscribeAuctionDelta,
  runWithLocalActionTracking,
  isLocalActionEchoWindowActive,
} from '@/components/auction/auction-realtime-sync';
import {
  extendTimerAction,
  confirmSaleAction,
  markUnsoldAction,
} from '@/lib/auction/actions';
import { toast } from 'sonner';

export interface AuctionOperatorFloorProps {
  seasonId?: string;
  initialActiveLot: AuctionLotWithDetails | null;
  initialUpcomingLots: AuctionLotWithDetails[];
  initialUnsoldLots?: AuctionLotWithDetails[];
  lastSoldLotId?: string | null;
  soldLots?: OperatorSoldLotItem[];
  franchises?: OperatorFranchiseOption[];
  initialSessionState: AuctionSessionState;
  isSuperAdmin?: boolean;
  scarcityReport?: BucketScarcityReport | null;
  recoveryLots?: OperatorRecoveryLotItem[];
  initialActiveBuckets?: string[];
  completedBuckets?: string[];
  bucketStats?: Record<string, { pending: number; total: number; inProgress: boolean }>;
  config: AuctionConfigDTO;
}

export function AuctionOperatorFloor({
  seasonId,
  initialActiveLot,
  initialUpcomingLots,
  initialUnsoldLots = [],
  lastSoldLotId,
  soldLots = [],
  franchises = [],
  initialSessionState,
  isSuperAdmin = false,
  scarcityReport = null,
  recoveryLots = [],
  initialActiveBuckets,
  completedBuckets = [],
  bucketStats,
  config,
}: AuctionOperatorFloorProps) {
  const [activeLot, setActiveLot] = useState<AuctionLotWithDetails | null>(initialActiveLot);
  const [sessionState, setSessionState] = useState<AuctionSessionState>(initialSessionState);
  const [upcomingLots, setUpcomingLots] = useState<AuctionLotWithDetails[]>(initialUpcomingLots);

  // Synchronize with background RSC refreshes when new server data arrives (except during local action window)
  useEffect(() => {
    if (!isLocalActionEchoWindowActive()) {
      setActiveLot(initialActiveLot);
    }
  }, [initialActiveLot]);

  useEffect(() => {
    if (!isLocalActionEchoWindowActive()) {
      setSessionState(initialSessionState);
    }
  }, [initialSessionState]);

  useEffect(() => {
    if (!isLocalActionEchoWindowActive()) {
      setUpcomingLots(initialUpcomingLots);
    }
  }, [initialUpcomingLots]);

  // Synchronize with Realtime deltas across browsers and spectator consoles
  useEffect(() => {
    return subscribeAuctionDelta((payload) => {
      if (payload.type === 'BID_PLACED') {
        if (payload.lotId && (!activeLot || activeLot.id === payload.lotId)) {
          setActiveLot((prev) => {
            if (!prev || prev.id !== payload.lotId) return prev;
            return {
              ...prev,
              current_price: payload.currentPrice ?? prev.current_price,
              highest_bidder_franchise_id:
                payload.highestBidderId ?? prev.highest_bidder_franchise_id,
              highest_bidder: payload.highestBidderId
                ? {
                    id: payload.highestBidderId,
                    name: payload.highestBidderName || 'Franchise',
                    short_name: payload.highestBidderShortName || '',
                    primary_color: payload.highestBidderPrimaryColor || '#10b981',
                    secondary_color: null,
                  }
                : prev.highest_bidder,
              started_at: payload.startedAt || prev.started_at,
            };
          });
        }
      } else if (payload.type === 'PAUSE') {
        setSessionState((prev) => ({
          ...prev,
          isPaused: true,
          status: 'paused',
          pausedRemainingSeconds: payload.remainingSeconds ?? prev.pausedRemainingSeconds,
        }));
      } else if (payload.type === 'RESUME') {
        setSessionState((prev) => ({
          ...prev,
          isPaused: false,
          status: 'live',
          pausedRemainingSeconds: null,
        }));
        if (payload.startedAt) {
          setActiveLot((prev) => (prev ? { ...prev, started_at: payload.startedAt! } : prev));
        }
      } else if (payload.type === 'AUCTION_ENDED') {
        setSessionState((prev) => ({ ...prev, isLive: false, isCompleted: true, status: 'completed' }));
        setActiveLot(null);
      } else if (payload.type === 'AUCTION_STARTED' || payload.type === 'AUCTION_RESTARTED') {
        setSessionState((prev) => ({
          ...prev,
          status: 'live',
          isLive: true,
          isNotStarted: false,
          isCompleted: false,
          isPaused: false,
          startedAt: payload.startedAt || prev.startedAt,
        }));
        if (payload.lotId && payload.startedAt) {
          setActiveLot((prev) => (prev && prev.id === payload.lotId ? { ...prev, started_at: payload.startedAt! } : prev));
        }
      } else if (payload.type === 'SALE') {
        setActiveLot((prev) => {
          if (!prev || (payload.lotId && prev.id !== payload.lotId)) return prev;
          return { ...prev, status: 'sold' };
        });
      } else if (payload.type === 'UNSOLD') {
        setActiveLot((prev) => {
          if (!prev || (payload.lotId && prev.id !== payload.lotId)) return prev;
          return { ...prev, status: 'unsold' };
        });
      } else if (payload.type === 'PLAYER_SELECTED') {
        if (payload.activeLot) {
          setActiveLot(payload.activeLot as AuctionLotWithDetails);
          if (payload.lotId) {
            setUpcomingLots((prev) => prev.filter((l) => l.id !== payload.lotId));
          }
        } else if (payload.lotId) {
          setUpcomingLots((prev) => {
            const found = prev.find((l) => l.id === payload.lotId);
            if (found) {
              setActiveLot({
                ...found,
                status: 'in_progress',
                started_at: payload.startedAt || new Date().toISOString(),
                current_price: found.base_price,
                highest_bidder_franchise_id: null,
                highest_bidder: null,
              });
              return prev.filter((l) => l.id !== payload.lotId);
            }
            return prev;
          });
        }
        if (payload.isPaused !== undefined) {
          setSessionState((prev) => ({
            ...prev,
            isPaused: Boolean(payload.isPaused),
            status: payload.isPaused ? 'paused' : 'live',
            pausedRemainingSeconds: payload.pausedRemainingSeconds ?? prev.pausedRemainingSeconds,
          }));
        }
      } else if (payload.type === 'TIMER_EXTENDED') {
        if (payload.lotId && payload.startedAt) {
          setActiveLot((prev) => {
            if (!prev || prev.id !== payload.lotId) return prev;
            return { ...prev, started_at: payload.startedAt! };
          });
        }
      }
    });
  }, [activeLot?.id]);

  const timerDuration = activeLot?.highest_bidder_franchise_id
    ? config.subsequentBidTimerSeconds
    : config.firstBidTimerSeconds;

  const currentRemainingSecondsRef = React.useRef<number>(timerDuration);

  return (
    <div className="space-y-6">
      {/* Active Lot Display */}
      <ActiveLotCard lot={activeLot} isAdmin={true} />

      {/* Countdown Timer */}
      {activeLot && (
        <div className="rounded-2xl border-2 border-zinc-700/50 bg-zinc-900/90 p-8 shadow-xl">
          <AuctionTimer
            key={activeLot.id}
            startedAt={activeLot.started_at}
            durationSeconds={timerDuration}
            isActive={activeLot.status === 'in_progress' && sessionState.isLive}
            isPaused={sessionState.isPaused}
            pausedRemainingSeconds={sessionState.pausedRemainingSeconds}
            lotId={activeLot.id}
            highestBidderId={activeLot.highest_bidder_franchise_id}
            showControls={true}
            size="lg"
            onRemainingChange={(sec) => {
              currentRemainingSecondsRef.current = sec;
            }}
            onExtend={async (seconds) => {
              if (!activeLot) return;
              const prevStartedAt = activeLot.started_at;
              currentRemainingSecondsRef.current += seconds;

              // Optimistically update started_at so all visual displays adjust immediately (<250ms)
              const nowMs = Date.now();
              const optimisticStartedAt = new Date(
                nowMs - (timerDuration - currentRemainingSecondsRef.current) * 1000
              ).toISOString();
              setActiveLot((prev) =>
                prev ? { ...prev, started_at: optimisticStartedAt } : prev
              );

              const res = await runWithLocalActionTracking(() =>
                extendTimerAction(activeLot.id, seconds)
              );
              if (res.success && res.data?.startedAt) {
                setActiveLot((prev) =>
                  prev ? { ...prev, started_at: res.data!.startedAt } : prev
                );
              } else if (!res.success) {
                setActiveLot((prev) =>
                  prev ? { ...prev, started_at: prevStartedAt } : prev
                );
              }
            }}
            onEndLot={async () => {
              if (!activeLot) return;
              const prevActiveLot = activeLot;
              const prevSessionState = sessionState;

              if (activeLot.highest_bidder_franchise_id) {
                // Optimistic sold state immediately
                setActiveLot((prev) => (prev ? { ...prev, status: 'sold' } : prev));
                const res = await runWithLocalActionTracking(() =>
                  confirmSaleAction(activeLot.id)
                );
                if (res.success) {
                  if (res.data?.activeLot !== undefined) {
                    setActiveLot(res.data.activeLot);
                    if (res.data.activeLot) {
                      setUpcomingLots((prev) => prev.filter((l) => l.id !== res.data!.activeLot!.id));
                    }
                  }
                  if (res.data?.sessionState) setSessionState(res.data.sessionState);
                  if (res.data?.message) {
                    toast.info(res.data.message);
                  }
                } else {
                  setActiveLot(prevActiveLot);
                  setSessionState(prevSessionState);
                }
              } else {
                // Optimistic unsold state immediately
                setActiveLot((prev) => (prev ? { ...prev, status: 'unsold' } : prev));
                const res = await runWithLocalActionTracking(() =>
                  markUnsoldAction(activeLot.id)
                );
                if (res.success) {
                  if (res.data?.activeLot !== undefined) {
                    setActiveLot(res.data.activeLot);
                    if (res.data.activeLot) {
                      setUpcomingLots((prev) => prev.filter((l) => l.id !== res.data!.activeLot!.id));
                    }
                  }
                  if (res.data?.sessionState) setSessionState(res.data.sessionState);
                  if (res.data?.message) {
                    toast.info(res.data.message);
                  }
                } else {
                  setActiveLot(prevActiveLot);
                  setSessionState(prevSessionState);
                }
              }
            }}
          />
        </div>
      )}

      {/* Unified Operator Controls & Queue */}
      <OperatorControls
        seasonId={seasonId || sessionState.seasonId}
        activeLot={activeLot}
        upcomingLots={upcomingLots}
        unsoldLots={initialUnsoldLots}
        lastSoldLotId={lastSoldLotId}
        soldLots={soldLots}
        franchises={franchises}
        sessionState={sessionState}
        isSuperAdmin={isSuperAdmin}
        scarcityReport={scarcityReport}
        recoveryLots={recoveryLots}
        initialActiveBuckets={initialActiveBuckets}
        completedBuckets={completedBuckets}
        bucketStats={bucketStats}
        getCurrentRemaining={() => currentRemainingSecondsRef.current}
        onActiveLotChange={setActiveLot}
        onSessionStateChange={setSessionState}
      />
    </div>
  );
}
