import { getCurrentUser } from '@/lib/auth/session';
import { mockUser, type SessionUser } from '@/lib/acc/session';
import type { Role } from '@/lib/acc/nav';

/**
 * Server-side session resolver that fetches real Supabase Auth session
 * and user profile from public.users, falling back to role mock if needed.
 */
export async function getSessionUser(role: Role): Promise<SessionUser> {
  try {
    const { authUser, appUser } = await getCurrentUser();
    if (authUser) {
      return {
        name: appUser?.full_name || authUser.email?.split('@')[0] || (role === 'admin' ? 'Auction Admin' : 'User'),
        sub: authUser.email || '',
        avatarUrl: appUser?.avatar_url || undefined,
      };
    }
  } catch {
    // Fallback if not in a request context or not signed in
  }
  return mockUser(role);
}
