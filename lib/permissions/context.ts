// =============================================================================
// ACC Auction Portal — Season-aware Permission Resolution
// =============================================================================

import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DbSeason, DbSeasonRole, DbFranchise, DbUser } from '@/lib/db/types';
import type { Role } from '@/lib/constants';
import type { UserPermissionContext } from './types';

/**
 * Retrieves the currently active ACC season.
 * Memoized per server render cycle with React cache().
 */
export const getActiveSeason = cache(async (
  supabase: SupabaseClient
): Promise<DbSeason | null> => {
  const { data: season, error } = await supabase
    .from('seasons')
    .select('*')
    .eq('is_active', true)
    .maybeSingle();

  if (error || !season) {
    return null;
  }

  return season as DbSeason;
});

/**
 * Resolves full season-specific permissions for an application user.
 * Memoized per server render cycle with React cache().
 *
 * CRITICAL SECURITY INVARIANT:
 * Franchise identity and admin status are ALWAYS derived from authenticated
 * database records (public.users -> season_roles -> franchises).
 * Client-supplied URL parameters (?role=..., ?franchiseId=...) are ignored.
 */
export const getUserPermissionContext = cache(async (
  supabase: SupabaseClient,
  user: DbUser,
  seasonId?: string
): Promise<UserPermissionContext> => {
  // 1. Resolve target season and user roles concurrently
  const [seasonResult, roleRecordsResult] = await Promise.all([
    seasonId
      ? supabase.from('seasons').select('*').eq('id', seasonId).maybeSingle()
      : getActiveSeason(supabase),
    supabase
      .from('season_roles')
      .select('*, franchise:franchises(*)')
      .eq('user_id', user.id)
      .eq('is_active', true),
  ]);

  const targetSeason: DbSeason | null = (
    seasonId ? (seasonResult as any)?.data : seasonResult
  ) || null;

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

  // 2. Filter user roles for this specific season
  const allRoles = (roleRecordsResult.data || []) as any[];
  const roles = allRoles.filter((r) => r.season_id === targetSeason.id) as DbSeasonRole[];

  const isSuperAdmin = roles.some((r) => r.role === 'super_admin');
  const isOperator = roles.some((r) => r.role === 'operator');
  const isAdmin = isSuperAdmin || isOperator;
  const isFranchise = roles.some((r) => r.role === 'franchise');
  const isPlayer = roles.some((r) => r.role === 'player');
  const isViewer = roles.some((r) => r.role === 'viewer') || roles.length === 0;

  // 3. Resolve assigned franchise if user has franchise role
  let assignedFranchise: DbFranchise | null = null;
  const franchiseRole = allRoles.find(
    (r) => r.season_id === targetSeason.id && r.role === 'franchise' && r.franchise_id
  );

  if (franchiseRole) {
    assignedFranchise = (franchiseRole.franchise as DbFranchise) || null;
    if (!assignedFranchise && franchiseRole.franchise_id) {
      const { data: franchiseData } = await supabase
        .from('franchises')
        .select('*')
        .eq('id', franchiseRole.franchise_id)
        .eq('season_id', targetSeason.id)
        .eq('is_active', true)
        .maybeSingle();

      assignedFranchise = (franchiseData as DbFranchise) || null;
    }
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
});

/**
 * Pure helper function to verify if a role exists in an array of season roles.
 */
export function hasSeasonRole(roles: DbSeasonRole[], targetRole: Role): boolean {
  return roles.some((r) => r.role === targetRole && r.is_active);
}
