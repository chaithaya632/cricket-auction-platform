'use server';

// =============================================================================
// ACC Auction Portal — Franchise Server Actions
// =============================================================================

import { revalidatePath } from 'next/cache';
import { requireAdmin, requireFranchise } from '@/lib/permissions/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { writeAuditLog } from '@/lib/audit/logger';
import type { DbFranchise } from '@/lib/db/types';
import {
  adminCreateFranchiseSchema,
  type AdminCreateFranchiseInput,
} from '@/lib/franchises/validation';

export type { AdminCreateFranchiseInput };

export interface AdminFranchiseActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  mode?: 'deleted' | 'deactivated';
}

/**
 * Privileged Admin Action to register a new franchise for the active season.
 */
export async function adminCreateFranchiseAction(
  input: AdminCreateFranchiseInput
): Promise<AdminFranchiseActionResult<DbFranchise>> {
  try {
    const adminContext = await requireAdmin();
    const activeSeason = adminContext.activeSeason;

    if (!activeSeason) {
      return { success: false, error: 'No active season found for franchise creation.' };
    }

    const validation = adminCreateFranchiseSchema.safeParse(input);
    if (!validation.success) {
      return {
        success: false,
        error: validation.error.issues[0]?.message || 'Invalid franchise details',
      };
    }

    const data = validation.data;
    const adminClient = createAdminClient();

    // Check for duplicate name or short_name in this season
    const { data: existing } = await adminClient
      .from('franchises')
      .select('id, name, short_name')
      .eq('season_id', activeSeason.id)
      .or(`name.ilike.${data.name},short_name.ilike.${data.short_name}`)
      .maybeSingle();

    if (existing) {
      return {
        success: false,
        error: `A franchise with name "${data.name}" or code "${data.short_name}" already exists in this season.`,
      };
    }

    const { data: newFranchise, error: insertError } = await adminClient
      .from('franchises')
      .insert({
        season_id: activeSeason.id,
        name: data.name,
        short_name: data.short_name,
        color_primary: data.color_primary,
        color_secondary: data.color_secondary,
        faculty_coordinator_name: data.faculty_coordinator_name || null,
        faculty_coordinator_mobile: data.faculty_coordinator_mobile || null,
        is_active: true,
      })
      .select('*')
      .single();

    if (insertError || !newFranchise) {
      return {
        success: false,
        error: insertError?.message || 'Failed to create franchise record.',
      };
    }

    revalidatePath('/admin/franchises');
    revalidatePath('/admin');
    revalidatePath('/teams');

    return { success: true, data: newFranchise as DbFranchise };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to create franchise',
    };
  }
}

/**
 * Privileged Admin Action to delete or deactivate a franchise.
 * Protects immutable auction history:
 * - If the franchise has historical auction events (bids, hammer), deactivates instead of deleting.
 * - If the franchise has no auction participation, safely deletes the record.
 */
