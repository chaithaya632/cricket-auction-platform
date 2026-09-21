import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { getUserPermissionContext } from './context';
import type { UserPermissionContext } from './types';
import type { DbFranchise } from '@/lib/db/types';

/**
 * Requires that the user is authenticated.
 * If not authenticated, redirects to /login with the optional redirect target.
 * Memoized per request with React cache().
 */
export const requireAuth = cache(async (redirectTo?: string): Promise<UserPermissionContext> => {
  const { authUser, appUser } = await getCurrentUser();

  if (!authUser || !appUser) {
    const target = redirectTo ? `?redirectTo=${encodeURIComponent(redirectTo)}` : '';
    redirect(`/login${target}`);
  }

  const supabase = await createClient();
  return await getUserPermissionContext(supabase, appUser);
});

/**
 * Requires that the user has an admin role (super_admin or operator)
 * in the active ACC season.
 * If unauthorized, redirects to the home page.
 * Memoized per request with React cache().
 */
export const requireAdmin = cache(async (seasonId?: string): Promise<UserPermissionContext> => {
  const { authUser, appUser } = await getCurrentUser();

  if (!authUser || !appUser) {
    redirect('/login?redirectTo=/admin');
  }

  const supabase = await createClient();
  const context = await getUserPermissionContext(supabase, appUser, seasonId);

  if (!context.isAdmin) {
    if (context.roles.length === 0) {
      redirect('/onboarding?reason=pending_access');
    }
    redirect('/?error=unauthorized_admin');
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
  const { authUser, appUser } = await getCurrentUser();

  if (!authUser || !appUser) {
    redirect('/login?redirectTo=/franchise');
  }

  const supabase = await createClient();
  const context = await getUserPermissionContext(supabase, appUser, seasonId);

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
  const { authUser, appUser } = await getCurrentUser();

  if (!authUser || !appUser) {
    redirect('/login?redirectTo=/player');
  }

  const supabase = await createClient();
  const context = await getUserPermissionContext(supabase, appUser, seasonId);

  if (!context.isPlayer) {
    if (context.roles.length === 0) {
      redirect('/onboarding?reason=pending_access');
    }
    redirect('/?error=unauthorized_player');
  }

  return context;
});
