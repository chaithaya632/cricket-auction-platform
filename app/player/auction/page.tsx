import type { Metadata } from 'next';
import { requirePlayer } from '@/lib/permissions/guards';
import { createClient } from '@/lib/supabase/server';
import {
  getActiveLot,
  getRecentAuctionEvents,
  getSeasonAuctionConfig,
  getAuctionSessionState,
} from '@/lib/auction/queries';
import { getPlayerFullData } from '@/lib/players/queries';
import { ActiveLotCard } from '@/components/auction/active-lot-card';
import { AuctionTimer } from '@/components/auction/auction-timer';
import { RecentActivityStream } from '@/components/auction/recent-activity-stream';
import { AuctionRealtimeSync } from '@/components/auction/auction-realtime-sync';
import { DashboardShell } from '@/components/acc/dashboard-shell';
import { getSessionUser } from '@/lib/acc/server-session';
import { Eye, ShieldAlert } from 'lucide-react';

export const metadata: Metadata = { title: 'Live Spectator Room · Player' };

export default async function PlayerAuctionPage() {
  const permContext = await requirePlayer();
  const supabase = await createClient();

  const seasonId = permContext.activeSeason?.id || '00000000-0000-0000-0000-000000000001';
  const seasonName = permContext.activeSeason?.name || 'ACC 2026';

  const [activeLot, recentEvents, config, sessionState, fullData, sessionUser] = await Promise.all([
    getActiveLot(supabase, seasonId),
    getRecentAuctionEvents(supabase, seasonId, 20),
    getSeasonAuctionConfig(supabase, seasonId),
    getAuctionSessionState(supabase, seasonId),
    getPlayerFullData(supabase, permContext.user.id, seasonId),
    getSessionUser('player'),
  ]);

  const timerDuration = activeLot?.highest_bidder_franchise_id
    ? config.subsequentBidTimerSeconds
    : config.firstBidTimerSeconds;

  if (fullData.player) {
    sessionUser.name = fullData.player.full_name;
    sessionUser.sub = fullData.player.roll_number;
    sessionUser.avatarUrl = fullData.player.photo_url || undefined;
  }

  return (
    <DashboardShell role="player" user={sessionUser} breadcrumb="Live Auction Spectator">
      {/* Realtime listener for live sync */}
      <AuctionRealtimeSync seasonId={seasonId} />

      <div className="space-y-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">🏏</span>
              <h1 className="text-2xl font-black tracking-tight text-foreground">
                Live Auction Spectator Room
              </h1>
              <span className="rounded-md bg-blue-500/20 px-2.5 py-0.5 text-xs font-bold text-blue-400 border border-blue-500/30 flex items-center gap-1">
                <Eye className="size-3" />
                SPECTATOR MODE
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Official Live Telemetry • {seasonName} • Watch bids and lots in real time
            </p>
          </div>

          <div className="flex items-center gap-2">
            {sessionState.isLive ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-400 border border-emerald-500/30">
                <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                AUCTION LIVE
              </span>
            ) : sessionState.isPaused ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-400 border border-amber-500/30">
                <span className="size-2 rounded-full bg-amber-400" />
                SESSION PAUSED
              </span>
            ) : sessionState.isCompleted ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/20 px-3 py-1 text-xs font-bold text-blue-400 border border-blue-500/30">
                AUCTION COMPLETED
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-800 px-3 py-1 text-xs font-bold text-zinc-400 border border-zinc-700">
                STANDBY
              </span>
            )}
          </div>
        </div>

        {/* Spectator Information Notice */}
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 flex items-center gap-3 text-xs text-blue-300">
          <ShieldAlert className="size-5 shrink-0 text-blue-400" />
          <span>
            <strong>Read-only Broadcast:</strong> You are viewing live auction events as an accredited player spectator.
            Only authorized franchise bidding representatives can place bids on lots.
          </span>
        </div>

        {/* Main Auction Screen */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-8 space-y-6">
            <ActiveLotCard lot={activeLot} />

            {activeLot && (
              <div className="rounded-2xl border border-border bg-card p-5 shadow-lg">
                <AuctionTimer
                  startedAt={activeLot.started_at}
                  durationSeconds={timerDuration}
                  isActive={activeLot.status === 'in_progress' && sessionState.isLive}
                  size="md"
                />
              </div>
            )}
          </div>

          <div className="lg:col-span-4 space-y-6">
            <RecentActivityStream events={recentEvents} />
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
