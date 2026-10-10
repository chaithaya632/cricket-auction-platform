import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser, getAuthUser } from '@/lib/auth/session';
import { getUserPermissionContext, getActiveSeason } from './context';
import type { UserPermissionContext } from './types';
import type { DbFranchise, DbSeason, DbSeasonRole, DbUser } from '@/lib/db/types';

/**
 * Concurrently resolves the authenticated application user and their season-specific
 * permissions in a single parallel round-trip instead of 3 sequential round-trips.
 *
 * Request-scoped memoization via React cache() ensures identity and roles are never
 * re-queried redundantly across multiple guards in the same server request lifecycle.
 */
export const resolveAuthenticatedUserContext = cache(async (
  seasonId?: string
): Promise<{ authUser: any; appUser: DbUser; context: UserPermissionContext } | null> => {
  const authUser = await getAuthUser();
  if (!authUser) {
    return null;
  }

  const supabase = await createClient();

  // Concurrently resolve app user profile, target season, and active season_roles
  const [userResult, seasonResult, roleRecordsResult] = await Promise.all([
    supabase
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .maybeSingle(),
    seasonId
      ? supabase.from('seasons').select('*').eq('id', seasonId).maybeSingle()
      : getActiveSeason(supabase),
    supabase
      .from('season_roles')
      .select('*, franchise:franchises(*)')
      .eq('user_id', authUser.id)
      .eq('is_active', true),
  ]);

  let appUser = userResult.data as DbUser | null;
  if (!appUser && !userResult.error) {
    // Fallback sync if public.users record did not exist
    const fallbackEmail = authUser.email || '';
    const fallbackName =
      authUser.user_metadata?.full_name ||
      fallbackEmail.split('@')[0] ||
      'User';

    const { data: createdUser } = await supabase
      .from('users')
      .insert({
        id: authUser.id,
        email: fallbackEmail,
        full_name: fallbackName,
      })
      .select('*')
      .maybeSingle();

    appUser = createdUser as DbUser | null;
  }

  if (!appUser) {
    return null;
  }

  const targetSeason: DbSeason | null = (
    seasonId ? (seasonResult as any)?.data : seasonResult
  ) || null;

  if (!targetSeason) {
    const emptyContext: UserPermissionContext = {
      user: appUser,
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
    return { authUser, appUser, context: emptyContext };
  }

  const allRoles = (roleRecordsResult.data || []) as any[];
  const roles = allRoles.filter((r) => r.season_id === targetSeason.id) as DbSeasonRole[];

  const isSuperAdmin = roles.some((r) => r.role === 'super_admin');
  const isOperator = roles.some((r) => r.role === 'operator');
  const isAdmin = isSuperAdmin || isOperator;
  const isFranchise = roles.some((r) => r.role === 'franchise');
  const isPlayer = roles.some((r) => r.role === 'player');
  const isViewer = roles.some((r) => r.role === 'viewer') || roles.length === 0;

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

  const context: UserPermissionContext = {
    user: appUser,
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

  return { authUser, appUser, context };
});

/**
 * Requires that the user is authenticated.
 * If not authenticated, redirects to /login with the optional redirect target.
 * Memoized per request with React cache().
 */
export const requireAuth = cache(async (redirectTo?: string): Promise<UserPermissionContext> => {
  const resolved = await resolveAuthenticatedUserContext();

  if (!resolved || !resolved.authUser || !resolved.appUser) {
    const target = redirectTo ? `?redirectTo=${encodeURIComponent(redirectTo)}` : '';
    redirect(`/login${target}`);
  }

  return resolved.context;
});

/**
 * Requires that the user has an admin role (super_admin or operator)
 * in the active ACC season.
 * If unauthorized, redirects to the home page.
 * Memoized per request with React cache().
 */
export const requireAdmin = cache(async (seasonId?: string): Promise<UserPermissionContext> => {
  const resolved = await resolveAuthenticatedUserContext(seasonId);

  if (!resolved || !resolved.authUser || !resolved.appUser) {
    redirect('/login?redirectTo=/admin');
  }

  const { context } = resolved;

  if (!context.isAdmin) {
    if (context.roles.length === 0) {
      redirect('/onboarding?reason=pending_access');
    }
    redirect('/?error=unauthorized_admin');
  }

  return context;
});

/**
 * Requires that the user has the super_admin role in the active ACC season.
 * If unauthorized, redirects to /admin?error=unauthorized_super_admin.
 * Memoized per request with React cache().
 */
export const requireSuperAdmin = cache(async (seasonId?: string): Promise<UserPermissionContext> => {
  const resolved = await resolveAuthenticatedUserContext(seasonId);

  if (!resolved || !resolved.authUser || !resolved.appUser) {
    redirect('/login?redirectTo=/admin');
  }

  const { context } = resolved;

  if (!context.isSuperAdmin) {
    redirect('/admin?error=unauthorized_super_admin');
  }

  return context;
});

/**
 * Requires that the user is a verified franchise representative/member
 * for a franchise in the active ACC season.
 *
 * Enforces that franchise identity is bound strictly to the database.
 * Memoized per request with React cache().
 */
export const requireFranchise = cache(async (
  seasonId?: string
): Promise<UserPermissionContext & { assignedFranchise: DbFranchise }> => {
  const resolved = await resolveAuthenticatedUserContext(seasonId);

  if (!resolved || !resolved.authUser || !resolved.appUser) {
    redirect('/login?redirectTo=/franchise');
  }

  const { context } = resolved;

  if (!context.isFranchise || !context.assignedFranchise) {
    if (context.roles.length === 0) {
      redirect('/onboarding?reason=pending_access');
    }
    redirect('/?error=unauthorized_franchise');
  }

  return context as UserPermissionContext & { assignedFranchise: DbFranchise };
});

/**
 * Requires that the user has a player role in the active ACC season.
 * Memoized per request with React cache().
 */
export const requirePlayer = cache(async (seasonId?: string): Promise<UserPermissionContext> => {
  const resolved = await resolveAuthenticatedUserContext(seasonId);

  if (!resolved || !resolved.authUser || !resolved.appUser) {
    redirect('/login?redirectTo=/player');
  }

  const { context } = resolved;

  if (!context.isPlayer) {
    if (context.roles.length === 0) {
      redirect('/onboarding?reason=pending_access');
    }
    redirect('/?error=unauthorized_player');
  }

  return context;
});
