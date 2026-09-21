'use server';

// =============================================================================
// ACC Auction Portal — Authentication Server Actions
// =============================================================================

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { loginSchema } from './validation';
import { formatAuthError } from './errors';
import type { LoginInput, AuthActionResult } from './types';

/**
 * Safely sanitizes a redirect target to prevent open redirect vulnerabilities.
 * Only allows relative paths starting with '/'.
 */
function sanitizeRedirect(target?: string | null): string {
  if (!target || typeof target !== 'string') {
    return '/';
  }
  // Must start with '/' and must not start with '//' (protocol-relative URL)
  if (target.startsWith('/') && !target.startsWith('//')) {
    return target;
  }
  return '/';
}

/**
 * Server action to authenticate a user with email and password.
 */
export async function loginAction(
  credentials: LoginInput,
  redirectTo?: string | null
): Promise<AuthActionResult> {
  // Validate input
  const validationResult = loginSchema.safeParse(credentials);
  if (!validationResult.success) {
    const firstError = validationResult.error.issues[0]?.message || 'Invalid email or password';
    return {
      success: false,
      error: firstError,
    };
  }

  const { email, password } = validationResult.data;

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return {
        success: false,
        error: formatAuthError(error),
      };
    }

    const safeTarget = sanitizeRedirect(redirectTo);
    return {
      success: true,
      redirectTo: safeTarget,
    };
  } catch (err) {
    return {
      success: false,
      error: formatAuthError(err),
    };
  }
}

/**
 * Server action to log out the current user and redirect to /login.
 */
export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
