import { requirePlayer } from '@/lib/permissions/guards';
import { createClient } from '@/lib/supabase/server';
import { getPlayerFullData } from '@/lib/players/queries';
import { PlayerPortalForm } from '@/components/player/player-portal-form';

export default async function PlayerPage() {
  const permContext = await requirePlayer();
  const supabase = await createClient();

  const seasonId = permContext.activeSeason?.id;
  const seasonName = permContext.activeSeason?.name || 'ACC 2026';

  const fullData = seasonId
    ? await getPlayerFullData(supabase, permContext.user.id, seasonId)
    : { player: null, registration: null, skillProfile: null };

  return (
    <div className="space-y-6">
      <PlayerPortalForm initialData={fullData} activeSeasonName={seasonName} />
    </div>
  );
}

