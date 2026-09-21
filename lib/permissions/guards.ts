// =============================================================================
// ACC Auction Portal — Server Component & Action Guards
// =============================================================================

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { getUserPermissionContext } from './context';
import type { UserPermissionContext } from './types';
import type { DbFranchise } from '@/lib/db/types';

/**
 * Requires that the user is authenticated.
 * If not authenticated, redirects to /login with the optional redirect target.
 */
export async function requireAuth(redirectTo?: string): Promise<UserPermissionContext> {
  const { authUser, appUser } = await getCurrentUser();

  if (!authUser || !appUser) {
    const target = redirectTo ? `?redirectTo=${encodeURIComponent(redirectTo)}` : '';
    redirect(`/login${target}`);
  }

  const supabase = await createClient();
  return await getUserPermissionContext(supabase, appUser);
}

/**
 * Requires that the user has an admin role (super_admin or operator)
 * in the active ACC season.
 * If unauthorized, redirects to the home page.
 */
export async function requireAdmin(seasonId?: string): Promise<UserPermissionContext> {
  const { authUser, appUser } = await getCurrentUser();

  if (!authUser || !appUser) {
    redirect('/login?redirectTo=/admin');
  }

  const supabase = await createClient();
  const context = await getUserPermissionContext(supabase, appUser, seasonId);

  if (!context.isAdmin) {
    redirect('/?error=unauthorized_admin');
  }

  return context;
}

/**
 * Requires that the user is a verified franchise representative/member
 * for a franchise in the active ACC season.
 *
 * Enforces that franchise identity is bound strictly to the database.
 */
export async function requireFranchise(
  seasonId?: string
): Promise<UserPermissionContext & { assignedFranchise: DbFranchise }> {
  const { authUser, appUser } = await getCurrentUser();

  if (!authUser || !appUser) {
    redirect('/login?redirectTo=/franchise');
  }

  const supabase = await createClient();
  const context = await getUserPermissionContext(supabase, appUser, seasonId);

  if (!context.isFranchise || !context.assignedFranchise) {
    redirect('/?error=unauthorized_franchise');
  }

  return context as UserPermissionContext & { assignedFranchise: DbFranchise };
}

/**
 * Requires that the user has a player role in the active ACC season.
 */
export async function requirePlayer(seasonId?: string): Promise<UserPermissionContext> {
  const { authUser, appUser } = await getCurrentUser();

  if (!authUser || !appUser) {
    redirect('/login?redirectTo=/player');
  }

  const supabase = await createClient();
  const context = await getUserPermissionContext(supabase, appUser, seasonId);

  if (!context.isPlayer) {
    redirect('/?error=unauthorized_player');
  }

  return context;
}
