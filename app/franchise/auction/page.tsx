import type { Metadata } from 'next';
import { requireFranchise } from '@/lib/permissions/guards';
import { createClient } from '@/lib/supabase/server';
import {
  getActiveLot,
  getRecentAuctionEvents,
  getSeasonAuctionConfig,
  getAuctionSessionState,
} from '@/lib/auction/queries';
import { getFranchiseSquadData } from '@/lib/franchises/queries';
import { ActiveLotCard } from '@/components/auction/active-lot-card';
import { AuctionTimer } from '@/components/auction/auction-timer';
import { BiddingControl } from '@/components/auction/bidding-control';
import { RecentActivityStream } from '@/components/auction/recent-activity-stream';
import { DashboardShell } from '@/components/acc/dashboard-shell';
import { getSessionUser } from '@/lib/acc/server-session';
import { AuctionSessionIndicator } from '@/components/acc/status-badges';
import { AuctionRealtimeSync } from '@/components/auction/auction-realtime-sync';

export const metadata: Metadata = { title: 'Live Auction · Franchise' };

export default async function FranchiseAuctionPage() {
  const permContext = await requireFranchise();
  const { assignedFranchise, activeSeason } = permContext;
  const supabase = await createClient();

  const seasonId = activeSeason?.id || '00000000-0000-0000-0000-000000000001';

  const [activeLot, recentEvents, config, squadData, sessionUser, sessionState] = await Promise.all([
    getActiveLot(supabase, seasonId),
    getRecentAuctionEvents(supabase, seasonId, 20),
    getSeasonAuctionConfig(supabase, seasonId),
    getFranchiseSquadData(supabase, assignedFranchise.id, seasonId),
    getSessionUser('franchise'),
    getAuctionSessionState(supabase, seasonId),
  ]);

  const timerDuration = activeLot?.highest_bidder_franchise_id
    ? config.subsequentBidTimerSeconds
    : config.firstBidTimerSeconds;

  const franchiseBiddingData = squadData
    ? {
        id: assignedFranchise.id,
        name: assignedFranchise.name,
        shortName: assignedFranchise.short_name,
        remainingPurse: squadData.purseState.remainingPurse,
        squadCount: squadData.purseState.totalSquadCount,
        maxSquadSize:
          squadData.squadConstraints.vacantSlots + squadData.purseState.totalSquadCount,
        maxPermissibleBid: squadData.purseState.maxBidResult.maxBid,
      }
    : null;

  sessionUser.name = assignedFranchise.name;
  sessionUser.sub = `Purse: ₹${squadData?.purseState.remainingPurse ?? 1000}`;

  return (
    <DashboardShell
      role="franchise"
      user={sessionUser}
      breadcrumb="Live Auction"
      actions={<AuctionSessionIndicator status={sessionState.status} />}
    >
      <AuctionRealtimeSync seasonId={seasonId} />
      <div className="space-y-8 max-w-7xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">🏏</span>
              <h1 className="text-2xl font-black tracking-tight">Live Auction Floor</h1>
              <span className="rounded-md bg-emerald-500/20 px-2.5 py-0.5 text-xs font-bold text-emerald-400 border border-emerald-500/30">
                FRANCHISE BIDDING
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Team: {assignedFranchise.name} ({assignedFranchise.short_name}) • Max Permissible Bid: ₹{franchiseBiddingData?.maxPermissibleBid ?? 0}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-8 space-y-6">
            <ActiveLotCard lot={activeLot} />

            {activeLot && (
              <div className="rounded-2xl border border-border bg-card p-5 shadow-lg">
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

            {franchiseBiddingData && (
              <BiddingControl lot={activeLot} franchise={franchiseBiddingData} />
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
