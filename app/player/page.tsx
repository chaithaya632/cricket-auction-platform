import { requirePlayer } from '@/lib/permissions/guards';
import { createClient } from '@/lib/supabase/server';
import { getPlayerFullData } from '@/lib/players/queries';
import { PlayerPortalForm } from '@/components/player/player-portal-form';
import { DashboardShell } from '@/components/acc/dashboard-shell';
import { getSessionUser } from '@/lib/acc/server-session';

export default async function PlayerPage() {
  const permContext = await requirePlayer();
  const supabase = await createClient();

  const seasonId = permContext.activeSeason?.id;
  const seasonName = permContext.activeSeason?.name || 'ACC 2026';

  const fullData = seasonId
    ? await getPlayerFullData(supabase, permContext.user.id, seasonId)
    : { player: null, registration: null, skillProfile: null };

  const sessionUser = await getSessionUser('player');
  if (fullData.player) {
    sessionUser.name = fullData.player.full_name;
    sessionUser.sub = fullData.player.roll_number;
    sessionUser.avatarUrl = fullData.player.photo_url || undefined;
  }

  return (
    <DashboardShell role="player" user={sessionUser} breadcrumb="Player Registration">
      <div className="space-y-6">
        <PlayerPortalForm initialData={fullData} activeSeasonName={seasonName} />
      </div>
    </DashboardShell>
  );
}

