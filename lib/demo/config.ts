// =============================================================================
// ACC Auction Portal — Demo Mode Configuration
// =============================================================================
// Environment-level detection for demo/rehearsal mode.
// Uses the Supabase project URL to determine if the current environment
// is a rehearsal/demo environment vs. production.
//
// SECURITY: Production environment (btlmiewfyyevtxgywpwy) NEVER allows
// demo cleanup operations. Fail closed.
// =============================================================================

import type { UserPermissionContext } from '@/lib/permissions/types';

/**
 * Known Supabase project references.
 * Production project is hardcoded to prevent accidental cleanup.
 * DEMO_PROJECT_REF is the ONLY approved rehearsal/demo project.
 */
export const PRODUCTION_PROJECT_REF = 'btlmiewfyyevtxgywpwy';
export const DEMO_PROJECT_REF = 'enompvfdfhynfncgpiuz';
export const REHEARSAL_PROJECT_REF = DEMO_PROJECT_REF;

export const REQUIRED_CONFIRMATION_PHRASE = 'REMOVE DEMO';

/**
 * Extracts the Supabase project reference from a URL.
 * e.g. "https://enompvfdfhynfncgpiuz.supabase.co" → "enompvfdfhynfncgpiuz"
 */
export function extractProjectRef(url?: string | null): string | null {
  if (!url) return null;
  try {
    const hostname = new URL(url).hostname;
    const match = hostname.match(/^([a-z0-9]+)\.supabase\.co$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Determines if the given or current Supabase environment is the production project.
 * Returns true for the known production project ref, or if the URL cannot be parsed (fail closed).
 */
export function isProductionEnvironment(url?: string | null): boolean {
  const targetUrl = url !== undefined ? url : process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!targetUrl) return true; // Fail closed: no URL = assume production
  const ref = extractProjectRef(targetUrl);
  if (!ref) return true; // Fail closed: can't parse = assume production
  return ref === PRODUCTION_PROJECT_REF;
}

/**
 * Determines if the given or current Supabase environment is the approved demo/rehearsal project.
 * Uses an explicit allowlist (DEMO_PROJECT_REF). Returns false for production or any unknown project.
 */
export function isDemoEnvironment(url?: string | null): boolean {
  const targetUrl = url !== undefined ? url : process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!targetUrl) return false; // Fail closed
  const ref = extractProjectRef(targetUrl);
  if (!ref) return false; // Fail closed
  return ref === DEMO_PROJECT_REF; // STRICT ALLOWLIST
}

/**
 * Verifies environment safety for demo operations using strict allowlisting.
 * Behavior:
 * - projectRef === enompvfdfhynfncgpiuz → allowed: true
 * - projectRef === btlmiewfyyevtxgywpwy → allowed: false, fail closed
 * - projectRef === anything else        → allowed: false, fail closed
 * - missing URL                         → allowed: false, fail closed
 * - malformed URL                       → allowed: false, fail closed
 */
export function verifyDemoEnvironment(url?: string | null): {
  allowed: boolean;
  projectRef: string | null;
  error?: string;
} {
  const targetUrl = url !== undefined ? url : process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!targetUrl) {
    return {
      allowed: false,
      projectRef: null,
      error: 'Demo Mode operations are unavailable because the Supabase URL is missing.',
    };
  }

  const projectRef = extractProjectRef(targetUrl);
  if (!projectRef) {
    return {
      allowed: false,
      projectRef: null,
      error: 'Demo Mode operations are unavailable because the environment URL could not be verified as a valid Supabase project.',
    };
  }

  if (projectRef === PRODUCTION_PROJECT_REF) {
    return {
      allowed: false,
      projectRef,
      error: 'Demo Mode operations are unavailable in the production environment.',
    };
  }

  if (projectRef !== DEMO_PROJECT_REF) {
    return {
      allowed: false,
      projectRef,
      error: `Demo cleanup is unavailable because the environment (${projectRef}) is not the approved demo/rehearsal environment (${DEMO_PROJECT_REF}).`,
    };
  }

  return {
    allowed: true,
    projectRef,
  };
}

/**
 * Validates permission context for demo mode operations.
 * Strictly requires super_admin role.
 */
export function verifyDemoCleanupPermission(context: UserPermissionContext | null): {
  allowed: boolean;
  error?: string;
} {
  if (!context) {
    return {
      allowed: false,
      error: 'Authentication required. Please log in as an administrator.',
    };
  }

  if (!context.isAdmin) {
    if (context.isFranchise) {
      return {
        allowed: false,
        error: 'Unauthorized: Franchise representatives cannot manage demo mode.',
      };
    }
    if (context.isPlayer) {
      return {
        allowed: false,
        error: 'Unauthorized: Players cannot manage demo mode.',
      };
    }
    return {
      allowed: false,
      error: 'Unauthorized: Administrative privileges required.',
    };
  }

  if (!context.isSuperAdmin) {
    return {
      allowed: false,
      error: 'Unauthorized: Only Super Admin can manage demo mode.',
    };
  }

  return { allowed: true };
}

/**
 * Season config key used to track demo mode state.
 * Stored in the existing season_config table — no schema changes needed.
 */
export const DEMO_MODE_CONFIG_KEY = 'demo_mode_enabled';

/**
 * Returns the demo mode status from the season_config table.
 * If no key exists, demo mode is considered active in demo environments.
 */
export async function getDemoModeStatus(
  supabase: { from: (table: string) => any },
  seasonId: string
): Promise<{ isDemoEnv: boolean; isDemoActive: boolean }> {
  const isDemoEnv = isDemoEnvironment();

  if (!isDemoEnv) {
    return { isDemoEnv: false, isDemoActive: false };
  }

  const { data } = await supabase
    .from('season_config')
    .select('value')
    .eq('season_id', seasonId)
    .eq('key', DEMO_MODE_CONFIG_KEY)
    .maybeSingle();

  // If no config key exists, demo mode is active by default in demo environments
  const isDemoActive = data ? data.value === 'true' : true;

  return { isDemoEnv, isDemoActive };
}
