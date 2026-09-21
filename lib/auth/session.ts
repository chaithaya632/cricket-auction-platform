// =============================================================================
// ACC Auction Portal — Server-side Session & User Retrieval
// =============================================================================

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { DbUser } from '@/lib/db/types';
import type { User as SupabaseAuthUser, Session as SupabaseAuthSession } from '@supabase/supabase-js';

/**
 * Retrieves the current raw Supabase session from cookies.
 * Memoized per server render cycle with React cache().
 */
export const getAuthSession = cache(async (): Promise<SupabaseAuthSession | null> => {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
});

/**
 * Retrieves and validates the authenticated Supabase user.
 * Always contacts Supabase auth server to ensure the session is not revoked.
 * Memoized per server render cycle with React cache().
 */
export const getAuthUser = cache(async (): Promise<SupabaseAuthUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
});

/**
 * Retrieves both the authenticated Supabase user and the corresponding
 * application profile record from `public.users`.
 * Memoized per server render cycle with React cache().
 *
 * If the user is authenticated in Supabase Auth but their `public.users` row
 * does not exist yet (e.g. edge-case where trigger did not fire), attempts
 * a self-profile creation matching `id = authUser.id`.
 */
export const getCurrentUser = cache(async (): Promise<{
  authUser: SupabaseAuthUser | null;
  appUser: DbUser | null;
}> => {
  const authUser = await getAuthUser();
  if (!authUser) {
    return { authUser: null, appUser: null };
  }

  const supabase = await createClient();

  const { data: appUser, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle();

  if (appUser && !error) {
    return { authUser, appUser: appUser as DbUser };
  }

  // Fallback: sync public.users row for this authenticated user
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
      avatar_url: authUser.user_metadata?.avatar_url || null,
      is_active: true,
    })
    .select('*')
    .maybeSingle();

  return {
    authUser,
    appUser: (createdUser as DbUser) || null,
  };
});
