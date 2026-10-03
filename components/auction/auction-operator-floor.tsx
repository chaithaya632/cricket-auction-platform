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
import { subscribeAuctionDelta } from '@/components/auction/auction-realtime-sync';

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
  bucketStats,
  config,
}: AuctionOperatorFloorProps) {
  const [activeLot, setActiveLot] = useState<AuctionLotWithDetails | null>(initialActiveLot);
  const [sessionState, setSessionState] = useState<AuctionSessionState>(initialSessionState);
  const [upcomingLots, setUpcomingLots] = useState<AuctionLotWithDetails[]>(initialUpcomingLots);

  // Synchronize with background RSC refreshes when new server data arrives
  useEffect(() => {
    setActiveLot(initialActiveLot);
  }, [initialActiveLot]);

  useEffect(() => {
    setSessionState(initialSessionState);
  }, [initialSessionState]);

  useEffect(() => {
    setUpcomingLots(initialUpcomingLots);
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
            };
          });
        }
      } else if (payload.type === 'PAUSE') {
        setSessionState((prev) => ({ ...prev, isPaused: true }));
      } else if (payload.type === 'RESUME') {
        setSessionState((prev) => ({ ...prev, isPaused: false }));
      } else if (payload.type === 'AUCTION_ENDED') {
        setSessionState((prev) => ({ ...prev, isLive: false, isCompleted: true }));
        setActiveLot(null);
      } else if (payload.type === 'AUCTION_STARTED' || payload.type === 'AUCTION_RESTARTED') {
        setSessionState((prev) => ({
          ...prev,
          isLive: true,
          isNotStarted: false,
          isCompleted: false,
          isPaused: false,
        }));
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
      }
    });
  }, [activeLot?.id]);

  const timerDuration = activeLot?.highest_bidder_franchise_id
    ? config.subsequentBidTimerSeconds
    : config.firstBidTimerSeconds;

  return (
    <div className="space-y-6">
      {/* Active Lot Display */}
      <ActiveLotCard lot={activeLot} isAdmin={true} />

      {/* Countdown Timer */}
      {activeLot && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-lg">
          <AuctionTimer
            startedAt={activeLot.started_at}
            durationSeconds={timerDuration}
            isActive={activeLot.status === 'in_progress' && sessionState.isLive}
            isPaused={sessionState.isPaused}
            pausedRemainingSeconds={sessionState.pausedRemainingSeconds}
            showControls={true}
            size="md"
          />
        </div>
      )}

      {/* Unified Operator Controls & Queue */}
      <OperatorControls
        seasonId={seasonId}
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
        bucketStats={bucketStats}
        onActiveLotChange={setActiveLot}
        onSessionStateChange={setSessionState}
      />
    </div>
  );
}
