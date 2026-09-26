// =============================================================================
// ACC Auction Portal — Admin Auction Operator Console (/admin/auction)
// =============================================================================

import React from 'react';
import { requireAdmin } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import {
  getActiveLot,
  getAuctionQueue,
  getUnsoldLots,
  getRecentAuctionEvents,
  getSeasonAuctionConfig,
  getAuctionSessionState,
  getActiveLotScarcity,
} from '@/lib/auction/queries';
import { ActiveLotCard } from '@/components/auction/active-lot-card';
import { AuctionTimer } from '@/components/auction/auction-timer';
import { OperatorControls, type OperatorSoldLotItem } from '@/components/auction/operator-controls';
import { RecentActivityStream } from '@/components/auction/recent-activity-stream';
import { DashboardShell } from '@/components/acc/dashboard-shell';
import { getSessionUser } from '@/lib/acc/server-session';
import { LiveIndicator } from '@/components/acc/status-badges';
import { AuctionRealtimeSync } from '@/components/auction/auction-realtime-sync';

export default async function AdminAuctionPage() {
  const [sessionUser, adminContext, supabase] = await Promise.all([
    getSessionUser('admin'),
    requireAdmin(),
    createClient(),
  ]);
  const seasonId =
    adminContext.activeSeason?.id || '00000000-0000-0000-0000-000000000001';

  // 1. Fetch live operational data & session lifecycle state
  const [activeLot, upcomingLots, unsoldLots, recentEvents, config, sessionState] = await Promise.all([
    getActiveLot(supabase, seasonId),
    getAuctionQueue(supabase, seasonId, 50),
    getUnsoldLots(supabase, seasonId, 50),
    getRecentAuctionEvents(supabase, seasonId, 20),
    getSeasonAuctionConfig(supabase, seasonId),
    getAuctionSessionState(supabase, seasonId),
  ]);

  // 2. Fetch scarcity report, recent sold lots, active franchises, and all season lots
  const [scarcityReport, soldLotsResult, franchisesResult, allSeasonLotsResult] = await Promise.all([
    activeLot?.bucket ? getActiveLotScarcity(supabase, seasonId, activeLot.bucket) : null,
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

  // Determine current timer duration based on whether first bid has occurred
  const timerDuration = activeLot?.highest_bidder_franchise_id
    ? config.subsequentBidTimerSeconds
    : config.firstBidTimerSeconds;

  return (
    <DashboardShell
      role="admin"
      user={sessionUser}
      breadcrumb="Live Console"
      actions={<LiveIndicator />}
    >
      <AuctionRealtimeSync seasonId={seasonId} />
      <div className="space-y-8 max-w-7xl mx-auto">
        {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">🎙</span>
            <h1 className="text-2xl font-black text-zinc-100 tracking-tight">
              Auction Operator Console
            </h1>
            <span className="rounded-md bg-amber-500/20 px-2.5 py-0.5 text-xs font-bold text-amber-400 border border-amber-500/30">
              OPERATOR CONTROL
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Season: {adminContext.activeSeason?.name || 'ACC 2026'} • Full server authority active
          </p>
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
        <div className="lg:col-span-8 space-y-6">
          {/* Active Lot Display */}
          <ActiveLotCard lot={activeLot} isAdmin={true} />

          {/* Countdown Timer */}
          {activeLot && (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-lg">
              <AuctionTimer
                startedAt={activeLot.started_at}
                durationSeconds={timerDuration}
                isActive={activeLot.status === 'in_progress'}
                size="md"
              />
            </div>
          )}

          {/* Auctioneer Controls & Queue */}
          <OperatorControls
            activeLot={activeLot}
            upcomingLots={upcomingLots}
            unsoldLots={unsoldLots}
            lastSoldLotId={lastSoldLotId}
            soldLots={soldLots}
            franchises={franchises}
            sessionState={sessionState}
            isSuperAdmin={adminContext.isSuperAdmin}
            scarcityReport={scarcityReport}
            recoveryLots={recoveryLots}
          />
        </div>

        {/* Right Column: Live Event Stream & Telemetry */}
        <div className="lg:col-span-4 space-y-6">
          {/* Recent Activity Audit Stream */}
          <RecentActivityStream events={recentEvents} />

          {/* Session Rules Summary */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 text-xs text-zinc-400 space-y-3">
            <h4 className="font-bold text-zinc-200 uppercase tracking-wider text-[11px]">
              Auction Session Parameters
            </h4>
            <div className="space-y-1.5">
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
          </div>
        </div>
      </div>
      </div>
    </DashboardShell>
  );
}
