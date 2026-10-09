'use client';

// =============================================================================
// ACC Auction Portal — Components: Franchise Auction Floor Coordinator
// =============================================================================
// Coordinates instant sub-20ms floor updates on the Franchise bidding console
// across ActiveLotCard, AuctionTimer, and BiddingControl via Supabase Broadcast
// delta events, eliminating multi-second delays from background RSC re-renders.
// =============================================================================

import React, { useState, useEffect } from 'react';
import { ActiveLotCard } from '@/components/auction/active-lot-card';
import { AuctionTimer } from '@/components/auction/auction-timer';
import { BiddingControl } from '@/components/auction/bidding-control';
import { GuestDrawRevealOverlay } from '@/components/auction/guest-draw-reveal-overlay';
import {
  subscribeAuctionDelta,
  isLocalActionEchoWindowActive,
} from '@/components/auction/auction-realtime-sync';
import type {
  AuctionLotWithDetails,
  AuctionSessionState,
  AuctionConfigDTO,
} from '@/lib/auction/types';

export interface FranchiseBiddingData {
  id: string;
  name: string;
  shortName: string;
  remainingPurse: number;
  squadCount: number;
  maxSquadSize: number;
  maxPermissibleBid: number;
}

interface FranchiseAuctionFloorProps {
  seasonId: string;
  initialActiveLot: AuctionLotWithDetails | null;
  initialSessionState: AuctionSessionState;
  franchise: FranchiseBiddingData | null;
  config: AuctionConfigDTO;
}

export function FranchiseAuctionFloor({
  seasonId,
  initialActiveLot,
  initialSessionState,
  franchise,
  config,
}: FranchiseAuctionFloorProps) {
  const [activeLot, setActiveLot] = useState<AuctionLotWithDetails | null>(initialActiveLot);
  const [sessionState, setSessionState] = useState<AuctionSessionState>(initialSessionState);
  const [franchiseData, setFranchiseData] = useState<FranchiseBiddingData | null>(franchise);

  // Anti-stale sequence tracking ref
  const lastAuthoritativeSequenceRef = React.useRef<number>(0);

  // Sync from server RSC props if no local action is in flight, guarded against stale RSC regressions
  useEffect(() => {
    if (isLocalActionEchoWindowActive()) return;

    setActiveLot((prev) => {
      // Authoritative Floor Rule: When auction session is completed, the floor is unconditionally cleared
      if (sessionState.isCompleted || sessionState.status === 'completed') {
        return null;
      }
      if (!prev) return initialActiveLot;
      if (!initialActiveLot) return prev;
      // If same lot, never let a stale RSC payload downgrade price or regress sold/unsold status
      if (prev.id === initialActiveLot.id) {
        if (
          prev.current_price !== null &&
          (initialActiveLot.current_price === null || initialActiveLot.current_price < prev.current_price)
        ) {
          return prev;
        }
        if (
          (prev.status === 'sold' || prev.status === 'unsold') &&
          initialActiveLot.status === 'in_progress'
        ) {
          return prev;
        }
      }
      return initialActiveLot;
    });
  }, [initialActiveLot, sessionState.isCompleted, sessionState.status]);

  useEffect(() => {
    if (isLocalActionEchoWindowActive()) return;

    setSessionState((prev) => {
      // If in-memory state is completed, ignore older live RSC snapshots
      if (prev.isCompleted && !initialSessionState.isCompleted) {
        return prev;
      }
      return initialSessionState;
    });
  }, [initialSessionState]);

  useEffect(() => {
    if (!isLocalActionEchoWindowActive()) {
      setFranchiseData(franchise);
    }
  }, [franchise]);

  // Subscribe to instantaneous broadcast deltas
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
      } else if (payload.type === 'PLAYER_SELECTED') {
        const nextLot = payload.activeLot as AuctionLotWithDetails | null;
        if (
          activeLot &&
          (activeLot.status === 'sold' || activeLot.status === 'unsold') &&
          nextLot &&
          nextLot.id !== activeLot.id
        ) {
          setTimeout(() => {
            setActiveLot(nextLot);
          }, 2200);
        } else if (nextLot) {
          setActiveLot(nextLot);
        } else if (payload.isEmptyFloor) {
          setActiveLot(null);
        }
        if (payload.isPaused !== undefined) {
          setSessionState((prev) => ({
            ...prev,
            isPaused: Boolean(payload.isPaused),
            status: payload.isPaused ? 'paused' : 'live',
            pausedRemainingSeconds: payload.pausedRemainingSeconds ?? prev.pausedRemainingSeconds,
          }));
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
        setSessionState((prev) => ({
          ...prev,
          isLive: false,
          isCompleted: true,
          status: 'completed',
        }));
        setActiveLot(null); // Authoritative Floor Rule: floor is cleared
      } else if (payload.type === 'AUCTION_STARTED') {
        setSessionState((prev) => ({
          ...prev,
          status: 'live',
          isLive: true,
          isNotStarted: false,
          isCompleted: false,
          isPaused: false,
          startedAt: payload.startedAt || prev.startedAt,
        }));
        if (payload.activeLot) {
          setActiveLot(payload.activeLot as AuctionLotWithDetails);
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

  return (
    <div className="space-y-6">
      <ActiveLotCard lot={activeLot} />

      {activeLot && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-lg">
          <AuctionTimer
            key={activeLot.id}
            startedAt={activeLot.started_at}
            durationSeconds={timerDuration}
            isActive={activeLot.status === 'in_progress' && sessionState.isLive}
            isPaused={sessionState.isPaused}
            pausedRemainingSeconds={sessionState.pausedRemainingSeconds}
            lotId={activeLot.id}
            highestBidderId={activeLot.highest_bidder_franchise_id}
            size="md"
          />
        </div>
      )}

      {franchiseData && (
        <BiddingControl lot={activeLot} franchise={franchiseData} />
      )}

      {/* Official Guest Draw Reveal Popup Overlay */}
      <GuestDrawRevealOverlay seasonId={seasonId} currentLot={activeLot} />
    </div>
  );
}
