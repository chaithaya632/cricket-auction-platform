// =============================================================================
// ACC Auction Portal — Auditorium Projector View (/live/projector)
// =============================================================================

import React from 'react';
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
  getActiveBuckets,
  getBucketStatistics,
} from '@/lib/auction/queries';
import { ActiveLotCard } from '@/components/auction/active-lot-card';
import { AuctionTimer } from '@/components/auction/auction-timer';
import { LiveExitBar } from '@/components/auction/live-exit-bar';
import { AuctionRealtimeSync } from '@/components/auction/auction-realtime-sync';
import { FranchiseStatusBar } from '@/components/auction/franchise-status-bar';
import { ProjectorControlDock } from '@/components/auction/projector-control-dock';
import { ProjectorGroupSelector } from '@/components/auction/projector-group-selector';

export const dynamic = 'force-dynamic';

export default async function ProjectorPage() {
  const { appUser } = await getCurrentUser();
  const supabase = await createClient();
  const adminClient = createAdminClient();

  const userContext = appUser
    ? await getUserPermissionContext(supabase, appUser)
    : null;

  const activeSeason = userContext?.activeSeason || (await getActiveSeason(adminClient));
  const seasonId = activeSeason?.id || '00000000-0000-0000-0000-000000000001';

  const [
    activeLot,
    recentEvents,
    config,
    sessionState,
    activeBuckets,
    bucketStats,
    completedBucketsResult,
  ] = await Promise.all([
    getActiveLot(adminClient, seasonId),
    getRecentAuctionEvents(adminClient, seasonId, 8),
    getSeasonAuctionConfig(adminClient, seasonId),
    getAuctionSessionState(adminClient, seasonId),
    getActiveBuckets(adminClient, seasonId),
    getBucketStatistics(adminClient, seasonId),
    adminClient
      .from('season_config')
      .select('value')
      .eq('season_id', seasonId)
      .eq('key', 'auction_completed_buckets')
      .maybeSingle(),
  ]);

  let completedBuckets: string[] = [];
  if (completedBucketsResult?.data?.value) {
    try {
      const parsed = JSON.parse(completedBucketsResult.data.value);
      if (Array.isArray(parsed)) completedBuckets = parsed;
    } catch {}
  }

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

  const [scarcityReport, franchiseSummaries] = await Promise.all([
    activeLot?.bucket ? getActiveLotScarcity(adminClient, seasonId, activeLot.bucket) : null,
    getAllFranchisesLiveSummary(adminClient, seasonId, activeLot),
  ]);

  const timerDuration = activeLot?.highest_bidder_franchise_id
    ? config.subsequentBidTimerSeconds
    : config.firstBidTimerSeconds;

  const canControl = Boolean(userContext?.isAdmin || userContext?.isOperator);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col justify-between">
      <AuctionRealtimeSync seasonId={seasonId} />
      {/* Top Unobtrusive Exit & Fullscreen Bar */}
      <LiveExitBar
        mode="projector"
        destinationHref="/admin/auction"
        destinationLabel="Operator Console"
      />

      <div className="flex-1 p-6 md:p-12 flex flex-col justify-between">
        {/* Top Banner */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-6">
          <div className="flex items-center gap-4">
            <span className="text-4xl">🏆</span>
            <div>
              <h1 className="text-3xl md:text-4xl font-black tracking-tight uppercase text-zinc-100">
                Avanthi Cricket Championship
              </h1>
              <p className="text-sm font-semibold tracking-widest uppercase text-emerald-400">
                Official Live Auction Floor • {activeSeason?.name || 'ACC 2026'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {sessionState.isNotStarted ? (
              <div className="flex items-center gap-2 rounded-full bg-amber-950/80 border border-amber-800 px-4 py-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-widest text-amber-400">
                  FLOOR STANDBY
                </span>
              </div>
            ) : isBucketGroupComplete ? (
              <div className="flex items-center gap-2 rounded-full bg-emerald-950/80 border border-emerald-800 px-4 py-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">
                  GROUP COMPLETE
                </span>
              </div>
            ) : sessionState.isPaused ? (
              <div className="flex items-center gap-2 rounded-full bg-amber-950/80 border border-amber-800 px-4 py-1.5">
                <span className="text-xs font-bold uppercase tracking-widest text-amber-400">
                  ⏸ AUCTION PAUSED
                </span>
              </div>
            ) : sessionState.isCompleted ? (
              <div className="flex items-center gap-2 rounded-full bg-blue-950/80 border border-blue-800 px-4 py-1.5">
                <span className="text-xs font-bold uppercase tracking-widest text-blue-400">
                  AUCTION ENDED
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-full bg-red-950/80 border border-red-800 px-4 py-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                <span className="text-xs font-bold uppercase tracking-widest text-red-400">
                  LIVE BROADCAST
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Centerpiece: Active Lot & Stage Clock */}
        <div className="my-8 max-w-6xl mx-auto w-full space-y-8">
          {sessionState.isNotStarted && !activeLot ? (
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
                bucketStats={bucketStats}
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
                    startedAt={activeLot.started_at}
                    durationSeconds={timerDuration}
                    isActive={activeLot.status === 'in_progress' && sessionState.isLive}
                    isPaused={sessionState.isPaused}
                    pausedRemainingSeconds={sessionState.pausedRemainingSeconds}
                    size="lg"
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* Bottom Ticker: Recent Bids */}
        <div className="border-t border-zinc-800 pt-6">
          <div className="flex items-center gap-4 overflow-x-auto pb-2">
            <span className="text-xs font-bold uppercase tracking-widest text-zinc-500 shrink-0">
              LATEST BIDS:
            </span>
            {recentEvents.length === 0 ? (
              <span className="text-xs text-zinc-600">Awaiting floor opening...</span>
            ) : (
              recentEvents.slice(0, 5).map((e) => (
                <div
                  key={e.id}
                  className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs border border-zinc-800 shrink-0"
                >
                  <span className="font-semibold text-zinc-300">
                    {e.franchise?.short_name || 'Floor'}
                  </span>
                  {e.price && (
                    <span className="font-mono font-bold text-emerald-400">
                      ₹{e.price}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 11-Franchise Live Status Bar (§14) */}
      <FranchiseStatusBar
        franchises={franchiseSummaries}
        activeLotDrawNumber={activeLot?.draw_number}
      />

      {/* Floating Operator Dock for Authorized Admins/Operators only */}
      {canControl && (
        <ProjectorControlDock
          activeLot={activeLot}
          sessionState={sessionState}
          seasonId={seasonId}
          activeBuckets={activeBuckets}
        />
      )}
    </div>
  );
}
