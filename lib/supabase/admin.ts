// =============================================================================
// ACC Auction Portal — Server-Only Supabase Admin Client
// =============================================================================
// Privileged client using SUPABASE_SERVICE_ROLE_KEY for server-side auction
// mutations where RLS strictly denies client-side INSERT/UPDATE (spec §23).
//
// STRICT SECURITY CONSTRAINTS (FAIL-CLOSED):
// - Requires SUPABASE_SERVICE_ROLE_KEY; fails closed with explicit error if missing.
// - NEVER falls back to NEXT_PUBLIC_SUPABASE_ANON_KEY or publishable keys.
// - NEVER imported by Client Components (enforced via browser context guard).
// - NEVER exposed to browser.
// - Session authorization (requireAdmin / requireFranchise) MUST execute
//   BEFORE any call to createAdminClient().
// =============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let cachedAdminClient: SupabaseClient | null = null;

/**
 * Creates or returns the singleton server-only Supabase admin client.
 * Strictly enforces browser execution prevention and fails closed if
 * SUPABASE_SERVICE_ROLE_KEY is not configured.
 */
export function createAdminClient(): SupabaseClient {
  if (typeof window !== 'undefined') {
    throw new Error(
      'FATAL SECURITY VIOLATION: createAdminClient called in browser context. Service-role operations must remain strictly server-side.'
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set.');
  }

  if (!serviceRoleKey) {
    throw new Error(
      'FATAL SECURITY CONFIGURATION ERROR: SUPABASE_SERVICE_ROLE_KEY is required for privileged auction mutations. The system fails closed with no fallback to anon or publishable keys.'
    );
  }

  if (cachedAdminClient) {
    return cachedAdminClient;
  }

  cachedAdminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return cachedAdminClient;
}
