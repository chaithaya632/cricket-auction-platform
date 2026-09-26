// =============================================================================
// ACC Auction Portal — Live Auction Room (/live)
// =============================================================================

import React from 'react';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/session';
import { getUserPermissionContext, getActiveSeason } from '@/lib/permissions/context';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getActiveLot,
  getRecentAuctionEvents,
  getSeasonAuctionConfig,
  getAuctionSessionState,
  getActiveLotScarcity,
  getAllFranchisesLiveSummary,
} from '@/lib/auction/queries';
import { getFranchiseSquadData } from '@/lib/franchises/queries';
import { ActiveLotCard } from '@/components/auction/active-lot-card';
import { AuctionTimer } from '@/components/auction/auction-timer';
import { BiddingControl } from '@/components/auction/bidding-control';
import { RecentActivityStream } from '@/components/auction/recent-activity-stream';
import { LiveExitBar } from '@/components/auction/live-exit-bar';
import { AuctionRealtimeSync } from '@/components/auction/auction-realtime-sync';
import { FranchiseLeaderboardTable } from '@/components/auction/franchise-status-bar';
import { AuctionSessionIndicator } from '@/components/acc/status-badges';

export default async function LiveAuctionPage() {
  const { appUser } = await getCurrentUser();
  const supabase = await createClient();
  const adminClient = createAdminClient();

  const userContext = appUser
    ? await getUserPermissionContext(supabase, appUser)
    : null;

  const activeSeason = userContext?.activeSeason || (await getActiveSeason(adminClient));
  const seasonId =
    activeSeason?.id || '00000000-0000-0000-0000-000000000001';

  // 1. Fetch auction room data & session state using adminClient to ensure public unauthenticated
  // visitors can read live projection data without being blocked by authenticated-only RLS
  const [activeLot, recentEvents, config, sessionState] = await Promise.all([
    getActiveLot(adminClient, seasonId),
    getRecentAuctionEvents(adminClient, seasonId, 20),
    getSeasonAuctionConfig(adminClient, seasonId),
    getAuctionSessionState(adminClient, seasonId),
  ]);

  const [scarcityReport, franchiseSummaries] = await Promise.all([
    activeLot?.bucket ? getActiveLotScarcity(adminClient, seasonId, activeLot.bucket) : null,
    getAllFranchisesLiveSummary(adminClient, seasonId, activeLot),
  ]);

  // 2. If user is an authorized franchise rep, load squad and max-bid state
  let franchiseBiddingData = null;
  if (userContext?.isFranchise && userContext.assignedFranchise) {
    const squadData = await getFranchiseSquadData(
      supabase,
      userContext.assignedFranchise.id,
      seasonId
    );

    if (squadData) {
      franchiseBiddingData = {
        id: userContext.assignedFranchise.id,
        name: userContext.assignedFranchise.name,
        shortName: userContext.assignedFranchise.short_name,
        remainingPurse: squadData.purseState.remainingPurse,
        squadCount: squadData.purseState.totalSquadCount,
        maxSquadSize: squadData.squadConstraints.vacantSlots + squadData.purseState.totalSquadCount,
        maxPermissibleBid: squadData.purseState.maxBidResult.maxBid,
      };
    }
  }

  const timerDuration = activeLot?.highest_bidder_franchise_id
    ? config.subsequentBidTimerSeconds
    : config.firstBidTimerSeconds;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AuctionRealtimeSync seasonId={seasonId} />
      {/* Top Persistent Exit Navigation Bar */}
      <LiveExitBar
        mode="live_room"
        destinationHref="/admin/auction"
        destinationLabel="Operator Console"
      />

      <div className="space-y-8 max-w-7xl mx-auto px-4 py-6">
        {/* Session Status Banners */}
        {sessionState.isNotStarted && (
          <div className="rounded-2xl border-2 border-dashed border-amber-500/40 bg-amber-500/10 p-6 text-center shadow-lg">
            <span className="inline-block rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-400 border border-amber-500/30 uppercase tracking-wider mb-2">
              AUCTION NOT STARTED
            </span>
            <h3 className="text-lg font-bold text-zinc-100">Waiting for Operator to Open Floor</h3>
            <p className="text-xs text-zinc-400 mt-1 max-w-md mx-auto leading-relaxed">
              The live bidding room is on standby. Real-time lots, countdown timers, and live bids will display automatically once the auction is started from the Operator Console.
            </p>
          </div>
        )}

        {sessionState.isPaused && (
          <div className="rounded-2xl border border-amber-500/50 bg-amber-950/40 p-4 text-center shadow-lg">
            <span className="text-xs font-black uppercase tracking-widest text-amber-400">
              ⏸ AUCTION PAUSED BY OPERATOR
            </span>
            <p className="text-xs text-zinc-400 mt-0.5">Floor activities and bidding are temporarily paused.</p>
          </div>
        )}

        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-5">
          <div className="flex items-center gap-3">
          <AuctionSessionIndicator status={sessionState.status} />
          <div>
            <h1 className="text-2xl font-black text-zinc-100 tracking-tight flex items-center gap-2">
              <span>ACC Live Auction</span>
              <span className="text-xs px-2.5 py-0.5 rounded-md bg-zinc-800 text-zinc-300 font-mono font-medium">
                {userContext?.activeSeason?.name || activeSeason?.name || 'ACC 2026'}
              </span>
            </h1>
            <p className="text-xs text-zinc-400">
              Real-time authoritative bidding room
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <Link
            href="/live/projector"
            target="_blank"
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold border border-zinc-700"
          >
            Projector View ↗
          </Link>
          {userContext?.isAdmin && (
            <Link
              href="/admin/auction"
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold shadow"
            >
              Operator Console ⚙
            </Link>
          )}
        </div>
      </div>

      {/* Main Room Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Active Floor & Bidding */}
        <div className="lg:col-span-8 space-y-6">
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
                startedAt={activeLot.started_at}
                durationSeconds={timerDuration}
                isActive={activeLot.status === 'in_progress' && sessionState.isLive}
                isPaused={sessionState.isPaused}
                pausedRemainingSeconds={sessionState.pausedRemainingSeconds}
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

        {/* Right Column: Activity Stream */}
        <div className="lg:col-span-4 space-y-6">
          <RecentActivityStream events={recentEvents} />
        </div>
      </div>

      {/* Franchise Live Leaderboard & Quotas Table (§15) */}
      <FranchiseLeaderboardTable franchises={franchiseSummaries} />
    </div>
    </div>
  );
}
