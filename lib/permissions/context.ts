// =============================================================================
// ACC Auction Portal — Season-aware Permission Resolution
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DbSeason, DbSeasonRole, DbFranchise, DbUser } from '@/lib/db/types';
import type { Role } from '@/lib/constants';
import type { UserPermissionContext } from './types';

/**
 * Retrieves the currently active ACC season.
 */
export async function getActiveSeason(
  supabase: SupabaseClient
): Promise<DbSeason | null> {
  const { data: season, error } = await supabase
    .from('seasons')
    .select('*')
    .eq('is_active', true)
    .maybeSingle();

  if (error || !season) {
    return null;
  }

  return season as DbSeason;
}

/**
 * Resolves full season-specific permissions for an application user.
 *
 * CRITICAL SECURITY INVARIANT:
 * Franchise identity and admin status are ALWAYS derived from authenticated
 * database records (public.users -> season_roles -> franchises).
 * Client-supplied URL parameters (?role=..., ?franchiseId=...) are ignored.
 */
export async function getUserPermissionContext(
  supabase: SupabaseClient,
  user: DbUser,
  seasonId?: string
): Promise<UserPermissionContext> {
  // 1. Resolve target season
  let targetSeason: DbSeason | null = null;
  if (seasonId) {
    const { data } = await supabase
      .from('seasons')
      .select('*')
      .eq('id', seasonId)
      .maybeSingle();
    targetSeason = (data as DbSeason) || null;
  } else {
    targetSeason = await getActiveSeason(supabase);
  }

  // If no season is found, user has no active season roles
  if (!targetSeason) {
    return {
      user,
      activeSeason: null,
      roles: [],
      assignedFranchise: null,
      isSuperAdmin: false,
      isOperator: false,
      isAdmin: false,
      isFranchise: false,
      isPlayer: false,
      isViewer: false,
    };
  }

  // 2. Fetch user roles for this specific season
  const { data: roleRecords } = await supabase
    .from('season_roles')
    .select('*')
    .eq('user_id', user.id)
    .eq('season_id', targetSeason.id)
    .eq('is_active', true);

  const roles = (roleRecords as DbSeasonRole[]) || [];

  const isSuperAdmin = roles.some((r) => r.role === 'super_admin');
  const isOperator = roles.some((r) => r.role === 'operator');
  const isAdmin = isSuperAdmin || isOperator;
  const isFranchise = roles.some((r) => r.role === 'franchise');
  const isPlayer = roles.some((r) => r.role === 'player');
  const isViewer = roles.some((r) => r.role === 'viewer') || roles.length === 0;

  // 3. Resolve assigned franchise if user has franchise role
  let assignedFranchise: DbFranchise | null = null;
  const franchiseRole = roles.find((r) => r.role === 'franchise' && r.franchise_id);

  if (franchiseRole && franchiseRole.franchise_id) {
    const { data: franchiseData } = await supabase
      .from('franchises')
      .select('*')
      .eq('id', franchiseRole.franchise_id)
      .eq('season_id', targetSeason.id)
      .eq('is_active', true)
      .maybeSingle();

    assignedFranchise = (franchiseData as DbFranchise) || null;
  }

  return {
    user,
    activeSeason: targetSeason,
    roles,
    assignedFranchise,
    isSuperAdmin,
    isOperator,
    isAdmin,
    isFranchise,
    isPlayer,
    isViewer,
  };
}

/**
 * Pure helper function to verify if a role exists in an array of season roles.
 */
export function hasSeasonRole(roles: DbSeasonRole[], targetRole: Role): boolean {
  return roles.some((r) => r.role === targetRole && r.is_active);
}
