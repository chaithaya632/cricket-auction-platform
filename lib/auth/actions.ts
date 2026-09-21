'use server';

// =============================================================================
// ACC Auction Portal — Authentication Server Actions
// =============================================================================

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { loginSchema, signupSchema } from './validation';
import { formatAuthError } from './errors';
import { getCurrentUser } from './session';
import { getUserPermissionContext } from '@/lib/permissions/context';
import type { LoginInput, SignupInput, AuthActionResult } from './types';

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
 * Server action to register a new user with Supabase Auth.
 * Follows the principle of least privilege: users cannot self-assign
 * admin, franchise, or player roles during registration.
 */
export async function signupAction(
  input: SignupInput
): Promise<AuthActionResult> {
  // Validate input
  const validationResult = signupSchema.safeParse(input);
  if (!validationResult.success) {
    const firstError = validationResult.error.issues[0]?.message || 'Invalid registration details';
    return {
      success: false,
      error: firstError,
    };
  }

  const { fullName, email, password } = validationResult.data;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    if (error) {
      return {
        success: false,
        error: formatAuthError(error),
      };
    }

    // Check if email confirmation is required (user created without active session)
    if (data.user && !data.session) {
      return {
        success: true,
        emailConfirmationRequired: true,
        redirectTo: '/login?notice=confirmation_required',
      };
    }

    // If session was established immediately, redirect to the safe onboarding view
    return {
      success: true,
      emailConfirmationRequired: false,
      redirectTo: '/onboarding',
    };
  } catch (err) {
    return {
      success: false,
      error: formatAuthError(err),
    };
  }
}

/**
 * Server action to authenticate a user with email and password.
 * Resolves destination authoritatively via season_roles rather than trusting client parameters.
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

    // Resolve authoritative role-based destination
    let defaultDestination = '/onboarding';
    try {
      const { appUser } = await getCurrentUser();
      if (appUser) {
        const permContext = await getUserPermissionContext(supabase, appUser);
        if (permContext.isAdmin) {
          defaultDestination = '/admin';
        } else if (permContext.isFranchise) {
          defaultDestination = '/franchise';
        } else if (permContext.isPlayer) {
          defaultDestination = '/player';
        }
      }
    } catch {
      // If permission resolution fails, fall back to safe onboarding
      defaultDestination = '/onboarding';
    }

    const safeTarget = sanitizeRedirect(redirectTo);
    let finalTarget = defaultDestination;

    if (safeTarget !== '/' && safeTarget !== '/login' && safeTarget !== '/signup') {
      // If user requested a specific protected portal, verify they have genuine rights
      if (safeTarget.startsWith('/admin')) {
        finalTarget = defaultDestination === '/admin' ? safeTarget : defaultDestination;
      } else if (safeTarget.startsWith('/franchise')) {
        finalTarget = defaultDestination === '/franchise' ? safeTarget : defaultDestination;
      } else if (safeTarget.startsWith('/player')) {
        finalTarget = defaultDestination === '/player' ? safeTarget : defaultDestination;
      } else {
        // Public or neutral destination (e.g. /auction, /players, /teams, /onboarding)
        finalTarget = safeTarget;
      }
    }

    return {
      success: true,
      redirectTo: finalTarget,
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

