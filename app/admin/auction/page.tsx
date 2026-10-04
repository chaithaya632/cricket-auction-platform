// =============================================================================
// ACC Auction Portal — Admin Auction Operator Console (/admin/auction)
// =============================================================================

import React from 'react';
import { requireAdmin } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import {
  getActiveLot,
  getAuctionQueue,
  getAuctionQueueByBuckets,
  getUnsoldLots,
  getRecentAuctionEvents,
  getSeasonAuctionConfig,
  getAuctionSessionState,
  getActiveLotScarcity,
  getActiveBuckets,
  getBucketStatistics,
} from '@/lib/auction/queries';
import { AuctionOperatorFloor } from '@/components/auction/auction-operator-floor';
import { type OperatorSoldLotItem } from '@/components/auction/operator-controls';
import { RecentActivityStream } from '@/components/auction/recent-activity-stream';
import { DashboardShell } from '@/components/acc/dashboard-shell';
import { getSessionUser } from '@/lib/acc/server-session';
import { AuctionSessionIndicator } from '@/components/acc/status-badges';
import { AuctionRealtimeSync } from '@/components/auction/auction-realtime-sync';

export default async function AdminAuctionPage() {
  const [sessionUser, adminContext, supabase] = await Promise.all([
    getSessionUser('admin'),
    requireAdmin(),
    createClient(),
  ]);
  const seasonId =
    adminContext.activeSeason?.id || '00000000-0000-0000-0000-000000000001';

  // 1. Fetch active buckets, active lot, session state, events, and tables in parallel
  const [
    activeBuckets,
    activeLot,
    unsoldLots,
    recentEvents,
    config,
    sessionState,
    bucketStats,
    completedBucketsResult,
    soldLotsResult,
    franchisesResult,
    allSeasonLotsResult,
  ] = await Promise.all([
    getActiveBuckets(supabase, seasonId),
    getActiveLot(supabase, seasonId),
    getUnsoldLots(supabase, seasonId, 50),
    getRecentAuctionEvents(supabase, seasonId, 20),
    getSeasonAuctionConfig(supabase, seasonId),
    getAuctionSessionState(supabase, seasonId),
    getBucketStatistics(supabase, seasonId),
    supabase
      .from('season_config')
      .select('value')
      .eq('season_id', seasonId)
      .eq('key', 'auction_completed_buckets')
      .maybeSingle(),
    supabase
      .from('auction_lots')
      .select('id, draw_number, current_price, bucket, highest_bidder:franchises(name), registration:player_season_registrations(player:players(full_name))')
      .eq('season_id', seasonId)
      .eq('status', 'sold')
      .order('ended_at', { ascending: false })
      .limit(25),
    supabase
      .from('franchises')
      .select('id, name, short_name')
      .eq('season_id', seasonId)
      .eq('is_active', true)
      .order('name', { ascending: true }),
    supabase
      .from('auction_lots')
      .select('id, draw_number, bucket, status, registration:player_season_registrations(player:players(full_name))')
      .eq('season_id', seasonId)
      .order('draw_number', { ascending: true }),
  ]);

  // 2. Fetch bucket-filtered upcoming queue and active lot scarcity report in parallel
  const [upcomingLots, scarcityReport] = await Promise.all([
    getAuctionQueueByBuckets(supabase, seasonId, activeBuckets, 50),
    activeLot?.bucket ? getActiveLotScarcity(supabase, seasonId, activeLot.bucket) : null,
  ]);

  let completedBuckets: string[] = [];
  if (completedBucketsResult.data?.value) {
    try {
      const parsed = JSON.parse(completedBucketsResult.data.value);
      if (Array.isArray(parsed)) completedBuckets = parsed;
    } catch {}
  }

  const soldLots: OperatorSoldLotItem[] = (soldLotsResult.data || []).map((l: any) => ({
    id: l.id,
    draw_number: l.draw_number,
    player_name: l.registration?.player?.full_name || 'Player',
    franchise_name: l.highest_bidder?.name || 'Franchise',
    price: l.current_price || 20,
    bucket: l.bucket,
  }));

  const recoveryLots = (allSeasonLotsResult.data || []).map((l: any) => ({
    id: l.id,
    draw_number: l.draw_number,
    player_name: l.registration?.player?.full_name || 'Player',
    bucket: l.bucket,
    status: l.status,
  }));

  const lastSoldLotId = soldLots[0]?.id || null;
  const franchises = franchisesResult.data || [];

  return (
    <DashboardShell
      role="admin"
      user={sessionUser}
      breadcrumb="Live Console"
      actions={<AuctionSessionIndicator status={sessionState.status} />}
    >
      <AuctionRealtimeSync seasonId={seasonId} />
      <div className="space-y-8 max-w-[1800px] mx-auto">
        {/* Page Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-black text-zinc-100 tracking-tight uppercase">
                ACC AUCTION 2026
              </h1>
              <div className="h-6 w-px bg-zinc-700" />
              {sessionState.isLive && !sessionState.isPaused && (
                <span className="flex items-center gap-2 text-emerald-400">
                  <span className="relative flex size-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full size-3 bg-emerald-500" />
                  </span>
                  <span className="text-lg font-black">LIVE</span>
                </span>
              )}
              {sessionState.isLive && sessionState.isPaused && (
                <span className="flex items-center gap-2 text-amber-500">
                  <span className="relative flex size-3">
                    <span className="relative inline-flex rounded-full size-3 bg-amber-500" />
                  </span>
                  <span className="text-lg font-black">PAUSED</span>
                </span>
              )}
              {!sessionState.isLive && sessionState.isNotStarted && (
                <span className="flex items-center gap-2 text-zinc-400">
                  <span className="relative flex size-3">
                    <span className="relative inline-flex rounded-full size-3 bg-zinc-400" />
                  </span>
                  <span className="text-lg font-black">NOT STARTED</span>
                </span>
              )}
              {!sessionState.isLive && sessionState.isCompleted && (
                <span className="flex items-center gap-2 text-blue-400">
                  <span className="relative flex size-3">
                    <span className="relative inline-flex rounded-full size-3 bg-blue-400" />
                  </span>
                  <span className="text-lg font-black">COMPLETED</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="/live"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 border border-zinc-700 flex items-center gap-1.5"
            >
              <span>Open Live Room</span> ↗
            </a>
            <a
              href="/live/projector"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shadow flex items-center gap-1.5"
            >
              <span>Auditorium Projector</span> ↗
            </a>
          </div>
        </div>

        {/* Main Floor Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Active Floor & Controls */}
          <div className="lg:col-span-7 space-y-6">
            <AuctionOperatorFloor
              seasonId={seasonId}
              initialActiveLot={activeLot}
              initialUpcomingLots={upcomingLots}
              initialUnsoldLots={unsoldLots}
              lastSoldLotId={lastSoldLotId}
              soldLots={soldLots}
              franchises={franchises}
              initialSessionState={sessionState}
              isSuperAdmin={adminContext.isSuperAdmin}
              scarcityReport={scarcityReport}
              recoveryLots={recoveryLots}
              initialActiveBuckets={activeBuckets}
              completedBuckets={completedBuckets}
              bucketStats={bucketStats}
              config={config}
            />
          </div>

          {/* Right Column: Live Event Stream & Telemetry */}
          <div className="lg:col-span-5 space-y-6">
            {/* Recent Activity Audit Stream */}
            <RecentActivityStream events={recentEvents} />

            {/* Session Rules Summary */}
            <details className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 group">
              <summary className="font-bold text-zinc-200 uppercase tracking-wider text-[11px] cursor-pointer list-none flex items-center justify-between">
                ⚙ Auction Settings
                <span className="text-zinc-500 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <div className="space-y-1.5 mt-4 text-xs text-zinc-400">
                <div className="flex justify-between">
                  <span>First Bid Clock:</span>
                  <span className="font-mono text-zinc-200">
                    {config.firstBidTimerSeconds}s
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Subsequent Bid Clock:</span>
                  <span className="font-mono text-zinc-200">
                    {config.subsequentBidTimerSeconds}s
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Min Auction Purchases:</span>
                  <span className="font-mono text-zinc-200">
                    {config.minAuctionPurchases} players
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Squad Bounds:</span>
                  <span className="font-mono text-zinc-200">
                    {config.minSquadSize} – {config.maxSquadSize} players
                  </span>
                </div>
              </div>
            </details>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
