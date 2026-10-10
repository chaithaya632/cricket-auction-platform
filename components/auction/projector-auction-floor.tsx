'use client';

// =============================================================================
// ACC Auction Portal — Components: Auditorium Projector Auction Floor
// =============================================================================
// Coordinates instant sub-20ms floor updates on the Auditorium Projector view
// across ActiveLotCard, AuctionTimer, and session state centerpieces via Supabase
// Broadcast delta events, eliminating multi-second delays from background RSC re-renders.
// =============================================================================

import React, { useState, useEffect } from 'react';
import { ActiveLotCard } from '@/components/auction/active-lot-card';
import { AuctionTimer } from '@/components/auction/auction-timer';
import { ProjectorGroupSelector } from '@/components/auction/projector-group-selector';
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

interface ProjectorAuctionFloorProps {
  seasonId: string;
  initialActiveLot: AuctionLotWithDetails | null;
  initialSessionState: AuctionSessionState;
  config: AuctionConfigDTO;
  scarcityReport?: BucketScarcityReport | null;
  activeBuckets?: string[];
  completedBuckets?: string[];
  bucketStats?: Record<string, { pending: number; total: number; inProgress: boolean }>;
  canControl?: boolean;
}

export function ProjectorAuctionFloor({
  seasonId,
  initialActiveLot,
  initialSessionState,
  config,
  scarcityReport = null,
  activeBuckets = [],
  completedBuckets = [],
  bucketStats,
  canControl = false,
}: ProjectorAuctionFloorProps) {
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
      console.error('[ProjectorFloor] Auto-finalization error:', err);
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

  const activeBucketsPendingTotal = activeBuckets.reduce(
    (acc, b) => acc + (bucketStats?.[b]?.pending ?? 0),
    0
  );
  const hasLiveLot = activeLot?.status === 'in_progress';
  const isBucketGroupComplete =
    sessionState.isLive &&
    !hasLiveLot &&
    activeBuckets.length > 0 &&
    activeBucketsPendingTotal === 0;

  const timerDuration = activeLot?.highest_bidder_franchise_id
    ? config.subsequentBidTimerSeconds
    : config.firstBidTimerSeconds;

  return (
    <div className="my-8 max-w-6xl mx-auto w-full space-y-8">
      {/* Cinematic Guest Draw Reveal Popup (§Feature 1) */}
      <GuestDrawRevealOverlay
        seasonId={seasonId}
        currentLot={activeLot}
        onTransitionComplete={handleGuestDrawTransitionComplete}
      />

      {sessionState.isCompleted ? (
        <div className="rounded-3xl border-2 border-blue-500/30 bg-gradient-to-b from-blue-950/40 via-zinc-950 to-zinc-950 p-12 text-center space-y-4 shadow-2xl max-w-4xl mx-auto">
          <div className="size-16 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/40 flex items-center justify-center mx-auto text-2xl font-bold">
            ✓
          </div>
          <h2 className="text-3xl md:text-4xl font-black text-white uppercase tracking-wider">
            Official Auction Session Completed
          </h2>
          <p className="text-sm md:text-base text-zinc-400 max-w-md mx-auto">
            The auction floor is officially closed. Final rosters and squad distributions are preserved in the auction records.
          </p>
        </div>
      ) : sessionState.isNotStarted && !activeLot ? (
        <div className="rounded-3xl border-2 border-dashed border-zinc-800 bg-zinc-950/80 p-12 text-center space-y-3">
          <h2 className="text-2xl font-bold text-zinc-300">Auction Floor On Standby</h2>
          <p className="text-sm text-zinc-500 max-w-lg mx-auto">
            The stage is configured and waiting for the official auction session opening from the operator console.
          </p>
        </div>
      ) : isBucketGroupComplete ? (
        canControl ? (
          <ProjectorGroupSelector
            activeBuckets={activeBuckets}
            completedBuckets={completedBuckets}
            bucketStats={bucketStats || {}}
          />
        ) : (
          <div className="rounded-3xl border-2 border-emerald-500/50 bg-gradient-to-b from-emerald-950/50 via-zinc-950 to-zinc-950 p-8 md:p-12 text-center space-y-6 shadow-2xl max-w-4xl mx-auto">
            <div className="space-y-3">
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                <span>✓</span>
                <span>CURRENT BUCKET GROUP COMPLETE</span>
              </span>
              <h2 className="text-3xl md:text-4xl font-black text-white">All Lots in Active Group Concluded</h2>
              <p className="text-base text-zinc-300 max-w-lg mx-auto">
                Preparing Next Auction Group... Next buckets will be selected by the auction operator.
              </p>
              {completedBuckets.length > 0 && (
                <div className="flex flex-wrap items-center justify-center gap-2 pt-4">
                  <span className="text-xs uppercase font-bold tracking-wider text-zinc-500 mr-2">
                    Completed:
                  </span>
                  {completedBuckets.map((b) => (
                    <span
                      key={b}
                      className="px-3 py-1 rounded-lg text-xs font-mono font-bold bg-zinc-900 border border-zinc-800 text-zinc-500 line-through"
                    >
                      Bucket {b}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      ) : (
        <>
          {scarcityReport?.isWarningActive && (
            <div className="rounded-2xl border-2 border-amber-500 bg-amber-950/80 px-6 py-4 text-center shadow-2xl animate-pulse">
              <p className="text-amber-300 font-black text-lg uppercase tracking-wider">
                ⚠️ SCARCITY WARNING: Only {scarcityReport.unsoldSupply} player(s) remaining for {scarcityReport.totalPlayersNeeded} needed slots across franchises in Bucket {scarcityReport.bucket}!
              </p>
              <p className="text-xs text-amber-200/80 mt-1">
                Free-market bidding remains open. Franchises with satisfied quotas may continue bidding.
              </p>
            </div>
          )}

          <ActiveLotCard lot={activeLot} size="projector" />

          {activeLot && (
            <div className="rounded-3xl border border-zinc-800 bg-zinc-950/90 p-8 shadow-2xl">
              <AuctionTimer
                key={activeLot.id}
                startedAt={activeLot.started_at}
                durationSeconds={timerDuration}
                isActive={activeLot.status === 'in_progress' && sessionState.isLive}
                isPaused={sessionState.isPaused}
                pausedRemainingSeconds={sessionState.pausedRemainingSeconds}
                lotId={activeLot.id}
                highestBidderId={activeLot.highest_bidder_franchise_id}
                size="lg"
                onExpire={handleTimerExpire}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
