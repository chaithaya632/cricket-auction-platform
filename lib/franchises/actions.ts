'use server';

// =============================================================================
// ACC Auction Portal — Franchise Server Actions
// =============================================================================

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/permissions/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';
import type { DbFranchise } from '@/lib/db/types';

export interface AdminCreateFranchiseInput {
  name: string;
  short_name: string;
  color_primary?: string;
  color_secondary?: string;
  faculty_coordinator_name?: string;
  faculty_coordinator_mobile?: string;
}

export interface AdminFranchiseActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  mode?: 'deleted' | 'deactivated';
}

export const adminCreateFranchiseSchema = z.object({
  name: z.string().trim().min(2, 'Team name must be at least 2 characters').max(50),
  short_name: z
    .string()
    .trim()
    .min(2, 'Short code must be 2-5 characters')
    .max(5, 'Short code must be 2-5 characters')
    .toUpperCase(),
  color_primary: z.string().trim().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Invalid hex color').optional().default('#0284c7'),
  color_secondary: z.string().trim().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Invalid hex color').optional().default('#38bdf8'),
  faculty_coordinator_name: z.string().trim().max(100).optional(),
  faculty_coordinator_mobile: z.string().trim().regex(/^[6-9]\d{9}$/, 'Must be a 10-digit phone number').optional().or(z.literal('')),
});

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
  franchiseId: string
): Promise<AdminFranchiseActionResult<{ franchiseId: string; message: string }>> {
  try {
    await requireAdmin();
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

    // 3. Safe deactivation if auction history exists (Case B)
    if (hasAuctionHistory) {
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

    // 4. Safe hard deletion for unparticipating franchise (Case A)
    // Clean up dependent roles and memberships to prevent check constraint violations
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
