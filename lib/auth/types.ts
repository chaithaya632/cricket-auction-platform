// =============================================================================
// ACC Auction Portal — Authentication Types
// =============================================================================

import type { User as SupabaseAuthUser, Session as SupabaseAuthSession } from '@supabase/supabase-js';
import type { DbUser } from '@/lib/db/types';

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  authUser: SupabaseAuthUser | null;
  appUser: DbUser | null;
  session: SupabaseAuthSession | null;
}

export interface AuthActionResult {
  success: boolean;
  error?: string;
  redirectTo?: string;
}