export async function adminDeleteFranchiseAction(
  franchiseId: string,
  options?: { forceHardDelete?: boolean }
): Promise<AdminFranchiseActionResult<{ franchiseId: string; message: string }>> {
  try {
    const adminContext = await requireAdmin();
    if (!adminContext.isSuperAdmin) {
      return { success: false, error: 'Unauthorized: Only Super Admin has authority to delete or deactivate franchises.' };
    }
    const adminClient = createAdminClient();

    // 1. Fetch targeted franchise
    const { data: franchise, error: fetchErr } = await adminClient
      .from('franchises')
      .select('id, name, short_name')
      .eq('id', franchiseId)
      .maybeSingle();

    if (fetchErr || !franchise) {
      return { success: false, error: 'Franchise not found.' };
    }

    // Protection for the 11 production franchises
    const CANONICAL_PROD_CODES = new Set(['AT', 'CC', 'CCO', 'EE', 'GG', 'MM', 'NK', 'PP', 'RR', 'TT', 'VV']);
    if (CANONICAL_PROD_CODES.has(franchise.short_name.toUpperCase())) {
      return {
        success: false,
        error: `Production Safeguard: Franchise ${franchise.name} (${franchise.short_name}) is one of the 11 official ACC franchises and cannot be deleted.`,
      };
    }

    // 2. Check for auction event records
    const { count: eventCount } = await adminClient
      .from('auction_events')
      .select('id', { count: 'exact', head: true })
      .eq('franchise_id', franchiseId);

    const { count: lotCount } = await adminClient
      .from('auction_lots')
      .select('id', { count: 'exact', head: true })
      .eq('highest_bidder_franchise_id', franchiseId);

    const hasAuctionHistory = (eventCount && eventCount > 0) || (lotCount && lotCount > 0);

    // 3. Safe deactivation if auction history exists and forceHardDelete is false
    if (hasAuctionHistory && !options?.forceHardDelete) {
      await adminClient
        .from('franchises')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', franchiseId);

      await adminClient
        .from('franchise_members')
        .update({ is_active: false })
        .eq('franchise_id', franchiseId);

      await adminClient
        .from('season_roles')
        .update({ is_active: false })
        .eq('franchise_id', franchiseId);

      revalidatePath('/admin/franchises');
      revalidatePath('/admin');
      revalidatePath('/teams');

      return {
        success: true,
        mode: 'deactivated',
        data: {
          franchiseId,
          message: `Franchise ${franchise.name} (${franchise.short_name}) has auction records and was safely deactivated without destroying historical audit logs.`,
        },
      };
    }

    // 4. Hard deletion for disposable test franchise
    // Clean up dependent events and bids if forceHardDelete is requested
    if (options?.forceHardDelete) {
      await adminClient.from('auction_events').delete().eq('franchise_id', franchiseId);
      await adminClient
        .from('auction_lots')
        .update({ highest_bidder_franchise_id: null, current_bid: 0 })
        .eq('highest_bidder_franchise_id', franchiseId);
      await adminClient
        .from('auction_lots')
        .update({ buyer_franchise_id: null, sale_price: null, status: 'unsold' })
        .eq('buyer_franchise_id', franchiseId);
    }

    // Clean up dependent roles and memberships (franchise users become unassigned)
    await adminClient.from('season_roles').delete().eq('franchise_id', franchiseId);
    await adminClient.from('franchise_members').delete().eq('franchise_id', franchiseId);
    await adminClient.from('franchise_referrals').delete().eq('franchise_id', franchiseId);

    const { error: deleteErr } = await adminClient
      .from('franchises')
      .delete()
      .eq('id', franchiseId);

    if (deleteErr) {
      return {
        success: false,
        error: `Could not delete franchise: ${deleteErr.message}`,
      };
    }

    revalidatePath('/admin/franchises');
    revalidatePath('/admin');
    revalidatePath('/teams');

    return {
      success: true,
      mode: 'deleted',
      data: {
        franchiseId,
        message: `Franchise ${franchise.name} (${franchise.short_name}) was successfully removed.`,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to delete franchise',
    };
  }
}

export interface AssignLeaderInput {
  franchiseId: string;
  role: 'captain' | 'vice_captain';
  registrationId: string;
}

/**
 * Assigns a Captain or Vice-Captain to a franchise (§6, §7).
 *
 * Rules enforced:
 * 1. Registered player: Must already be registered as a player in this season.
 * 2. Cross-franchise uniqueness: Once one franchise claims a player, no other franchise can claim him (§6).
 * 3. Free & outside auction: Cost 0, sits outside 15 auction purchases.
 * 4. Pool removal: Captain and vice-captain never enter the auction pool (§6).
 * 5. Single leadership seat: Exactly one active captain and one active vice-captain per franchise.
 */
export async function assignFranchiseLeaderAction(
  input: AssignLeaderInput
): Promise<AdminFranchiseActionResult<{ memberId: string; role: string }>> {
  try {
    const adminClient = createAdminClient();

    // 1. Authorization: Super Admin or representative of target franchise
    let actorUserId: string;
    try {
      const adminCtx = await requireAdmin();
      actorUserId = adminCtx.user.id;
    } catch {
      const franchiseCtx = await requireFranchise();
      if (franchiseCtx.assignedFranchise.id !== input.franchiseId) {
        return { success: false, error: 'Unauthorized: You can only assign leadership for your assigned franchise.' };
      }
      actorUserId = franchiseCtx.user.id;
    }

    if (input.role !== 'captain' && input.role !== 'vice_captain') {
      return { success: false, error: 'Invalid leadership role. Must be captain or vice_captain.' };
    }

    // 2. Fetch franchise
    const { data: franchise, error: fErr } = await adminClient
      .from('franchises')
      .select('id, name, season_id')
      .eq('id', input.franchiseId)
      .single();

    if (fErr || !franchise) {
      return { success: false, error: 'Franchise not found.' };
    }

    // 3. Validate player registration (§6: must already be registered as a player)
    const { data: reg, error: regErr } = await adminClient
      .from('player_season_registrations')
      .select('id, player_id, season_id, players(id, full_name, roll_number)')
      .eq('id', input.registrationId)
      .eq('season_id', franchise.season_id)
      .single();

    if (regErr || !reg) {
      return { success: false, error: 'Target player must already be registered in this tournament season (§6).' };
    }

    const player = Array.isArray(reg.players) ? reg.players[0] : reg.players;

    // 4. Enforce: Once one franchise claims a player, no other franchise can claim him (§6)
    const { data: existingClaims } = await adminClient
      .from('franchise_members')
      .select('id, franchise_id, role, franchises(name)')
      .eq('player_registration_id', input.registrationId)
      .eq('is_active', true);

    const conflictingClaim = existingClaims?.find((c) => c.franchise_id !== input.franchiseId);
    if (conflictingClaim) {
      const teamName = (conflictingClaim.franchises as any)?.name || 'another franchise';
      return {
        success: false,
        error: `Player ${player?.full_name || ''} is already claimed as ${conflictingClaim.role} by ${teamName}. Once claimed, no other franchise can claim him (§6).`,
      };
    }

    // Check if player was bought by another franchise in auction
    const { data: boughtLot } = await adminClient
      .from('auction_lots')
      .select('id, highest_bidder_franchise_id, franchises(name)')
      .eq('registration_id', input.registrationId)
      .in('status', ['sold', 'allotted', 'scouted'])
      .maybeSingle();

    if (boughtLot && boughtLot.highest_bidder_franchise_id !== input.franchiseId) {
      return {
        success: false,
        error: `Player ${player?.full_name || ''} was already acquired by ${(boughtLot.franchises as any)?.name || 'another franchise'}.`,
      };
    }

    const now = new Date().toISOString();

    // 5. Remove previous leader with this role for this franchise (if replacing)
    await adminClient
      .from('franchise_members')
      .update({ is_active: false })
      .eq('franchise_id', input.franchiseId)
      .eq('role', input.role)
      .eq('is_active', true);

    // 6. Insert new leadership membership
    const { data: newMember, error: insertErr } = await adminClient
      .from('franchise_members')
      .upsert(
        {
          franchise_id: input.franchiseId,
          user_id: reg.player_id,
          role: input.role,
          player_registration_id: input.registrationId,
          is_active: true,
        },
        { onConflict: 'franchise_id,user_id' }
      )
      .select('id')
      .single();

    if (insertErr || !newMember) {
      return { success: false, error: insertErr?.message || 'Failed to assign leadership role.' };
    }

    // 7. Remove player from auction_lots queue if pending (§6: captains/VCs never enter the auction pool)
    await adminClient
      .from('auction_lots')
      .delete()
      .eq('registration_id', input.registrationId)
      .in('status', ['pending', 'upcoming']);

    // 8. Write audit log
    await writeAuditLog(
      {
        seasonId: franchise.season_id,
        actorUserId,
        action: 'LEADERSHIP_ASSIGNED',
        entityType: 'franchise_member',
        entityId: newMember.id,
        reason: `Assigned ${player?.full_name} as ${input.role} for ${franchise.name} (§6)`,
        metadata: {
          franchise_id: input.franchiseId,
          role: input.role,
          player_id: reg.player_id,
          registration_id: input.registrationId,
          player_name: player?.full_name,
        },
      },
      adminClient
    );

    revalidatePath('/franchise');
    revalidatePath('/franchise/squad');
    revalidatePath('/admin/franchises');
    revalidatePath('/teams');
    revalidatePath('/admin/queue');

    return {
      success: true,
      data: {
        memberId: newMember.id,
        role: input.role,
      },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to assign leadership role.' };
  }
}
