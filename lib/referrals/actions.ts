'use server';

// =============================================================================
// ACC Auction Portal — Referral Server Actions (Spec §5, §6, §22)
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin, requireFranchise } from '@/lib/permissions/guards';
import { parseRollNumber } from '@/domain/academic';
import { canAddReferral, evaluateReferralConflict } from '@/domain/referrals';
import { writeAuditLog } from '@/lib/audit/logger';

export interface ReferralActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Franchise Representative or Super Admin declares a referred player (§6, §22).
 *
 * Rules enforced:
 * 1. Referral 5-cap: Maximum 5 referred players per franchise.
 * 2. Fresher rule: Admitted in the current academic year (derived from roll number).
 * 3. Registered player: Must exist in player_season_registrations for this season.
 * 4. Cost is 0, sits outside the 15 auction purchases, and occupies no auction slot.
 * 5. Two-sided conflict detection: If another franchise has also claimed the player,
 *    or if player declared a different team, status is set to 'conflict' rather than silently resolving.
 */
export async function declareFranchiseReferralAction(
  franchiseId: string,
  registrationId: string,
  notes?: string
): Promise<ReferralActionResult<{ referralId: string; status: string }>> {
  try {
    const adminClient = createAdminClient();

    // 1. Authorization: either Super Admin or authenticated franchise representative for this team
    let actorUserId: string;
    let isSuperAdmin = false;

    try {
      const adminCtx = await requireAdmin();
      actorUserId = adminCtx.user.id;
      isSuperAdmin = adminCtx.isSuperAdmin;
    } catch {
      const franchiseCtx = await requireFranchise();
      if (franchiseCtx.assignedFranchise.id !== franchiseId) {
        return { success: false, error: 'Unauthorized: You can only declare referrals for your own franchise.' };
      }
      actorUserId = franchiseCtx.user.id;
    }

    // 2. Fetch franchise and current referrals count
    const { data: franchise, error: franchiseErr } = await adminClient
      .from('franchises')
      .select('id, name, season_id')
      .eq('id', franchiseId)
      .single();

    if (franchiseErr || !franchise) {
      return { success: false, error: 'Franchise not found.' };
    }

    const { count: currentReferralCount } = await adminClient
      .from('franchise_referrals')
      .select('id', { count: 'exact', head: true })
      .eq('franchise_id', franchiseId)
      .in('status', ['pending', 'approved']);

    if (!canAddReferral({ franchiseId, referralCount: currentReferralCount || 0, maxReferrals: 5 })) {
      return {
        success: false,
        error: `Franchise quota reached: Maximum 5 referred players per franchise permitted (§6). Current active referrals: ${currentReferralCount}.`,
      };
    }

    // 3. Fetch player registration and permanent record
    const { data: reg, error: regErr } = await adminClient
      .from('player_season_registrations')
      .select(`
        id,
        player_id,
        season_id,
        academic_year,
        programme,
        bucket,
        players (
          full_name,
          roll_number
        )
      `)
      .eq('id', registrationId)
      .eq('season_id', franchise.season_id)
      .single();

    if (regErr || !reg) {
      return { success: false, error: 'Player registration not found in this tournament season.' };
    }

    const player = Array.isArray(reg.players) ? reg.players[0] : reg.players;
    const rollNumber = player?.roll_number || '';
    const parsedRoll = parseRollNumber(rollNumber);

    // 4. Enforce Fresher Rule (§6, §22):
    // Restricted to students admitted in the current academic year (2026 for ACC 2026).
    // Note: includes lateral entrants sitting in second year if admitted in current year.
    const currentTournamentYear = 2026;
    if (parsedRoll.admissionYear && parsedRoll.admissionYear !== currentTournamentYear) {
      return {
        success: false,
        error: `Ineligible for referral: Player admitted in ${parsedRoll.admissionYear}. Referred players are strictly restricted to students admitted in the current academic year (${currentTournamentYear}) (§6).`,
      };
    }

    // 5. Check if already purchased/allotted in auction or claimed as leadership
    const { data: existingLot } = await adminClient
      .from('auction_lots')
      .select('id, status, highest_bidder_franchise_id')
      .eq('registration_id', registrationId)
      .in('status', ['sold', 'allotted', 'scouted'])
      .maybeSingle();

    if (existingLot) {
      return { success: false, error: 'Cannot refer player: already acquired by a franchise in the auction.' };
    }

    const { data: existingLeader } = await adminClient
      .from('franchise_members')
      .select('franchise_id, role')
      .eq('player_registration_id', registrationId)
      .eq('is_active', true)
      .maybeSingle();

    if (existingLeader && existingLeader.franchise_id !== franchiseId) {
      return { success: false, error: 'Cannot refer player: already registered as team captain/vice-captain of another franchise.' };
    }

    // 6. Two-sided Conflict Evaluation (§6)
    const { data: existingReferrals } = await adminClient
      .from('franchise_referrals')
      .select('id, franchise_id, status')
      .eq('registration_id', registrationId);

    const conflictEval = evaluateReferralConflict({
      claimingFranchiseId: franchiseId,
      existingReferrals: (existingReferrals || []) as any,
    });

    const now = new Date().toISOString();
    const finalStatus = conflictEval.status; // 'pending' or 'conflict'

    // 7. Upsert referral record
    const { data: newReferral, error: upsertErr } = await adminClient
      .from('franchise_referrals')
      .upsert(
        {
          franchise_id: franchiseId,
          registration_id: registrationId,
          status: finalStatus,
          notes: notes ? `${notes} ${conflictEval.reason || ''}`.trim() : conflictEval.reason || null,
          updated_at: now,
        },
        { onConflict: 'franchise_id,registration_id' }
      )
      .select('*')
      .single();

    if (upsertErr || !newReferral) {
      return { success: false, error: upsertErr?.message || 'Failed to record referral declaration.' };
    }

    // 8. If another referral was pending for another franchise, mark it conflict as well (§6)
    if (conflictEval.hasConflict) {
      await adminClient
        .from('franchise_referrals')
        .update({
          status: 'conflict',
          notes: 'Conflict detected: Multiple franchises have claimed this player as a referral (§6).',
          updated_at: now,
        })
        .eq('registration_id', registrationId);
    }

    // 9. Write audit log
    await writeAuditLog(
      {
        seasonId: franchise.season_id,
        actorUserId,
        action: 'REFERRAL_DECLARED',
        entityType: 'franchise_referral',
        entityId: newReferral.id,
        reason: conflictEval.hasConflict
          ? `Referral declared with CONFLICT: ${conflictEval.reason}`
          : 'Franchise declared referral (§6)',
        metadata: {
          franchise_id: franchiseId,
          registration_id: registrationId,
          status: finalStatus,
          is_conflict: conflictEval.hasConflict,
        },
      },
      adminClient
    );

    revalidatePath('/franchise');
    revalidatePath('/franchise/squad');
    revalidatePath('/admin/players');
    revalidatePath('/admin');

    return {
      success: true,
      data: {
        referralId: newReferral.id,
        status: finalStatus,
      },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to declare referral.' };
  }
}

/**
 * Super Admin manually approves a franchise referral after checking records (§6).
 *
 * Rules enforced:
 * 1. Only Super Admin can approve.
 * 2. Checks franchise current approved referrals count < 5.
 * 3. Sets status to 'approved' and records verified_by_user_id.
 * 4. Removes player from auction lots queue (referred players never enter the auction pool).
 */
export async function adminApproveReferralAction(
  referralId: string,
  notes?: string
): Promise<ReferralActionResult<{ referralId: string; status: 'approved' }>> {
  try {
    const adminContext = await requireAdmin();
    if (!adminContext.isSuperAdmin) {
      return { success: false, error: 'Unauthorized: Only Super Admin has authority to approve referrals (§6).' };
    }

    const adminClient = createAdminClient();

    // 1. Fetch referral record
    const { data: referral, error: refErr } = await adminClient
      .from('franchise_referrals')
      .select(`
        id,
        franchise_id,
        registration_id,
        status,
        franchises (
          id,
          name,
          season_id
        ),
        player_season_registrations (
          id,
          player_id,
          season_id,
          players (
            full_name
          )
        )
      `)
      .eq('id', referralId)
      .single();

    if (refErr || !referral) {
      return { success: false, error: 'Referral record not found.' };
    }

    // 2. Check 5-referral cap on already approved referrals
    const { count: approvedCount } = await adminClient
      .from('franchise_referrals')
      .select('id', { count: 'exact', head: true })
      .eq('franchise_id', referral.franchise_id)
      .eq('status', 'approved');

    if ((approvedCount || 0) >= 5) {
      return {
        success: false,
        error: `Cannot approve: Franchise already has the maximum of 5 approved referrals (§6).`,
      };
    }

    const now = new Date().toISOString();
    const seasonId = (referral.franchises as any)?.season_id;

    // 3. Update referral to approved
    const { error: updateErr } = await adminClient
      .from('franchise_referrals')
      .update({
        status: 'approved',
        verified_by_user_id: adminContext.user.id,
        verified_at: now,
        notes: notes || 'Verified against institutional records by Super Admin (§6).',
        updated_at: now,
      })
      .eq('id', referralId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    // 4. Reject any competing referrals for the same player
    await adminClient
      .from('franchise_referrals')
      .update({
        status: 'rejected',
        verified_by_user_id: adminContext.user.id,
        verified_at: now,
        notes: `Rejected: Player was approved as a referral for ${(referral.franchises as any)?.name}.`,
        updated_at: now,
      })
      .eq('registration_id', referral.registration_id)
      .neq('id', referralId);

    // 5. Remove player from auction_lots queue if pending/upcoming (§6: referred players never enter the auction)
    await adminClient
      .from('auction_lots')
      .delete()
      .eq('registration_id', referral.registration_id)
      .in('status', ['pending', 'upcoming']);

    // 6. Write audit log
    await writeAuditLog(
      {
        seasonId: seasonId || '00000000-0000-0000-0000-000000000001',
        actorUserId: adminContext.user.id,
        action: 'REFERRAL_APPROVED',
        entityType: 'franchise_referral',
        entityId: referralId,
        reason: 'Super Admin verified and approved referral (§6)',
        metadata: {
          franchise_id: referral.franchise_id,
          registration_id: referral.registration_id,
          player_name: (referral.player_season_registrations as any)?.players?.full_name,
        },
      },
      adminClient
    );

    revalidatePath('/admin/players');
    revalidatePath('/admin/franchises');
    revalidatePath('/admin/queue');
    revalidatePath('/admin');
    revalidatePath('/franchise');
    revalidatePath('/franchise/squad');

    return {
      success: true,
      data: { referralId, status: 'approved' },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to approve referral.' };
  }
}

/**
 * Super Admin rejects a franchise referral declaration (§6).
 */
export async function adminRejectReferralAction(
  referralId: string,
  reason: string
): Promise<ReferralActionResult<{ referralId: string; status: 'rejected' }>> {
  try {
    const adminContext = await requireAdmin();
    if (!adminContext.isSuperAdmin) {
      return { success: false, error: 'Unauthorized: Only Super Admin has authority to reject referrals.' };
    }

    if (!reason || reason.trim().length < 3) {
      return { success: false, error: 'Please provide a valid reason for rejecting this referral.' };
    }

    const adminClient = createAdminClient();
    const now = new Date().toISOString();

    const { data: referral, error: fetchErr } = await adminClient
      .from('franchise_referrals')
      .select('id, franchise_id, registration_id, franchises(season_id)')
      .eq('id', referralId)
      .single();

    if (fetchErr || !referral) {
      return { success: false, error: 'Referral record not found.' };
    }

    const { error: updateErr } = await adminClient
      .from('franchise_referrals')
      .update({
        status: 'rejected',
        verified_by_user_id: adminContext.user.id,
        verified_at: now,
        notes: reason.trim(),
        updated_at: now,
      })
      .eq('id', referralId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    await writeAuditLog(
      {
        seasonId: (referral.franchises as any)?.season_id || '00000000-0000-0000-0000-000000000001',
        actorUserId: adminContext.user.id,
        action: 'REFERRAL_REJECTED',
        entityType: 'franchise_referral',
        entityId: referralId,
        reason: reason.trim(),
        metadata: {
          franchise_id: referral.franchise_id,
          registration_id: referral.registration_id,
        },
      },
      adminClient
    );

    revalidatePath('/admin/players');
    revalidatePath('/admin');
    revalidatePath('/franchise');

    return {
      success: true,
      data: { referralId, status: 'rejected' },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to reject referral.' };
  }
}
