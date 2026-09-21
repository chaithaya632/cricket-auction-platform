import type { Metadata } from 'next';
import { requirePlayer } from '@/lib/permissions/guards';
import { createClient } from '@/lib/supabase/server';
import {
  getPlayerFullData,
  parseCareerStats,
  getPlayerAuctionLot,
} from '@/lib/players/queries';
import { getAuctionSessionState } from '@/lib/auction/queries';
import { PlayerDashboardView } from '@/components/player/player-dashboard-view';
import { DashboardShell } from '@/components/acc/dashboard-shell';
import { PageHeader } from '@/components/acc/page-header';
import { getSessionUser } from '@/lib/acc/server-session';

export const metadata: Metadata = { title: 'Dashboard · Player' };

export default async function PlayerDashboardPage() {
  const permContext = await requirePlayer();
  const supabase = await createClient();

  const seasonId = permContext.activeSeason?.id || '00000000-0000-0000-0000-000000000001';
  const seasonName = permContext.activeSeason?.name || 'ACC 2026';

  const [fullData, sessionState] = await Promise.all([
    getPlayerFullData(supabase, permContext.user.id, seasonId),
    getAuctionSessionState(supabase, seasonId),
  ]);

  const careerStats = parseCareerStats(fullData.skillProfile?.experience_description);

  const auctionLot = fullData.registration
    ? await getPlayerAuctionLot(supabase, fullData.registration.id)
    : null;

  const sessionUser = await getSessionUser('player');
  if (fullData.player) {
    sessionUser.name = fullData.player.full_name;
    sessionUser.sub = fullData.player.roll_number;
    sessionUser.avatarUrl = fullData.player.photo_url || undefined;
  }

  return (
    <DashboardShell role="player" user={sessionUser} breadcrumb="Player Dashboard">
      <PageHeader
        eyebrow={`Official Player Hub · ${seasonName}`}
        title={`Welcome, ${fullData.player?.full_name?.split(' ')[0] || 'Player'}`}
        description="Monitor your tournament registration status, career metrics, and live auction progress."
      />

      <PlayerDashboardView
        fullData={fullData}
        careerStats={careerStats}
        auctionLot={auctionLot}
        sessionState={sessionState}
        seasonName={seasonName}
      />
    </DashboardShell>
  );
}
