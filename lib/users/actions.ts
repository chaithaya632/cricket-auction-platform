'use server';

// =============================================================================
// ACC Auction Portal — User & Role Management Server Actions
// =============================================================================

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/permissions/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import type { AssignRoleInput, AssignRoleResult } from './types';

/**
 * Privileged Admin Action to assign or update a tournament role for a user.
 * Manages season_roles and franchise_members tables with full referential safety.
 */
export async function adminAssignRoleAction(
  input: AssignRoleInput
): Promise<AssignRoleResult> {
  try {
    const adminContext = await requireAdmin();
    const activeSeason = adminContext.activeSeason;
    const targetSeasonId = activeSeason?.id || '00000000-0000-0000-0000-000000000001';

    if (!input.userId) {
      return { success: false, error: 'User ID is required.' };
    }

    const permittedRoles = ['super_admin', 'operator', 'franchise', 'player', 'viewer'] as const;
    if (!permittedRoles.includes(input.role as any)) {
      return { success: false, error: `Invalid role: ${input.role}` };
    }

    if ((input.role === 'super_admin' || input.role === 'operator') && !adminContext.isSuperAdmin) {
      return { success: false, error: 'Unauthorized: Only Super Admin can assign administrative roles.' };
    }

    if (input.role === 'franchise' && !input.franchiseId) {
      return { success: false, error: 'Franchise selection is required for franchise role assignment.' };
    }

    const adminClient = createAdminClient();

    // 1. Verify user exists in public.users (or sync from auth.users)
    let { data: userRecord, error: userErr } = await adminClient
      .from('users')
      .select('id, full_name, email')
      .eq('id', input.userId)
      .maybeSingle();

    if (userErr || !userRecord) {
      try {
        const { data: authUser } = await adminClient.auth.admin.getUserById(input.userId);
        if (authUser?.user) {
          const syncedUser = {
            id: authUser.user.id,
            email: authUser.user.email || '',
            full_name: (authUser.user.user_metadata?.full_name as string) || authUser.user.email?.split('@')[0] || 'User',
            is_active: true,
          };
          await adminClient.from('users').upsert(syncedUser);
          userRecord = syncedUser;
        }
      } catch {
        // Ignore fallback error
      }
    }

    if (!userRecord) {
      return { success: false, error: 'Target user record not found.' };
    }

    // 2. If franchise role, verify franchise exists and is active (decoupled from season status)
    if (input.role === 'franchise' && input.franchiseId) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.franchiseId);
      if (!isUuid) {
        return { success: false, error: 'Selected franchise was not found. Invalid franchise identifier.' };
      }

      const { data: franchiseRecord, error: franchiseErr } = await adminClient
        .from('franchises')
        .select('id, name, season_id, is_active')
        .eq('id', input.franchiseId)
        .eq('is_active', true)
        .maybeSingle();

      if (franchiseErr || !franchiseRecord) {
        return { success: false, error: 'Selected franchise was not found in this season.' };
      }
    }

    // 3. Clear any existing season roles for this user in this season to avoid role collisions
    await adminClient
      .from('season_roles')
      .delete()
      .eq('user_id', input.userId)
      .eq('season_id', targetSeasonId);

    // 4. Insert new season_roles record
    const { error: insertErr } = await adminClient
      .from('season_roles')
      .insert({
        user_id: input.userId,
        season_id: targetSeasonId,
        role: input.role,
        franchise_id: input.role === 'franchise' ? input.franchiseId : null,
        is_active: true,
      });

    if (insertErr) {
      return { success: false, error: insertErr.message || 'Failed to assign season role.' };
    }

    // 5. If assigning franchise role, also link in franchise_members
    if (input.role === 'franchise' && input.franchiseId) {
      await adminClient
        .from('franchise_members')
        .upsert(
          {
            franchise_id: input.franchiseId,
            user_id: input.userId,
            role: 'representative',
            is_active: true,
          },
          { onConflict: 'franchise_id,user_id' }
        );
    }

    revalidatePath('/admin/users');
    revalidatePath('/admin');
    revalidatePath('/onboarding');
    revalidatePath('/franchise');
    revalidatePath('/player');

    return {
      success: true,
      message: `User ${userRecord.full_name} (${userRecord.email}) assigned role '${input.role}'.`,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to assign role.' };
  }
}

