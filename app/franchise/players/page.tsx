// =============================================================================
// ACC Auction Portal — Franchise Player Discovery Page (Protected)
// =============================================================================

import { requireFranchise } from '@/lib/permissions/guards';
import { createClient } from '@/lib/supabase/server';
import { getSeasonPlayerDiscovery } from '@/lib/franchises';
import { PlayerDiscoveryView } from '@/components/franchise/player-discovery-view';

export default async function FranchisePlayersPage() {
  const permContext = await requireFranchise();
  const { activeSeason } = permContext;

  const supabase = await createClient();

  const players = activeSeason
    ? await getSeasonPlayerDiscovery(supabase, activeSeason.id)
    : [];

  return (
    <PlayerDiscoveryView
      initialPlayers={players}
      seasonName={activeSeason?.name || 'ACC 2026'}
    />
  );
}
