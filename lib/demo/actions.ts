'use server';

// =============================================================================
// ACC Auction Portal — Demo Mode Server Actions
// =============================================================================
// Admin-only server action to disable demo mode in the rehearsal environment.
//
// SECURITY LAYERS (all must pass):
// 1. Authenticated admin (requireAdmin + isSuperAdmin)
// 2. Demo environment verification (not production)
// 3. Explicit confirmation phrase match
// 4. Demo-only data cleanup (isolated rehearsal DB only)
//
// FAIL CLOSED: If any check fails, no data is modified.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/permissions/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { writeAuditLog } from '@/lib/audit/logger';
import {
  isProductionEnvironment,
  isDemoEnvironment,
  verifyDemoEnvironment,
  verifyDemoCleanupPermission,
  DEMO_MODE_CONFIG_KEY,
  extractProjectRef,
  REQUIRED_CONFIRMATION_PHRASE,
  PRODUCTION_PROJECT_REF,
  DEMO_PROJECT_REF,
} from './config';

export type DisableDemoResult = {
  success: boolean;
  error?: string;
  deletedCounts?: {
    auctionEvents: number;
    auctionLots: number;
    skillProfiles: number;
    registrations: number;
    franchiseMembers: number;
    seasonRoles: number;
    players: number;
    franchises: number;
  };
};

/**
 * Disables demo mode and removes demo data from the rehearsal database.
 * 
 * GUARDS:
 * - Must be super_admin
 * - Must be demo/rehearsal environment (not production)
 * - Must provide exact confirmation phrase "REMOVE DEMO"
 * 
 * FAIL CLOSED: Returns error if any guard fails.
 */