/**
 * Privileged Admin Action to revoke/deactivate a user's season role.
 */
export async function adminRevokeRoleAction(
  userId: string
): Promise<AssignRoleResult> {
  try {
    const adminContext = await requireAdmin();
    const activeSeason = adminContext.activeSeason;

    if (!activeSeason) {
      return { success: false, error: 'No active season found.' };
    }

    const adminClient = createAdminClient();

    // 1. Remove season role for this season
    await adminClient
      .from('season_roles')
      .delete()
      .eq('user_id', userId)
      .eq('season_id', activeSeason.id);

    // 2. Mark any franchise memberships inactive
    await adminClient
      .from('franchise_members')
      .update({ is_active: false })
      .eq('user_id', userId);

    revalidatePath('/admin/users');
    revalidatePath('/admin');
    revalidatePath('/onboarding');
    revalidatePath('/franchise');
    revalidatePath('/player');

    return {
      success: true,
      message: 'Tournament role revoked successfully.',
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to revoke role.' };
  }
}

/**
 * Privileged Admin Action to permanently delete a user account.
 * Deletes:
 * - Supabase Auth account (auth.users)
 * - Public user profile (public.users)
 * - Associated player record, season registration, skill profile, and storage photo (frees roll number for reuse!)
 * - Franchise memberships and season roles
 */
export async function adminDeleteUserAction(
  userId: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    const adminContext = await requireAdmin();
    if (!adminContext.isSuperAdmin) {
      return { success: false, error: 'Unauthorized: Only Super Admin can permanently delete user accounts.' };
    }
    const adminClient = createAdminClient();

    // 1. Fetch user to verify existence
    const { data: userRecord } = await adminClient
      .from('users')
      .select('id, full_name, email')
      .eq('id', userId)
      .maybeSingle();

    // 2. Fetch associated player record if any
    const { data: playerRecord } = await adminClient
      .from('players')
      .select('id, photo_url, roll_number')
      .eq('id', userId)
      .maybeSingle();

    // 3. Delete photo from storage if present
    if (playerRecord?.photo_url) {
      try {
        const match = playerRecord.photo_url.match(/player-photos\/(.+)$/);
        if (match && match[1]) {
          await adminClient.storage.from('player-photos').remove([decodeURIComponent(match[1])]);
        }
      } catch {
        // Non-fatal photo cleanup error
      }
    }

    // 4. Delete dependent player records (skill profiles, registrations, referrals)
    const { data: registrations } = await adminClient
      .from('player_season_registrations')
      .select('id')
      .eq('player_id', userId);

    const regIds = registrations?.map((r) => r.id) || [];
    if (regIds.length > 0) {
      await adminClient.from('player_skill_profiles').delete().in('registration_id', regIds);
      await adminClient.from('franchise_referrals').delete().in('registration_id', regIds);
      await adminClient.from('auction_lots').delete().in('registration_id', regIds);
      await adminClient.from('franchise_members').update({ player_registration_id: null }).in('player_registration_id', regIds);
      await adminClient.from('player_season_registrations').delete().eq('player_id', userId);
    }

    // 5. Delete player record (frees roll number for reuse immediately!)
    await adminClient.from('players').delete().eq('id', userId);

    // 6. Delete franchise memberships and season roles
    await adminClient.from('franchise_members').delete().eq('user_id', userId);
    await adminClient.from('season_roles').delete().eq('user_id', userId);

    // 7. Delete public user record
    await adminClient.from('users').delete().eq('id', userId);

    // 8. Delete from auth.users via Supabase Auth Admin API
    try {
      await adminClient.auth.admin.deleteUser(userId);
    } catch {
      // Non-fatal if user is not in auth.users
    }

    revalidatePath('/admin/users');
    revalidatePath('/admin/players');
    revalidatePath('/admin');
    revalidatePath('/players');

    return {
      success: true,
      message: `User ${userRecord?.full_name || userId} was permanently deleted. Roll number has been released for reuse.`,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to delete user account.' };
  }
}

