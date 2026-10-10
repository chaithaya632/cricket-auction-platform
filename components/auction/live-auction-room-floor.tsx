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
import { finalizeExpiredLotAction } from '@/lib/auction/actions';
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

  // Single authoritative owner for Guest Draw completion:
  // pendingGuestDrawLotRef stores the incoming lot while GuestDrawRevealOverlay displays.
  // When the overlay completes its 3,000 ms lifecycle, onTransitionComplete triggers setActiveLot.
  const pendingGuestDrawLotRef = React.useRef<AuctionLotWithDetails | null>(null);
  const guestDrawFallbackTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleGuestDrawTransitionComplete = React.useCallback(() => {
    if (guestDrawFallbackTimerRef.current) {
      clearTimeout(guestDrawFallbackTimerRef.current);
      guestDrawFallbackTimerRef.current = null;
    }
    if (pendingGuestDrawLotRef.current) {
      setActiveLot(pendingGuestDrawLotRef.current);
      pendingGuestDrawLotRef.current = null;
    }
  }, []);

  const activeLotRef = React.useRef<AuctionLotWithDetails | null>(activeLot);
  useEffect(() => {
    activeLotRef.current = activeLot;
  }, [activeLot]);

  const terminalOutcomeRef = React.useRef<{ lotId: string; status: 'sold' | 'unsold'; timestamp: number } | null>(null);
  const pendingNextLotTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (guestDrawFallbackTimerRef.current) {
        clearTimeout(guestDrawFallbackTimerRef.current);
      }
      if (pendingNextLotTimerRef.current) {
        clearTimeout(pendingNextLotTimerRef.current);
      }
    };
  }, []);

  const hasTriggeredExpiryRef = React.useRef<string | null>(null);
  const handleTimerExpireRef = React.useRef<() => Promise<void>>(() => Promise.resolve());

  const handleTimerExpire = React.useCallback(async () => {
    const currentLot = activeLotRef.current;
    if (!currentLot || currentLot.status !== 'in_progress' || sessionState.isPaused || !sessionState.isLive) {
      return;
    }
    if (hasTriggeredExpiryRef.current === currentLot.id) {
      return;
    }
    hasTriggeredExpiryRef.current = currentLot.id;

    try {
      const res = await finalizeExpiredLotAction(currentLot.id, seasonId);
      if (!res?.success) {
        // If transient rejection (clock skew / retryable), allow retry after 1s
        setTimeout(() => {
          if (
            hasTriggeredExpiryRef.current === currentLot.id &&
            activeLotRef.current?.id === currentLot.id &&
            activeLotRef.current?.status === 'in_progress'
          ) {
            hasTriggeredExpiryRef.current = null;
            void handleTimerExpireRef.current();
          }
        }, 1000);
      }
    } catch (err: any) {
      console.error('[LiveFloor] Auto-finalization error:', err);
      setTimeout(() => {
        if (
          hasTriggeredExpiryRef.current === currentLot.id &&
          activeLotRef.current?.id === currentLot.id &&
          activeLotRef.current?.status === 'in_progress'
        ) {
          hasTriggeredExpiryRef.current = null;
          void handleTimerExpireRef.current();
        }
      }, 1000);
    }
  }, [sessionState.isPaused, sessionState.isLive, seasonId]);

  handleTimerExpireRef.current = handleTimerExpire;

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
      } else if (
        (prev.status === 'sold' || prev.status === 'unsold' || terminalOutcomeRef.current?.lotId === prev.id) &&
        initialActiveLot.id !== prev.id
      ) {
        // Hold the sold/unsold presentation for 2200ms before accepting next lot from RSC refresh
        if (!pendingNextLotTimerRef.current) {
          pendingNextLotTimerRef.current = setTimeout(() => {
            setActiveLot(initialActiveLot);
            pendingNextLotTimerRef.current = null;
          }, 2200);
        }
        return prev;
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
        const nextLot = payload.activeLot as AuctionLotWithDetails | null;
        if (payload.isGuestDraw && nextLot) {
          pendingGuestDrawLotRef.current = nextLot;
          if (guestDrawFallbackTimerRef.current) {
            clearTimeout(guestDrawFallbackTimerRef.current);
          }
          guestDrawFallbackTimerRef.current = setTimeout(() => {
            if (pendingGuestDrawLotRef.current) {
              setActiveLot(pendingGuestDrawLotRef.current);
              pendingGuestDrawLotRef.current = null;
            }
          }, 3500);
        } else {
          const currentLot = activeLotRef.current;
          const isCurrentTerminal =
            currentLot &&
            (currentLot.status === 'sold' ||
              currentLot.status === 'unsold' ||
              terminalOutcomeRef.current?.lotId === currentLot.id);

          if (isCurrentTerminal && nextLot && nextLot.id !== currentLot.id) {
            if (pendingNextLotTimerRef.current) {
              clearTimeout(pendingNextLotTimerRef.current);
            }
            pendingNextLotTimerRef.current = setTimeout(() => {
              setActiveLot(nextLot);
              pendingNextLotTimerRef.current = null;
            }, 2200);
          } else if (nextLot) {
            setActiveLot(nextLot);
          } else if (payload.isEmptyFloor) {
            setActiveLot(null);
          }
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
        if (payload.lotId) {
          terminalOutcomeRef.current = { lotId: payload.lotId, status: 'sold', timestamp: Date.now() };
        }
        setActiveLot((prev) => {
          if (!prev || (payload.lotId && prev.id !== payload.lotId)) return prev;
          return {
            ...prev,
            status: 'sold',
            current_price: payload.currentPrice ?? prev.current_price,
            highest_bidder_franchise_id: payload.highestBidderId ?? prev.highest_bidder_franchise_id,
            highest_bidder: payload.highestBidderId
              ? {
                  id: payload.highestBidderId,
                  name: payload.highestBidderName || prev.highest_bidder?.name || 'Franchise',
                  short_name: payload.highestBidderShortName || prev.highest_bidder?.short_name || '',
                  primary_color: payload.highestBidderPrimaryColor || prev.highest_bidder?.primary_color || '#10b981',
                  secondary_color: null,
                }
              : prev.highest_bidder,
          };
        });
      } else if (payload.type === 'UNSOLD') {
        if (payload.lotId) {
          terminalOutcomeRef.current = { lotId: payload.lotId, status: 'unsold', timestamp: Date.now() };
        }
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
      <GuestDrawRevealOverlay
        seasonId={seasonId}
        currentLot={activeLot}
        onTransitionComplete={handleGuestDrawTransitionComplete}
      />

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
            onExpire={handleTimerExpire}
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
