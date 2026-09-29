import React from 'react';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/permissions/guards';
import { getActiveSeason } from '@/lib/permissions/context';
import { getMatches, getFranchiseEligibleSquad } from '@/lib/matches/queries';
import { AdminMatchManager } from '@/components/match/admin-match-manager';
import { DashboardShell } from '@/components/acc/dashboard-shell';
import { getSessionUser } from '@/lib/acc/server-session';

export const dynamic = 'force-dynamic';

export default async function AdminMatchesPage() {
  const [sessionUser, permContext, supabase] = await Promise.all([
    getSessionUser('admin'),
    requireAdmin(),
    createClient(),
  ]);

  const season = permContext.activeSeason || (await getActiveSeason(supabase));
  let seasonId = season?.id || '';
  let seasonName = season?.name || 'ACC 2026';

  // If no active season found, query most recent season or default seed season
  if (!seasonId) {
    const { data: latestSeason } = await supabase
      .from('seasons')
      .select('id, name')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestSeason?.id) {
      seasonId = latestSeason.id;
      seasonName = latestSeason.name || 'ACC 2026';
    } else {
      seasonId = '00000000-0000-0000-0000-000000000001';
      seasonName = 'ACC 2026';
    }
  }

  // 1. Fetch franchises for active season
  let { data: franchisesData } = await supabase
    .from('franchises')
    .select('id, name, short_name, season_id')
    .eq('season_id', seasonId)
    .eq('is_active', true)
    .order('name', { ascending: true });

  let franchises = franchisesData || [];

  // Fallback: If no franchises found for this seasonId, check if any active franchises exist
  if (franchises.length === 0) {
    const { data: allActiveFranchises } = await supabase
      .from('franchises')
      .select('id, name, short_name, season_id')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (allActiveFranchises && allActiveFranchises.length > 0) {
      franchises = allActiveFranchises;
      if (allActiveFranchises[0]?.season_id) {
        seasonId = allActiveFranchises[0].season_id;
      }
    }
  }

  // 2. Fetch matches for active season
  const matches = await getMatches(supabase, seasonId);

  // 3. Fetch registered users for scorer assignment
  const { data: usersData } = await supabase
    .from('users')
    .select('id, full_name, email')
    .eq('is_active', true)
    .order('full_name', { ascending: true });

  const users = usersData || [];

  // 4. Preload eligible squads for all franchises
  const squadMap: Record<
    string,
    Array<{
      registrationId: string;
      fullName: string;
      derivedPlayerType: string | null;
    }>
  > = {};

  await Promise.all(
    franchises.map(async (f) => {
      const squad = await getFranchiseEligibleSquad(supabase, seasonId, f.id);
      squadMap[f.id] = squad.map((s) => ({
        registrationId: s.registrationId,
        fullName: s.fullName,
        derivedPlayerType: s.derivedPlayerType,
      }));
    })
  );

  // 5. Preload active match scorers for all matches
  const { data: scorersData } = await supabase
    .from('match_scorers')
    .select('id, match_id, user_id, is_active')
    .eq('is_active', true);

  const activeScorersMap: Record<
    string,
    { id: string; userId: string; userName: string; userEmail: string }
  > = {};

  if (scorersData) {
    for (const s of scorersData) {
      const u = users.find((usr) => usr.id === s.user_id);
      if (u) {
        activeScorersMap[s.match_id] = {
          id: s.id,
          userId: s.user_id,
          userName: u.full_name,
          userEmail: u.email,
        };
      }
    }
  }

  return (
    <DashboardShell
      role="admin"
      user={sessionUser}
      breadcrumb="Matches"
    >
      <div className="max-w-6xl mx-auto py-4">
        <AdminMatchManager
          seasonId={seasonId}
          seasonName={seasonName}
          franchises={franchises}
          users={users}
          matches={matches as any}
          squadMap={squadMap}
          activeScorersMap={activeScorersMap}
        />
      </div>
    </DashboardShell>
  );
}
