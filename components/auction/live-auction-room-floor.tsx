'use client';

// =============================================================================
// ACC Auction Portal — Components: Public Live Auction Room Floor
// =============================================================================
// Coordinates instant sub-20ms floor updates on the Public Live Auction room
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
import type { BucketScarcityReport } from '@/domain/scarcity';

interface LiveAuctionRoomFloorProps {
  seasonId: string;
  initialActiveLot: AuctionLotWithDetails | null;
  initialSessionState: AuctionSessionState;
  config: AuctionConfigDTO;
  scarcityReport?: BucketScarcityReport | null;
  franchiseBiddingData: any | null;
}

export function LiveAuctionRoomFloor({
  seasonId,
  initialActiveLot,
  initialSessionState,
  config,
  scarcityReport = null,
  franchiseBiddingData,
}: LiveAuctionRoomFloorProps) {
  const [activeLot, setActiveLot] = useState<AuctionLotWithDetails | null>(initialActiveLot);
  const [sessionState, setSessionState] = useState<AuctionSessionState>(initialSessionState);

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
      if (prev.isCompleted && !initialSessionState.isCompleted) {
        return prev;
      }
      return initialSessionState;
    });
  }, [initialSessionState]);

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
        if (payload.activeLot) {
          setActiveLot(payload.activeLot as AuctionLotWithDetails);
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
    <div className="lg:col-span-8 space-y-6">
      {/* Cinematic Guest Draw Reveal Popup (§Feature 1) */}
      <GuestDrawRevealOverlay seasonId={seasonId} currentLot={activeLot} />

      {scarcityReport?.isWarningActive && (
        <div className="rounded-2xl border-2 border-amber-500 bg-amber-950/80 px-5 py-3.5 text-center shadow-lg animate-pulse">
          <p className="text-amber-300 font-bold text-sm">
            ⚠️ SCARCITY WARNING: Only {scarcityReport.unsoldSupply} player(s) remaining for {scarcityReport.totalPlayersNeeded} needed slots across franchises in Bucket {scarcityReport.bucket}!
          </p>
          <p className="text-[11px] text-amber-200/70 mt-0.5">
            Bidding is not blocked. Teams with quotas met may still place bids.
          </p>
        </div>
      )}

      <ActiveLotCard lot={activeLot} />

      {/* Countdown Clock */}
      {activeLot && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-lg">
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

      {/* Bidding Controls (Franchises Only) or Spectator Banner */}
      {franchiseBiddingData ? (
        <BiddingControl
          lot={activeLot}
          franchise={franchiseBiddingData}
        />
      ) : (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 text-center text-xs text-zinc-400 space-y-1">
          <p className="font-semibold text-zinc-300">Audience Spectator Mode</p>
          <p className="text-zinc-500">
            You are observing live bidding. Bids may only be submitted by verified
            franchise representatives.
          </p>
        </div>
      )}
    </div>
  );
}