export async function disableDemoModeAction(
  confirmationPhrase: string
): Promise<DisableDemoResult> {
  // ── GUARD 1: Authenticated super admin ──
  let adminContext;
  try {
    adminContext = await requireAdmin();
  } catch {
    return { success: false, error: 'Authentication required. Please log in as an administrator.' };
  }

  const permCheck = verifyDemoCleanupPermission(adminContext);
  if (!permCheck.allowed) {
    return { success: false, error: permCheck.error || 'Unauthorized.' };
  }

  // ── GUARD 2: Confirmation phrase ──
  if (confirmationPhrase !== REQUIRED_CONFIRMATION_PHRASE) {
    return { success: false, error: `Invalid confirmation phrase. Please type "${REQUIRED_CONFIRMATION_PHRASE}" to confirm.` };
  }

  // ── GUARD 3: Environment verification (fail-closed) ──
  const envCheck = verifyDemoEnvironment();
  if (!envCheck.allowed) {
    return {
      success: false,
      error: envCheck.error || 'Demo cleanup is unavailable in this environment.',
    };
  }

  // ── GUARD 4: Triple-check project ref against approved demo allowlist ──
  const projectRef = envCheck.projectRef;
  if (!projectRef || projectRef !== DEMO_PROJECT_REF) {
    return {
      success: false,
      error: 'FAIL CLOSED: Environment verification failed on final check. Only the approved demo project is permitted.',
    };
  }

  // ── All guards passed — proceed with cleanup ──
  const supabase = createAdminClient();
  const seasonId = adminContext.activeSeason?.id || '00000000-0000-0000-0000-000000000001';

  try {
    // Delete in FK-safe order (children first, parents last)

    // 1. Auction events (depends on auction_lots)
    const { data: events } = await supabase
      .from('auction_events')
      .delete()
      .eq('season_id', seasonId)
      .select('id');
    const auctionEvents = events?.length ?? 0;

    // 2. Auction lots (depends on registrations, franchises)
    const { data: lots } = await supabase
      .from('auction_lots')
      .delete()
      .eq('season_id', seasonId)
      .select('id');
    const auctionLots = lots?.length ?? 0;

    // 3. Franchise referrals
    await supabase
      .from('franchise_referrals')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    // 4. Skill profiles (depends on registrations)
    const { data: regIds } = await supabase
      .from('player_season_registrations')
      .select('id')
      .eq('season_id', seasonId);
    let skillProfiles = 0;
    if (regIds && regIds.length > 0) {
      const ids = regIds.map((r: { id: string }) => r.id);
      const { data: sp } = await supabase
        .from('player_skill_profiles')
        .delete()
        .in('registration_id', ids)
        .select('id');
      skillProfiles = sp?.length ?? 0;
    }

    // 5. Player season registrations
    const { data: regs } = await supabase
      .from('player_season_registrations')
      .delete()
      .eq('season_id', seasonId)
      .select('id');
    const registrations = regs?.length ?? 0;

    // 6. Franchise members (depends on franchises)
    const { data: fIds } = await supabase
      .from('franchises')
      .select('id')
      .eq('season_id', seasonId);
    let franchiseMembers = 0;
    if (fIds && fIds.length > 0) {
      const ids = fIds.map((f: { id: string }) => f.id);
      const { data: fm } = await supabase
        .from('franchise_members')
        .delete()
        .in('franchise_id', ids)
        .select('id');
      franchiseMembers = fm?.length ?? 0;
    }

    // 7. Season roles (but preserve the acting admin's own role)
    const { data: roles } = await supabase
      .from('season_roles')
      .delete()
      .eq('season_id', seasonId)
      .neq('user_id', adminContext.user.id)
      .select('id');
    const seasonRoles = roles?.length ?? 0;

    // 8. Franchises
    const { data: franchisesDeleted } = await supabase
      .from('franchises')
      .delete()
      .eq('season_id', seasonId)
      .select('id');
    const franchises = franchisesDeleted?.length ?? 0;

    // 9. Players (only those not referenced by other seasons)
    const { data: playersDeleted } = await supabase
      .from('players')
      .delete()
      .neq('id', adminContext.user.id)
      .select('id');
    const players = playersDeleted?.length ?? 0;

    // 10. Mark demo mode as disabled in season_config
    await supabase.from('season_config').upsert({
      season_id: seasonId,
      key: DEMO_MODE_CONFIG_KEY,
      value: 'false',
      value_type: 'boolean',
      description: 'Demo mode status — set to false after judge evaluation cleanup',
    }, { onConflict: 'season_id,key' });

    // 11. Write audit log entry (preserves audit accountability)
    await writeAuditLog({
      seasonId,
      actorUserId: adminContext.user.id,
      action: 'DISABLE_DEMO_MODE',
      entityType: 'season_config',
      entityId: null,
      reason: 'Judge evaluation complete. Controlled demonstration data cleanup.',
      metadata: {
        projectRef,
        deletedCounts: {
          auctionEvents,
          auctionLots,
          skillProfiles,
          registrations,
          franchiseMembers,
          seasonRoles,
          players,
          franchises,
        },
      },
    }, supabase);

    revalidatePath('/admin/settings');
    revalidatePath('/admin');

    return {
      success: true,
      deletedCounts: {
        auctionEvents,
        auctionLots,
        skillProfiles,
        registrations,
        franchiseMembers,
        seasonRoles,
        players,
        franchises,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during cleanup';
    return { success: false, error: `Cleanup failed: ${message}` };
  }
}

/**
 * Enables demo mode in the approved rehearsal/demo database.
 * 
 * GUARDS:
 * - Must be super_admin
 * - Must be approved DEMO_PROJECT_REF (enompvfdfhynfncgpiuz)
 * 
 * FAIL CLOSED: Returns error if any guard fails.
 */
export async function enableDemoModeAction(): Promise<{
  success: boolean;
  error?: string;
}> {
  let adminContext;
  try {
    adminContext = await requireAdmin();
  } catch {
    return { success: false, error: 'Authentication required. Please log in as an administrator.' };
  }

  const permCheck = verifyDemoCleanupPermission(adminContext);
  if (!permCheck.allowed) {
    return { success: false, error: permCheck.error || 'Unauthorized.' };
  }

  const envCheck = verifyDemoEnvironment();
  if (!envCheck.allowed) {
    return {
      success: false,
      error: envCheck.error || 'Demo Mode operations are unavailable in this environment.',
    };
  }

  const projectRef = envCheck.projectRef;
  if (!projectRef || projectRef !== DEMO_PROJECT_REF) {
    return {
      success: false,
      error: 'FAIL CLOSED: Environment verification failed on final check. Only the approved demo project is permitted.',
    };
  }

  const supabase = createAdminClient();
  const seasonId = adminContext.activeSeason?.id || '00000000-0000-0000-0000-000000000001';

  try {
    await supabase.from('season_config').upsert({
      season_id: seasonId,
      key: DEMO_MODE_CONFIG_KEY,
      value: 'true',
      value_type: 'boolean',
      description: 'Demo mode status — enabled for judge evaluation',
    }, { onConflict: 'season_id,key' });

    await writeAuditLog({
      seasonId,
      actorUserId: adminContext.user.id,
      action: 'ENABLE_DEMO_MODE',
      entityType: 'season_config',
      entityId: null,
      reason: 'Judge evaluation demo mode enabled.',
      metadata: {
        projectRef,
      },
    }, supabase);

    revalidatePath('/admin/settings');
    revalidatePath('/admin');

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error enabling demo mode';
    return { success: false, error: `Failed to enable demo mode: ${message}` };
  }
}

/**
 * Returns current demo mode status for the settings page.
 * Safe to call from server components — read-only.
 * STRICTLY restricted: Only authenticated Super Admin in the approved demo environment
 * will receive isDemoEnv: true. For anyone else or in production, returns isDemoEnv: false.
 */
export async function getDemoStatusAction(): Promise<{
  isDemoEnv: boolean;
  isDemoActive: boolean;
  projectRef: string | null;
}> {
  // Authorization Guard: Only Super Admin can view demo controls
  try {
    const adminContext = await requireAdmin();
    if (!adminContext.isSuperAdmin) {
      return { isDemoEnv: false, isDemoActive: false, projectRef: null };
    }
  } catch {
    return { isDemoEnv: false, isDemoActive: false, projectRef: null };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const projectRef = extractProjectRef(url);
  const isDemoEnv = isDemoEnvironment(url);

  if (!isDemoEnv || projectRef !== DEMO_PROJECT_REF) {
    return { isDemoEnv: false, isDemoActive: false, projectRef };
  }

  const supabase = createAdminClient();
  const { data } = await supabase
    .from('season_config')
    .select('value')
    .eq('season_id', '00000000-0000-0000-0000-000000000001')
    .eq('key', DEMO_MODE_CONFIG_KEY)
    .maybeSingle();

  const isDemoActive = data ? data.value === 'true' : true;

  return { isDemoEnv, isDemoActive, projectRef };
}
