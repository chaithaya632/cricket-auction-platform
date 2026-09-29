// =============================================================================
// ACC Match System — Scorer & Match Authorization Guards
// =============================================================================
// Fail-closed server authorization. Authenticated user is the only identity source.
// Query parameters and client-supplied headers are strictly ignored.
// =============================================================================

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { getUserPermissionContext } from '@/lib/permissions/context';
import type { DbUser } from '@/lib/db/types';

export interface MatchScorerContext {
  user: DbUser;
  matchId: string;
  isAdmin: boolean;
  isAssignedScorer: boolean;
}

/**
 * Authorizes a user to score or mutate a specific match.
 *
 * ALLOW if:
 * 1. User is authenticated AND has active super_admin role in active season
 * OR
 * 2. User is authenticated AND has active operator role in active season
 * OR
 * 3. User is authenticated AND has an active match_scorers assignment for this exact match
 *
 * DENIES all others. Throws an error or returns fail-closed state.
 */
export const requireMatchScorer = cache(async (matchId: string): Promise<MatchScorerContext> => {
  if (!matchId) {
    throw new Error('MATCH_AUTH_ERROR: Match ID is required.');
  }

  const { authUser, appUser } = await getCurrentUser();

  if (!authUser || !appUser) {
    throw new Error('UNAUTHORIZED: You must be logged in to score a match.');
  }

  const supabase = await createClient();

  // 1. Check if user is active super_admin or operator in current season
  const permContext = await getUserPermissionContext(supabase, appUser);
  if (permContext.isAdmin) {
    return {
      user: appUser,
      matchId,
      isAdmin: true,
      isAssignedScorer: false,
    };
  }

  // 2. Check match_scorers table for explicit match assignment
  const { data: assignment, error } = await supabase
    .from('match_scorers')
    .select('id, is_active')
    .eq('match_id', matchId)
    .eq('user_id', appUser.id)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !assignment) {
    throw new Error('UNAUTHORIZED_MATCH_SCORER: You are not authorized to score this match.');
  }

  return {
    user: appUser,
    matchId,
    isAdmin: false,
    isAssignedScorer: true,
  };
});
