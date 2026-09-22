// =============================================================================
// ACC Auction Portal — Franchise Player Discovery Page (Protected)
// =============================================================================

import { requireFranchise } from '@/lib/permissions/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSeasonPlayerDiscovery } from '@/lib/franchises';
import { PlayerDiscoveryView } from '@/components/franchise/player-discovery-view';
import { DashboardShell } from '@/components/acc/dashboard-shell';
import { getSessionUser } from '@/lib/acc/server-session';

export default async function FranchisePlayersPage() {
  const [permContext, sessionUser] = await Promise.all([
    requireFranchise(),
    getSessionUser('franchise'),
  ]);
  const { assignedFranchise, activeSeason } = permContext;
  sessionUser.name = assignedFranchise.name;

  const adminClient = createAdminClient();

  const players = activeSeason
    ? await getSeasonPlayerDiscovery(adminClient, activeSeason.id)
    : [];

  return (
    <DashboardShell role="franchise" user={sessionUser} breadcrumb="Player Discovery">
      <PlayerDiscoveryView
        initialPlayers={players}
        seasonName={activeSeason?.name || 'ACC 2026'}
      />
    </DashboardShell>
  );
}
