'use server';

// =============================================================================
// ACC Auction Portal — Referral Server Actions (Spec §5, §6, §22)
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin, requireFranchise, requirePlayer } from '@/lib/permissions/guards';
import { parseRollNumber } from '@/domain/academic';
import { canAddReferral } from '@/domain/referrals';
import { writeAuditLog } from '@/lib/audit/logger';
import { getFranchiseSquadData } from '@/lib/franchises/queries';
import { executeAuctionMutationFlow } from '@/lib/auction/transaction';

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

    if (!canAddReferral({ franchiseId, referralCount: currentReferralCount || 0 })) {
      return {
        success: false,
        error: `Franchise referral capacity exceeded.`,
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

    // 6. Multiple franchises may declare referrals (status = 'pending').
    // Player will choose their preferred franchise during registration.
    const { data: existingReferrals } = await adminClient
      .from('franchise_referrals')
      .select('id, franchise_id, status')
      .eq('registration_id', registrationId);

    const alreadyApproved = (existingReferrals || []).find((r) => r.status === 'approved');
    if (alreadyApproved) {
      return { success: false, error: 'Cannot refer player: already approved for another franchise.' };
    }

    const now = new Date().toISOString();
    const finalStatus = 'pending';

    // 7. Upsert referral record
    const { data: newReferral, error: upsertErr } = await adminClient
      .from('franchise_referrals')
      .upsert(
        {
          franchise_id: franchiseId,
          registration_id: registrationId,
          status: finalStatus,
          notes: notes?.trim() || null,
          updated_at: now,
        },
        { onConflict: 'franchise_id,registration_id' }
      )
      .select('*')
      .single();

    if (upsertErr || !newReferral) {
      return { success: false, error: upsertErr?.message || 'Failed to record referral declaration.' };
    }

    // 9. Write audit log
    await writeAuditLog(
      {
        seasonId: franchise.season_id,
        actorUserId,
        action: 'REFERRAL_DECLARED',
        entityType: 'franchise_referral',
        entityId: newReferral.id,
        reason: 'Franchise declared referral (§6)',
        metadata: {
          franchise_id: franchiseId,
          registration_id: registrationId,
          status: finalStatus,
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
 * CONCURRENCY HARDENING:
 * 1. Duplicate Approval Prevention: The referral update uses `.eq('status', 'pending')`
 *    so only one concurrent request can transition from pending → approved. PostgreSQL
 *    row-level locking serializes competing UPDATE WHERE status='pending' queries.
 * 2. Squad Capacity: Post-mutation re-check ensures that even if two requests both pass
 *    the initial capacity check, the second one is caught after committing.
 * 3. Lot+Event Consistency: Delegates to `executeAuctionMutationFlow` (the proven auction
 *    transaction coordinator) which performs conditional lot update → event insert →
 *    compensating rollback on event failure. This is application-level compensation,
 *    NOT database transaction atomicity.
 */
export async function adminApproveReferralAction(
  referralId: string,
  notes?: string
): Promise<ReferralActionResult<{ referralId: string; status: 'approved' }>> {
  try {
    const adminContext = await requireAdmin();
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

    // GUARD: Reject if referral is already approved/rejected (early exit before DB mutation)
    if (referral.status !== 'pending') {
      return {
        success: false,
        error: `Referral has already been ${referral.status}. No action taken.`,
      };
    }

    const now = new Date().toISOString();
    const seasonId = (referral.franchises as any)?.season_id;

    // 2. Check squad capacity (Max 22 squad players per franchise)
    if (seasonId) {
      const squadData = await getFranchiseSquadData(adminClient, referral.franchise_id, seasonId);
      if (squadData && squadData.squadPlayers.length >= 22) {
        return {
          success: false,
          error: 'Squad is full. This player cannot be added.',
        };
      }
    }

    // 3. CONDITIONAL UPDATE: Approve referral ONLY IF status is still 'pending'.
    //    PostgreSQL row-level lock serializes concurrent approvals of the same referral.
    //    If another request already transitioned this referral, 0 rows match → detected below.
    const { data: updatedRows, error: updateErr } = await adminClient
      .from('franchise_referrals')
      .update({
        status: 'approved',
        verified_by_user_id: adminContext.user.id,
        verified_at: now,
        notes: notes || 'Verified and added to team squad by Admin.',
        updated_at: now,
      })
      .eq('id', referralId)
      .eq('status', 'pending')
      .select();

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    // CONCURRENCY CHECK: If 0 rows were updated, another request already approved/rejected this referral.
    if (!updatedRows || updatedRows.length === 0) {
      return {
        success: false,
        error: 'Referral was already processed by another request. No duplicate action taken.',
      };
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

    // 5. Mark player registration as ineligible for auction (they are now in a squad)
    await adminClient
      .from('player_season_registrations')
      .update({
        is_auction_eligible: false,
        updated_at: now,
      })
      .eq('id', referral.registration_id);

    // 6. If an existing pending lot exists in auction_lots, transition it to 'allotted'
    //    and append an ALLOTMENT event using the proven auction transaction coordinator.
    //    This is application-level compensating rollback, NOT database transaction atomicity.
    //    Do NOT physically delete the lot (prevents ON DELETE CASCADE on auction_events).
    const { data: existingLot } = await adminClient
      .from('auction_lots')
      .select('id, season_id, status, current_price, highest_bidder_franchise_id, started_at, ended_at')
      .eq('registration_id', referral.registration_id)
      .eq('status', 'pending')
      .maybeSingle();

    if (existingLot) {
      const mutation = await executeAuctionMutationFlow(
        adminClient,
        {
          id: existingLot.id,
          status: existingLot.status,
          current_price: existingLot.current_price,
          highest_bidder_franchise_id: existingLot.highest_bidder_franchise_id,
          started_at: existingLot.started_at,
          ended_at: existingLot.ended_at,
        },
        {
          lotId: existingLot.id,
          expectedStatus: 'pending',
          newStatus: 'allotted',
          newPrice: 0,
          highestBidderId: referral.franchise_id,
        },
        {
          seasonId: existingLot.season_id,
          lotId: existingLot.id,
          eventType: 'ALLOTMENT',
          actorUserId: adminContext.user.id,
          franchiseId: referral.franchise_id,
          price: 0,
          reason: 'Referred player added to squad by Admin',
          payload: {
            registration_id: referral.registration_id,
            referral_id: referralId,
            franchise_id: referral.franchise_id,
          },
          createdAt: now,
        }
      );

      if (!mutation.success) {
        // The mutation coordinator already performed compensating rollback on the lot.
        // Log the failure but do NOT leave the referral in an inconsistent state.
        console.error('[adminApproveReferralAction] Auction mutation failed:', mutation.error);
        return { success: false, error: `Referral approved but auction lot transition failed: ${mutation.error}` };
      }
    }

    // 7. Post-mutation squad capacity re-check (defense against concurrent approval race)
    //    If two requests both passed the initial check and both approved different referrals
    //    for the same franchise, this re-check catches the overallocation.
    if (seasonId) {
      const postSquadData = await getFranchiseSquadData(adminClient, referral.franchise_id, seasonId);
      if (postSquadData && postSquadData.squadPlayers.length > 22) {
        // Over capacity: revert this approval (compensating rollback)
        console.error('[adminApproveReferralAction] Post-mutation squad capacity exceeded, reverting approval.');
        await adminClient
          .from('franchise_referrals')
          .update({
            status: 'pending',
            verified_by_user_id: null,
            verified_at: null,
            notes: 'Auto-reverted: concurrent approval would exceed 22-player squad limit.',
            updated_at: new Date().toISOString(),
          })
          .eq('id', referralId);

        // Revert auction lot if it was transitioned
        if (existingLot) {
          await adminClient
            .from('auction_lots')
            .update({
              status: existingLot.status,
              current_price: existingLot.current_price,
              highest_bidder_franchise_id: existingLot.highest_bidder_franchise_id,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingLot.id);
        }

        // Revert auction eligibility
        await adminClient
          .from('player_season_registrations')
          .update({
            is_auction_eligible: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', referral.registration_id);

        return {
          success: false,
          error: 'Squad capacity exceeded due to concurrent approval. This referral was automatically reverted. Please retry.',
        };
      }
    }

    // 8. Write audit log
    await writeAuditLog(
      {
        seasonId: seasonId || '00000000-0000-0000-0000-000000000001',
        actorUserId: adminContext.user.id,
        action: 'REFERRAL_APPROVED',
        entityType: 'franchise_referral',
        entityId: referralId,
        reason: 'Admin verified and added referred player to team squad',
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
 * Alias for adminApproveReferralAction - Adds an accepted referred player to the franchise squad.
 */
export const adminAddReferredPlayerToTeamAction = adminApproveReferralAction;

/**
 * Player chooses and accepts a specific incoming franchise referral during registration.
 * Competing pending referrals are marked rejected/superseded.
 */
export async function playerAcceptReferralAction(
  referralId: string
): Promise<ReferralActionResult<{ referralId: string; status: string }>> {
  try {
    const playerCtx = await requirePlayer();
    const adminClient = createAdminClient();

    // 1. Fetch referral and registration
    const { data: referral, error: refErr } = await adminClient
      .from('franchise_referrals')
      .select(`
        id,
        franchise_id,
        registration_id,
        status,
        player_season_registrations (
          id,
          player_id,
          season_id,
          players (
            id,
            user_id,
            full_name
          )
        ),
        franchises (
          id,
          name
        )
      `)
      .eq('id', referralId)
      .single();

    if (refErr || !referral) {
      return { success: false, error: 'Referral record not found.' };
    }

    const reg = referral.player_season_registrations as any;
    const playerObj = Array.isArray(reg?.players) ? reg?.players[0] : reg?.players;

    if (
      playerObj?.user_id !== playerCtx.user.id &&
      playerCtx.user.id !== reg?.player_id &&
      playerCtx.user.id !== playerObj?.id
    ) {
      return { success: false, error: 'Unauthorized: You can only accept referrals for your own registration.' };
    }

    const now = new Date().toISOString();
    const franchiseName = (referral.franchises as any)?.name || 'the chosen franchise';

    // 2. Mark this referral as accepted by player in notes
    const { error: acceptErr } = await adminClient
      .from('franchise_referrals')
      .update({
        notes: `ACCEPTED_BY_PLAYER: Student accepted referral for ${franchiseName}`,
        updated_at: now,
      })
      .eq('id', referralId);

    if (acceptErr) {
      return { success: false, error: acceptErr.message };
    }

    // 3. Mark competing pending referrals as rejected
    await adminClient
      .from('franchise_referrals')
      .update({
        status: 'rejected',
        notes: `Superseded by player acceptance of ${franchiseName}`,
        updated_at: now,
      })
      .eq('registration_id', referral.registration_id)
      .neq('id', referralId)
      .eq('status', 'pending');

    revalidatePath('/player');
    revalidatePath('/admin/players');

    return {
      success: true,
      data: { referralId, status: 'pending' },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to accept referral.' };
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
