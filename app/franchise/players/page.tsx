// =============================================================================
// ACC Auction Portal — Franchise Player Discovery Page (Protected)
// =============================================================================

import { requireFranchise } from '@/lib/permissions/guards';
import { createClient } from '@/lib/supabase/server';
import { getSeasonPlayerDiscovery } from '@/lib/franchises';
import { PlayerDiscoveryView } from '@/components/franchise/player-discovery-view';
import { DashboardShell } from '@/components/acc/dashboard-shell';
import { getSessionUser } from '@/lib/acc/server-session';

export default async function FranchisePlayersPage() {
  const permContext = await requireFranchise();
  const { assignedFranchise, activeSeason } = permContext;

  const supabase = await createClient();

  const players = activeSeason
    ? await getSeasonPlayerDiscovery(supabase, activeSeason.id)
    : [];

  const sessionUser = await getSessionUser('franchise');
  sessionUser.name = assignedFranchise.name;

  return (
    <DashboardShell role="franchise" user={sessionUser} breadcrumb="Player Discovery">
      <PlayerDiscoveryView
        initialPlayers={players}
        seasonName={activeSeason?.name || 'ACC 2026'}
      />
    </DashboardShell>
  );
}
