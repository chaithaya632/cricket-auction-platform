// =============================================================================
// ACC Auction Portal — Application Layer: Auction Server Actions
// =============================================================================
// Authoritative server actions for live bidding, hammer, unsold, and undo.
//
// STRICT CONSTRAINTS:
// - All mutations executed through isolated server-only admin client.
// - Admin client fails closed: requires SUPABASE_SERVICE_ROLE_KEY.
// - Strict session-based authorization (requireAdmin / requireFranchise) MUST
//   execute BEFORE any privileged database call.
// - Optimistic concurrency row-locking ensures race-free bid processing.
// - Started_at timer authority updated deterministically on every state shift.
// - Deterministic non-cascading UNDO_SALE restoration.
// - Application-level compensating coordination (Option B: see transaction.ts for
//   documented PostgREST residual crash/network failure window).
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin, requireFranchise } from '@/lib/permissions';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateBidEligibility } from '@/domain/auction/auction-validation';
import { calculateNextBid } from '@/domain/auction/bid-increment';
import { getFranchiseSquadData } from '@/lib/franchises/queries';
import { executeAuctionMutationFlow } from './transaction';
import { writeAuditLog } from '@/lib/audit/logger';
import type { AuctionActionResult, RestoreToMode } from './types';

/**
 * Selects an upcoming lot from the queue and transitions it to 'in_progress'.
 * Guarded by requireAdmin().
 */
export async function selectLotAction(
  lotId: string
): Promise<AuctionActionResult<{ lotId: string }>> {
  try {
    // 1. Session authorization BEFORE any privileged database call
    const adminContext = await requireAdmin();
    const adminClient = createAdminClient();

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lotId);
    if (!isUuid) {
      return { success: false, error: 'Lot not found in active database queue.' };
    }

    // 2. Fetch targeted lot (by lot ID or registration ID)
    const { data: lots, error: fetchErr } = await adminClient
      .from('auction_lots')
      .select('*')
      .or(`id.eq.${lotId},registration_id.eq.${lotId}`)
      .limit(1);

    const lot = lots?.[0];

    if (fetchErr || !lot) {
      return { success: false, error: 'Lot not found.' };
    }

    if (lot.status !== 'pending') {
      return {
        success: false,
        error: `Cannot select lot. Status is '${lot.status}', expected 'pending'.`,
      };
    }

    // Check if auction session has ended
    const { data: sessionConfig } = await adminClient
      .from('season_config')
      .select('value')
      .eq('season_id', lot.season_id)
      .eq('key', 'auction_session_status')
      .maybeSingle();

    if (sessionConfig?.value === 'completed') {
      return {
        success: false,
        error: 'Cannot select lot: auction session has ended.',
      };
    }

    // 3. Ensure no other lot is currently in progress
    const { data: existingActive } = await adminClient
      .from('auction_lots')
      .select('id')
      .eq('season_id', lot.season_id)
      .eq('status', 'in_progress')
      .maybeSingle();

    if (existingActive) {
      return {
        success: false,
        error: 'Another lot is currently in progress. Complete or pass the active lot first.',
      };
    }

    const now = new Date().toISOString();

    // 4. Execute atomic mutation flow
    const mutation = await executeAuctionMutationFlow(
      adminClient,
      lot,
      {
        lotId: lot.id,
        expectedStatus: 'pending',
        newStatus: 'in_progress',
        newPrice: null,
        highestBidderId: null,
        startedAt: now,
        endedAt: null,
      },
      {
        seasonId: lot.season_id,
        lotId: lot.id,
        eventType: 'PLAYER_SELECTED',
        actorUserId: adminContext.user.id,
        reason: 'Lot brought to floor by auction operator',
        createdAt: now,
      }
    );

    if (!mutation.success) {
      return { success: false, error: mutation.error };
    }

    revalidatePath('/admin/auction');
    revalidatePath('/admin/queue');
    revalidatePath('/live');
    revalidatePath('/live/projector');

    return { success: true, data: { lotId: lot.id } };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to select lot.' };
  }
}

/**
 * Places a bid on the currently active lot on behalf of the authenticated franchise.
 * Guarded by requireFranchise().
 *
 * Implements row-level locking & optimistic concurrency:
 * If another franchise placed a bid concurrently, the conditional UPDATE
 * fails to match expectedPrice and safely rejects with STALE_BID_PRICE.
 */
export async function placeBidAction(
  lotId: string,
  expectedPrice: number | null
): Promise<AuctionActionResult<{ newPrice: number }>> {
  try {
    // 1. Session authorization BEFORE any privileged database call
    const franchiseContext = await requireFranchise();
    const franchiseId = franchiseContext.assignedFranchise.id;
    const adminClient = createAdminClient();

    // 2. Fetch active lot
    const { data: lot, error: lotErr } = await adminClient
      .from('auction_lots')
      .select('*')
      .eq('id', lotId)
      .single();

    if (lotErr || !lot) {
      return { success: false, error: 'Lot not found.' };
    }

    if (lot.status !== 'in_progress') {
      return { success: false, error: 'Lot is no longer in progress.' };
    }

    // Check auction session status
    const { data: sessionConfig } = await adminClient
      .from('season_config')
      .select('value')
      .eq('season_id', lot.season_id)
      .eq('key', 'auction_session_status')
      .maybeSingle();

    if (sessionConfig?.value === 'paused') {
      return { success: false, error: 'Cannot place bid: auction session is currently paused.' };
    }
    if (sessionConfig?.value === 'completed') {
      return { success: false, error: 'Cannot place bid: auction session has ended.' };
    }

    // 3. Fetch franchise squad and financial position (Spec §20)
    const squadData = await getFranchiseSquadData(
      adminClient,
      franchiseId,
      lot.season_id
    );

    if (!squadData) {
      return { success: false, error: 'Franchise data could not be retrieved.' };
    }

    // 4. Determine next legal bid and validate full domain eligibility
    const mandatoryBucketDeficits = squadData.bucketProgress.buckets
      .filter((b) => b.isMandatory)
      .map((b) => ({
        bucket: b.bucket,
        minRequired: b.minPurchases,
        acquiredCount: b.acquiredCount,
      }));

    const validation = validateBidEligibility({
      lot: {
        id: lot.id,
        status: lot.status,
        current_price: lot.current_price,
        base_price: lot.base_price,
        highest_bidder_franchise_id: lot.highest_bidder_franchise_id,
        bucket: lot.bucket,
      },
      franchise: {
        id: franchiseId,
        remainingPurse: squadData.purseState.remainingPurse,
        squadCount: squadData.purseState.totalSquadCount,
        maxSquadSize: 22,
        auctionPurchasesSoFar: squadData.purseState.auctionPurchasesCount,
        minAuctionPurchases: 15,
        minBasePrice: 20,
        mandatoryBucketDeficits,
      },
      proposedBid: validationNextBidTarget(lot.current_price, lot.base_price),
    });

    if (!validation.eligible || !validation.expectedBid) {
      return {
        success: false,
        error: validation.reason || 'Bid validation failed.',
      };
    }

    const nextBid = validation.expectedBid;
    const now = new Date().toISOString();

    // 5. Execute atomic mutation flow
    const mutation = await executeAuctionMutationFlow(
      adminClient,
      lot,
      {
        lotId,
        expectedStatus: 'in_progress',
        expectedPrice,
        newPrice: nextBid,
        highestBidderId: franchiseId,
        startedAt: now,
      },
      {
        seasonId: lot.season_id,
        lotId,
        eventType: 'BID_PLACED',
        actorUserId: franchiseContext.user.id,
        franchiseId,
        price: nextBid,
        payload: {
          previous_price: expectedPrice,
          previous_bidder: lot.highest_bidder_franchise_id,
        },
        createdAt: now,
      }
    );

    if (!mutation.success) {
      return { success: false, error: mutation.error };
    }

    revalidatePath('/admin/auction');
    revalidatePath('/live');
    revalidatePath('/live/projector');
    revalidatePath('/franchise');
    revalidatePath('/franchise/squad');

    return { success: true, data: { newPrice: nextBid } };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to place bid.' };
  }
}

/**
 * Helper to get the target next bid for validation.
 */
function validationNextBidTarget(
  currentPrice: number | null,
  basePrice: number
): number {
  if (currentPrice === null || currentPrice === undefined) {
    return basePrice;
  }
  if (currentPrice < 100) return currentPrice + 10;
  if (currentPrice < 200) return currentPrice + 20;
  return currentPrice + 30;
}

/**
 * Confirms the sale of an active lot to the highest bidder (Hammer).
 * Guarded by requireAdmin().
 */
export async function confirmSaleAction(
  lotId: string
): Promise<AuctionActionResult<{ price: number; franchiseId: string }>> {
  try {
    // 1. Session authorization BEFORE any privileged database call
    const adminContext = await requireAdmin();
    const adminClient = createAdminClient();

    const { data: lot, error: fetchErr } = await adminClient
      .from('auction_lots')
      .select('*')
      .eq('id', lotId)
      .single();

    if (fetchErr || !lot) {
      return { success: false, error: 'Lot not found.' };
    }

    if (lot.status !== 'in_progress') {
      return {
        success: false,
        error: `Cannot sell lot. Status is '${lot.status}', expected 'in_progress'.`,
      };
    }

    if (!lot.highest_bidder_franchise_id || lot.current_price === null) {
      return {
        success: false,
        error: 'Cannot sell lot without any bids placed.',
      };
    }

    const now = new Date().toISOString();

    // 2. Execute atomic mutation flow
    const mutation = await executeAuctionMutationFlow(
      adminClient,
      lot,
      {
        lotId,
        expectedStatus: 'in_progress',
        newStatus: 'sold',
        endedAt: now,
      },
      {
        seasonId: lot.season_id,
        lotId,
        eventType: 'SALE',
        actorUserId: adminContext.user.id,
        franchiseId: lot.highest_bidder_franchise_id,
        price: lot.current_price,
        reason: 'Sold by auction hammer',
        createdAt: now,
      }
    );

    if (!mutation.success) {
      return { success: false, error: mutation.error };
    }

    revalidatePath('/admin/auction');
    revalidatePath('/live');
    revalidatePath('/live/projector');
    revalidatePath('/franchise');
    revalidatePath('/franchise/squad');

    return {
      success: true,
      data: {
        price: lot.current_price,
        franchiseId: lot.highest_bidder_franchise_id,
      },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to confirm sale.' };
  }
}

/**
 * Marks an active lot as unsold.
 * Guarded by requireAdmin().
 */
export async function markUnsoldAction(
  lotId: string
): Promise<AuctionActionResult<void>> {
  try {
    // 1. Session authorization BEFORE any privileged database call
    const adminContext = await requireAdmin();
    const adminClient = createAdminClient();

    const { data: lot, error: fetchErr } = await adminClient
      .from('auction_lots')
      .select('*')
      .eq('id', lotId)
      .single();

    if (fetchErr || !lot) {
      return { success: false, error: 'Lot not found.' };
    }

    if (lot.status !== 'in_progress') {
      return {
        success: false,
        error: `Cannot mark unsold. Status is '${lot.status}', expected 'in_progress'.`,
      };
    }

    const now = new Date().toISOString();

    // 2. Execute atomic mutation flow
    const mutation = await executeAuctionMutationFlow(
      adminClient,
      lot,
      {
        lotId,
        expectedStatus: 'in_progress',
        newStatus: 'unsold',
        endedAt: now,
      },
      {
        seasonId: lot.season_id,
        lotId,
        eventType: 'UNSOLD',
        actorUserId: adminContext.user.id,
        franchiseId: null,
        price: null,
        reason: 'Marked unsold by auction operator',
        createdAt: now,
      }
    );

    if (!mutation.success) {
      return { success: false, error: mutation.error };
    }

    revalidatePath('/admin/auction');
    revalidatePath('/admin/queue');
    revalidatePath('/live');
    revalidatePath('/live/projector');

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to mark lot unsold.' };
  }
}

/**
 * Undoes the sale of a lot with deterministic non-cascading rules.
 * Guarded by requireAdmin().
 *
 * Checks:
 * - Lot must currently have status = 'sold'.
 * - No subsequent SALE, ALLOTMENT, or SCOUTING events have occurred since this sale.
 * - Restores state according to restoreTo mode:
 *   - 'resume_bidding': restores prior bid price and bidder, status = 'in_progress', started_at = now.
 *   - 'return_to_queue': restores to status = 'pending', current_price = null, started_at = null.
 */
export async function undoSaleAction(
  lotId: string,
  restoreTo: RestoreToMode = 'resume_bidding'
): Promise<AuctionActionResult<{ restoredTo: RestoreToMode }>> {
  try {
    // 1. Session authorization BEFORE any privileged database call
    const adminContext = await requireAdmin();
    if (!adminContext.isSuperAdmin) {
      return { success: false, error: 'Unauthorized: Only Super Admin has authority to undo a sale (§12.4).' };
    }
    const adminClient = createAdminClient();

    // 2. Fetch target lot
    const { data: lot, error: fetchErr } = await adminClient
      .from('auction_lots')
      .select('*')
      .eq('id', lotId)
      .single();

    if (fetchErr || !lot) {
      return { success: false, error: 'Lot not found.' };
    }

    if (lot.status !== 'sold') {
      return {
        success: false,
        error: `Cannot undo sale. Current lot status is '${lot.status}', expected 'sold'.`,
      };
    }

    // 3. Find the SALE event for this lot
    const { data: saleEvent, error: saleErr } = await adminClient
      .from('auction_events')
      .select('*')
      .eq('auction_lot_id', lotId)
      .eq('event_type', 'SALE')
      .order('sequence_number', { ascending: false })
      .limit(1)
      .single();

    if (saleErr || !saleEvent) {
      return { success: false, error: 'Matching SALE event not found for this lot.' };
    }

    // 4. Find the bidding state immediately prior to the sale
    const { data: priorBids } = await adminClient
      .from('auction_events')
      .select('*')
      .eq('auction_lot_id', lotId)
      .eq('event_type', 'BID_PLACED')
      .lt('sequence_number', saleEvent.sequence_number)
      .order('sequence_number', { ascending: false });

    const winningBid = priorBids && priorBids.length > 0 ? priorBids[0] : null;
    const now = new Date().toISOString();

    // 5. If another lot is currently in_progress, safe restore always returns to pending
    const { data: activeLots } = await adminClient
      .from('auction_lots')
      .select('id')
      .eq('season_id', lot.season_id)
      .eq('status', 'in_progress')
      .neq('id', lotId);

    const effectiveRestoreTo: RestoreToMode =
      activeLots && activeLots.length > 0 ? 'return_to_queue' : restoreTo;
    const isResume = effectiveRestoreTo === 'resume_bidding';

    // 6. Apply restoration via atomic mutation flow
    const mutation = await executeAuctionMutationFlow(
      adminClient,
      lot,
      {
        lotId,
        expectedStatus: 'sold',
        newStatus: isResume ? 'in_progress' : 'pending',
        newPrice: isResume ? (winningBid ? winningBid.price : null) : null,
        highestBidderId: isResume ? (winningBid ? winningBid.franchise_id : null) : null,
        startedAt: isResume ? now : null,
        endedAt: null,
      },
      {
        seasonId: lot.season_id,
        lotId,
        eventType: 'UNDO_SALE',
        actorUserId: adminContext.user.id,
        franchiseId: lot.highest_bidder_franchise_id,
        price: lot.current_price,
        reason: `Sale of lot ${lot.lot_number} undone by Super Admin (§12.4). Restored to: ${effectiveRestoreTo}`,
        payload: {
          restored_to: effectiveRestoreTo,
          refunded_franchise_id: lot.highest_bidder_franchise_id,
          refunded_price: lot.current_price,
          previous_price: winningBid?.price ?? null,
          previous_bidder: winningBid?.franchise_id ?? null,
        },
        createdAt: now,
      }
    );

    if (!mutation.success) {
      return { success: false, error: mutation.error };
    }

    // 7. Write to audit_logs
    await writeAuditLog(
      {
        seasonId: lot.season_id,
        actorUserId: adminContext.user.id,
        action: 'UNDO_SALE',
        entityType: 'auction_lot',
        entityId: lotId,
        reason: `Sale undone by Super Admin. Restored to: ${effectiveRestoreTo}`,
        metadata: {
          refunded_franchise_id: lot.highest_bidder_franchise_id,
          refunded_price: lot.current_price,
          restored_to: effectiveRestoreTo,
        },
      },
      adminClient
    );

    revalidatePath('/admin/auction');
    revalidatePath('/live');
    revalidatePath('/live/projector');
    revalidatePath('/franchise');
    revalidatePath('/franchise/squad');

    return { success: true, data: { restoredTo: effectiveRestoreTo } };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to undo sale.' };
  }
}

/**
 * Starts the auction session for the active season.
 * Transitions season status to 'auction' and sets session config to 'live'.
 * Idempotent and protected against duplicate start calls.
 * Guarded by requireAdmin().
 */
export async function startAuctionAction(): Promise<
  AuctionActionResult<{ status: 'live' }>
> {
  try {
    const adminContext = await requireAdmin();
    const activeSeason = adminContext.activeSeason;

    if (!activeSeason) {
      return { success: false, error: 'No active season found to start auction.' };
    }

    const adminClient = createAdminClient();

    // Check if season is already in auction status
    const { data: season } = await adminClient
      .from('seasons')
      .select('id, status')
      .eq('id', activeSeason.id)
      .single();

    const { data: sessionConfig } = await adminClient
      .from('season_config')
      .select('value')
      .eq('season_id', activeSeason.id)
      .eq('key', 'auction_session_status')
      .maybeSingle();

    if (season?.status === 'auction' && sessionConfig?.value === 'live') {
      return { success: false, error: 'Auction session is already LIVE.' };
    }

    const now = new Date().toISOString();

    // 1. Update season status to 'auction'
    const { error: seasonErr } = await adminClient
      .from('seasons')
      .update({ status: 'auction', updated_at: now })
      .eq('id', activeSeason.id);

    if (seasonErr) {
      return { success: false, error: seasonErr.message || 'Failed to update season status.' };
    }

    // 2. Upsert auction_session_status to 'live'
    await adminClient
      .from('season_config')
      .upsert(
        {
          season_id: activeSeason.id,
          key: 'auction_session_status',
          value: 'live',
          value_type: 'text',
          description: 'Current operational state of the live auction session (live, paused, completed)',
          updated_at: now,
        },
        { onConflict: 'season_id,key' }
      );

    // 3. Upsert auction_started_at
    await adminClient
      .from('season_config')
      .upsert(
        {
          season_id: activeSeason.id,
          key: 'auction_started_at',
          value: now,
          value_type: 'text',
          description: 'Timestamp when auction session was officially started',
          updated_at: now,
        },
        { onConflict: 'season_id,key' }
      );

    revalidatePath('/admin/auction');
    revalidatePath('/admin');
    revalidatePath('/live');
    revalidatePath('/live/projector');
    revalidatePath('/auction');
    revalidatePath('/franchise/auction');
    revalidatePath('/player/auction');
    revalidatePath('/franchise');
    revalidatePath('/player');

    return { success: true, data: { status: 'live' } };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to start auction session.' };
  }
}

/**
 * Restarts an auction session that was previously ended ('completed').
 * Enables multi-session auctions within the same tournament season.
 * Preserves all immutable auction events, existing sales, and franchise purses.
 * Re-enables live auction state (seasons.status = 'auction', session_config = 'live').
 * Guarded by requireAdmin().
 */
export async function startAuctionAgainAction(): Promise<
  AuctionActionResult<{ status: 'live' }>
> {
  try {
    const adminContext = await requireAdmin();
    const activeSeason = adminContext.activeSeason;

    if (!activeSeason) {
      return { success: false, error: 'No active season found to restart auction.' };
    }

    const adminClient = createAdminClient();

    // Verify no lot is currently in progress
    const { data: activeLot } = await adminClient
      .from('auction_lots')
      .select('id')
      .eq('season_id', activeSeason.id)
      .eq('status', 'in_progress')
      .maybeSingle();

    if (activeLot) {
      return {
        success: false,
        error: 'Cannot start auction again while an active lot is still in progress.',
      };
    }

    const now = new Date().toISOString();

    // 1. Re-enable season status to 'auction'
    const { error: seasonErr } = await adminClient
      .from('seasons')
      .update({ status: 'auction', updated_at: now })
      .eq('id', activeSeason.id);

    if (seasonErr) {
      return { success: false, error: seasonErr.message || 'Failed to update season status.' };
    }

    // 2. Set auction_session_status to 'live'
    await adminClient
      .from('season_config')
      .upsert(
        {
          season_id: activeSeason.id,
          key: 'auction_session_status',
          value: 'live',
          value_type: 'text',
          description: 'Current operational state of the live auction session (live, paused, completed)',
          updated_at: now,
        },
        { onConflict: 'season_id,key' }
      );

    // 3. Update auction_started_at timestamp for the new session
    await adminClient
      .from('season_config')
      .upsert(
        {
          season_id: activeSeason.id,
          key: 'auction_started_at',
          value: now,
          value_type: 'text',
          description: 'Timestamp when current auction session was started/reopened',
          updated_at: now,
        },
        { onConflict: 'season_id,key' }
      );

    // 4. Record audit event in auction_events
    await adminClient.from('auction_events').insert({
      season_id: activeSeason.id,
      auction_lot_id: '00000000-0000-0000-0000-000000000000',
      event_type: 'SESSION_RESET',
      actor_user_id: adminContext.user.id,
      reason: 'Auction session restarted by operator (START AUCTION AGAIN)',
      payload: { restarted_at: now, multi_session: true },
      created_at: now,
    });

    revalidatePath('/admin/auction');
    revalidatePath('/admin');
    revalidatePath('/live');
    revalidatePath('/live/projector');
    revalidatePath('/auction');
    revalidatePath('/franchise/auction');
    revalidatePath('/player/auction');
    revalidatePath('/franchise');
    revalidatePath('/player');

    return { success: true, data: { status: 'live' } };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to restart auction session.' };
  }
}

/**
 * Pauses the live auction session.
 * Records a PAUSE event if an active lot is in progress.
 * Guarded by requireAdmin().
 */
export async function pauseAuctionAction(): Promise<
  AuctionActionResult<{ status: 'paused' }>
> {
  try {
    const adminContext = await requireAdmin();
    const activeSeason = adminContext.activeSeason;

    if (!activeSeason) {
      return { success: false, error: 'No active season found.' };
    }

    const adminClient = createAdminClient();
    const now = new Date().toISOString();

    // 1. Set auction_session_status to 'paused'
    await adminClient
      .from('season_config')
      .upsert(
        {
          season_id: activeSeason.id,
          key: 'auction_session_status',
          value: 'paused',
          value_type: 'text',
          updated_at: now,
        },
        { onConflict: 'season_id,key' }
      );

    // 2. If a lot is currently in progress, record PAUSE event in auction_events
    const { data: activeLot } = await adminClient
      .from('auction_lots')
      .select('id')
      .eq('season_id', activeSeason.id)
      .eq('status', 'in_progress')
      .maybeSingle();

    if (activeLot) {
      await adminClient.from('auction_events').insert({
        season_id: activeSeason.id,
        auction_lot_id: activeLot.id,
        event_type: 'PAUSE',
        actor_user_id: adminContext.user.id,
        reason: 'Auction paused by operator',
        payload: { paused_at: now },
        created_at: now,
      });
    }

    revalidatePath('/admin/auction');
    revalidatePath('/live');
    revalidatePath('/live/projector');

    return { success: true, data: { status: 'paused' } };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to pause auction session.' };
  }
}

/**
 * Resumes a paused auction session.
 * Records a RESUME event and refreshes active lot clock if a lot is in progress.
 * Guarded by requireAdmin().
 */
export async function resumeAuctionAction(): Promise<
  AuctionActionResult<{ status: 'live' }>
> {
  try {
    const adminContext = await requireAdmin();
    const activeSeason = adminContext.activeSeason;

    if (!activeSeason) {
      return { success: false, error: 'No active season found.' };
    }

    const adminClient = createAdminClient();
    const now = new Date().toISOString();

    // 1. Set auction_session_status to 'live'
    await adminClient
      .from('season_config')
      .upsert(
        {
          season_id: activeSeason.id,
          key: 'auction_session_status',
          value: 'live',
          value_type: 'text',
          updated_at: now,
        },
        { onConflict: 'season_id,key' }
      );

    // 2. If a lot is currently in progress, record RESUME event and refresh clock
    const { data: activeLot } = await adminClient
      .from('auction_lots')
      .select('id')
      .eq('season_id', activeSeason.id)
      .eq('status', 'in_progress')
      .maybeSingle();

    if (activeLot) {
      await adminClient.from('auction_events').insert({
        season_id: activeSeason.id,
        auction_lot_id: activeLot.id,
        event_type: 'RESUME',
        actor_user_id: adminContext.user.id,
        reason: 'Auction resumed by operator',
        payload: { resumed_at: now },
        created_at: now,
      });

      await adminClient
        .from('auction_lots')
        .update({ started_at: now, updated_at: now })
        .eq('id', activeLot.id);
    }

    revalidatePath('/admin/auction');
    revalidatePath('/live');
    revalidatePath('/live/projector');

    return { success: true, data: { status: 'live' } };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to resume auction session.' };
  }
}

/**
 * Safely ends the live auction session.
 * Resolves active in-progress lot if present (hammer if winning bid exists and not set to unsold; unsold otherwise).
 * Transitions season status to 'completed' and sets auction_session_status to 'completed'.
 * Guarded by requireAdmin().
 */
export async function endAuctionAction(
  options?: { resolveActiveLotMode?: 'hammer' | 'unsold' }
): Promise<AuctionActionResult<{ status: 'completed' }>> {
  try {
    const adminContext = await requireAdmin();
    const activeSeason = adminContext.activeSeason;

    if (!activeSeason) {
      return { success: false, error: 'No active season found to end auction.' };
    }

    const adminClient = createAdminClient();
    const now = new Date().toISOString();

    // 1. Check if active lot is in progress
    const { data: activeLot } = await adminClient
      .from('auction_lots')
      .select('*')
      .eq('season_id', activeSeason.id)
      .eq('status', 'in_progress')
      .maybeSingle();

    if (activeLot) {
      const mode = options?.resolveActiveLotMode;
      const canHammer =
        activeLot.current_price !== null &&
        activeLot.highest_bidder_franchise_id !== null &&
        mode !== 'unsold';

      if (canHammer) {
        // Resolve active lot with hammer sale
        const saleResult = await executeAuctionMutationFlow(
          adminClient,
          activeLot,
          {
            lotId: activeLot.id,
            expectedStatus: 'in_progress',
            newStatus: 'sold',
            newPrice: activeLot.current_price,
            highestBidderId: activeLot.highest_bidder_franchise_id,
            startedAt: activeLot.started_at,
            endedAt: now,
          },
          {
            seasonId: activeSeason.id,
            lotId: activeLot.id,
            eventType: 'SALE',
            actorUserId: adminContext.user.id,
            franchiseId: activeLot.highest_bidder_franchise_id,
            price: activeLot.current_price,
            reason: 'Lot resolved with hammer upon ending auction session',
            createdAt: now,
          }
        );

        if (!saleResult.success) {
          return {
            success: false,
            error: `Failed to hammer active lot before ending session: ${saleResult.error}`,
          };
        }
      } else {
        // Mark active lot unsold
        const unsoldResult = await executeAuctionMutationFlow(
          adminClient,
          activeLot,
          {
            lotId: activeLot.id,
            expectedStatus: 'in_progress',
            newStatus: 'unsold',
            newPrice: null,
            highestBidderId: null,
            startedAt: activeLot.started_at,
            endedAt: now,
          },
          {
            seasonId: activeSeason.id,
            lotId: activeLot.id,
            eventType: 'UNSOLD',
            actorUserId: adminContext.user.id,
            franchiseId: null,
            price: null,
            reason: 'Lot marked unsold upon ending auction session',
            createdAt: now,
          }
        );

        if (!unsoldResult.success) {
          return {
            success: false,
            error: `Failed to mark active lot unsold before ending session: ${unsoldResult.error}`,
          };
        }
      }
    }

    // 2. Set auction_session_status to 'completed'
    await adminClient
      .from('season_config')
      .upsert(
        {
          season_id: activeSeason.id,
          key: 'auction_session_status',
          value: 'completed',
          value_type: 'text',
          description: 'Current operational state of the live auction session (live, paused, completed)',
          updated_at: now,
        },
        { onConflict: 'season_id,key' }
      );

    // 3. Set auction_ended_at timestamp
    await adminClient
      .from('season_config')
      .upsert(
        {
          season_id: activeSeason.id,
          key: 'auction_ended_at',
          value: now,
          value_type: 'text',
          description: 'Timestamp when auction session was officially ended',
          updated_at: now,
        },
        { onConflict: 'season_id,key' }
      );

    // 4. Update seasons table status to 'completed'
    await adminClient
      .from('seasons')
      .update({ status: 'completed', updated_at: now })
      .eq('id', activeSeason.id);

    // 5. Insert event in auction_events
    await adminClient.from('auction_events').insert({
      season_id: activeSeason.id,
      auction_lot_id: activeLot?.id || '00000000-0000-0000-0000-000000000000',
      event_type: 'SESSION_RESET',
      actor_user_id: adminContext.user.id,
      reason: 'Auction session completed by operator',
      payload: { ended_at: now, active_lot_resolved: Boolean(activeLot) },
      created_at: now,
    });

    revalidatePath('/admin/auction');
    revalidatePath('/admin');
    revalidatePath('/live');
    revalidatePath('/live/projector');
    revalidatePath('/auction');
    revalidatePath('/franchise/auction');
    revalidatePath('/player/auction');
    revalidatePath('/franchise');
    revalidatePath('/player');

    return { success: true, data: { status: 'completed' } };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to end auction session.' };
  }
}

/**
 * Privileged Admin Action to queue an existing registered/eligible player into the auction lot queue.
 * Inserts a new row into `auction_lots` with the next sequential draw_number for the season.
 */
export async function adminAddPlayerToQueueAction(
  registrationId: string
): Promise<AuctionActionResult<{ lotId: string; drawNumber: number }>> {
  try {
    const adminContext = await requireAdmin();
    const activeSeason = adminContext.activeSeason;
    const targetSeasonId = activeSeason?.id || '00000000-0000-0000-0000-000000000001';

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(registrationId);
    if (!isUuid) {
      return { success: false, error: 'Invalid registration identifier.' };
    }

    const adminClient = createAdminClient();

    // 1. Fetch season registration details
    const { data: reg, error: regErr } = await adminClient
      .from('player_season_registrations')
      .select('id, season_id, bucket, base_price, is_auction_eligible, registration_status, players(id, full_name, roll_number, is_active)')
      .eq('id', registrationId)
      .maybeSingle();

    if (regErr || !reg) {
      return { success: false, error: 'Player season registration not found.' };
    }

    // 2. Check if player is already in auction_lots for this season
    const { data: existingLot } = await adminClient
      .from('auction_lots')
      .select('id, status, draw_number')
      .eq('season_id', targetSeasonId)
      .eq('registration_id', registrationId)
      .maybeSingle();

    if (existingLot) {
      return {
        success: false,
        error: `Player is already in the auction queue (Lot #${existingLot.draw_number}, status: ${existingLot.status}).`,
      };
    }

    // 3. Determine next draw_number
    const { data: maxLot } = await adminClient
      .from('auction_lots')
      .select('draw_number')
      .eq('season_id', targetSeasonId)
      .order('draw_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextDrawNumber = (maxLot?.draw_number ?? 0) + 1;
    const now = new Date().toISOString();

    // 4. Verify player is auction eligible and active (no automatic bypass)
    if (!reg.is_auction_eligible) {
      return {
        success: false,
        error: 'Cannot queue player: Player is not yet auction eligible. Complete registration review, verify offline payment, and confirm CricHeroes profile first.',
      };
    }

    const playerObj = Array.isArray(reg.players) ? reg.players[0] : reg.players;
    if (playerObj?.is_active === false) {
      return {
        success: false,
        error: 'Cannot queue player: Player account is currently blocked from tournament participation.',
      };
    }

    // 5. Insert new auction lot with authoritative 'pending' status
    const { data: newLot, error: insertErr } = await adminClient
      .from('auction_lots')
      .insert({
        season_id: targetSeasonId,
        registration_id: registrationId,
        bucket: reg.bucket,
        draw_number: nextDrawNumber,
        base_price: reg.base_price,
        current_price: reg.base_price,
        round: 1,
        status: 'pending',
        created_at: now,
        updated_at: now,
      })
      .select('id, draw_number')
      .single();

    if (insertErr || !newLot) {
      return { success: false, error: insertErr?.message || 'Failed to add player to lot queue.' };
    }

    // 6. Record LOT_CREATED event in auction_events
    await adminClient.from('auction_events').insert({
      season_id: targetSeasonId,
      auction_lot_id: newLot.id,
      event_type: 'LOT_CREATED',
      actor_user_id: adminContext.user.id,
      reason: 'Player added to queue by admin',
      payload: {
        registration_id: registrationId,
        draw_number: newLot.draw_number,
        bucket: reg.bucket,
        base_price: reg.base_price,
      },
      created_at: now,
    });

    revalidatePath('/admin/queue');
    revalidatePath('/admin/auction');
    revalidatePath('/admin');
    revalidatePath('/live');

    return {
      success: true,
      data: { lotId: newLot.id, drawNumber: newLot.draw_number },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to add player to lot queue.' };
  }
}

/**
 * Admin Proxy Bidding Action (§16).
 * Places a bid on behalf of a franchise whose network/device failed during the live room.
 */
export async function adminProxyBidAction(
  lotId: string,
  franchiseId: string,
  expectedPrice: number | null
): Promise<AuctionActionResult<{ newPrice: number }>> {
  try {
    const adminContext = await requireAdmin();
    const adminClient = createAdminClient();

    const { data: lot, error: lotErr } = await adminClient
      .from('auction_lots')
      .select('*')
      .eq('id', lotId)
      .single();

    if (lotErr || !lot || lot.status !== 'in_progress') {
      return { success: false, error: 'Lot is not currently in progress.' };
    }

    const squadData = await getFranchiseSquadData(adminClient, franchiseId, lot.season_id);
    if (!squadData) {
      return { success: false, error: 'Target franchise not found.' };
    }

    const mandatoryBucketDeficits = squadData.bucketProgress.buckets
      .filter((b) => b.isMandatory)
      .map((b) => ({
        bucket: b.bucket,
        minRequired: b.minPurchases,
        acquiredCount: b.acquiredCount,
      }));

    const nextBid = calculateNextBid(lot.current_price, lot.base_price);

    const validation = validateBidEligibility({
      lot: {
        id: lot.id,
        status: lot.status,
        current_price: lot.current_price,
        base_price: lot.base_price,
        highest_bidder_franchise_id: lot.highest_bidder_franchise_id,
        bucket: lot.bucket,
      },
      franchise: {
        id: franchiseId,
        remainingPurse: squadData.purseState.remainingPurse,
        squadCount: squadData.purseState.totalSquadCount,
        maxSquadSize: 22,
        auctionPurchasesSoFar: squadData.purseState.auctionPurchasesCount,
        minAuctionPurchases: 15,
        minBasePrice: 20,
        mandatoryBucketDeficits,
      },
      proposedBid: nextBid,
    });

    if (!validation.eligible) {
      return { success: false, error: validation.reason || 'Proxy bid is ineligible.' };
    }

    const now = new Date().toISOString();
    const mutation = await executeAuctionMutationFlow(
      adminClient,
      lot,
      {
        lotId,
        expectedStatus: 'in_progress',
        expectedPrice,
        newPrice: nextBid,
        highestBidderId: franchiseId,
        startedAt: now,
      },
      {
        seasonId: lot.season_id,
        lotId,
        eventType: 'BID_PLACED',
        actorUserId: adminContext.user.id,
        franchiseId,
        price: nextBid,
        reason: 'Proxy bid placed on behalf of franchise by tournament admin/operator (§16)',
        payload: { proxy: true, by_admin: adminContext.user.id },
        createdAt: now,
      }
    );

    if (!mutation.success) {
      return { success: false, error: mutation.error };
    }

    revalidatePath('/admin/auction');
    revalidatePath('/live');
    revalidatePath('/live/projector');

    return { success: true, data: { newPrice: nextBid } };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Proxy bid failed.' };
  }
}

/**
 * Super Admin Action to initiate Round 2 (§13).
 * Reopens all unsold and un-recalled skipped lots with base price reset to 20 credits.
 */
export async function adminStartRoundTwoAction(): Promise<
  AuctionActionResult<{ reopenedCount: number }>
> {
  try {
    const adminContext = await requireAdmin();
    if (!adminContext.isSuperAdmin) {
      return { success: false, error: 'Unauthorized: Only Super Admin can start Round 2 (§13).' };
    }

    const activeSeason = adminContext.activeSeason;
    if (!activeSeason) {
      return { success: false, error: 'No active season found.' };
    }

    const adminClient = createAdminClient();

    // 1. Fetch all unsold / skipped lots from Round 1
    const { data: eligibleLots, error: fetchErr } = await adminClient
      .from('auction_lots')
      .select('id, lot_number, registration_id, bucket')
      .eq('season_id', activeSeason.id)
      .in('status', ['unsold', 'skipped']);

    if (fetchErr || !eligibleLots || eligibleLots.length === 0) {
      return { success: false, error: 'No unsold or skipped players found to reopen for Round 2.' };
    }

    const now = new Date().toISOString();
    const lotIds = eligibleLots.map((l) => l.id);

    // 2. Reopen lots at base price 20, round 2, status pending
    const { error: updateErr } = await adminClient
      .from('auction_lots')
      .update({
        round: 2,
        base_price: 20,
        current_price: null,
        highest_bidder_franchise_id: null,
        status: 'pending',
        started_at: null,
        ended_at: null,
        updated_at: now,
      })
      .in('id', lotIds);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    // 3. Insert audit log
    await writeAuditLog(
      {
        seasonId: activeSeason.id,
        actorUserId: adminContext.user.id,
        action: 'START_ROUND_2',
        entityType: 'season',
        entityId: activeSeason.id,
        reason: `Round 2 started by Super Admin. Reopened ${lotIds.length} lots at base price 20 credits (§13).`,
        metadata: { reopened_lots_count: lotIds.length },
      },
      adminClient
    );

    revalidatePath('/admin/auction');
    revalidatePath('/admin/queue');
    revalidatePath('/live');

    return { success: true, data: { reopenedCount: lotIds.length } };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to start Round 2.' };
  }
}

/**
 * Auto-Allotment Action (§13, Endgame Step 1).
 * Auto-allots an unsold player at 20 credits to the franchise with the highest deficit in this bucket.
 * Priority: Most unfilled mandatory slots in this bucket (DESC), then unfilled overall slots (DESC),
 * then smallest remaining purse (ASC) as tie-breaker.
 * Status is set to 'allotted' (displayed as ALLOTTED, never SOLD).
 */
export async function adminAutoAllotLotAction(
  lotId: string,
  targetFranchiseId?: string
): Promise<AuctionActionResult<{ lotId: string; allottedToFranchiseId: string; franchiseName: string }>> {
  try {
    const adminContext = await requireAdmin();
    if (!adminContext.isSuperAdmin) {
      return { success: false, error: 'Unauthorized: Only Super Admin can execute auto-allotment (§13).' };
    }

    const adminClient = createAdminClient();

    // 1. Fetch lot
    const { data: lot, error: lotErr } = await adminClient
      .from('auction_lots')
      .select('*')
      .eq('id', lotId)
      .single();

    if (lotErr || !lot) {
      return { success: false, error: 'Lot not found.' };
    }

    // 2. Fetch all active franchises
    const { data: franchises } = await adminClient
      .from('franchises')
      .select('id, name')
      .eq('season_id', lot.season_id)
      .eq('is_active', true);

    if (!franchises || franchises.length === 0) {
      return { success: false, error: 'No active franchises found.' };
    }

    // 3. If target franchise is not explicitly provided, calculate priority winner (§13)
    let selectedFranchiseId = targetFranchiseId;
    let selectedFranchiseName = '';

    if (!selectedFranchiseId) {
      const franchisePriorities = [];

      for (const f of franchises) {
        const squad = await getFranchiseSquadData(adminClient, f.id, lot.season_id);
        if (!squad) continue;

        // Remaining needed in this lot's bucket
        const bucketItem = squad.bucketProgress.buckets.find((b) => b.bucket === lot.bucket);
        const bucketNeeded = bucketItem ? Math.max(0, bucketItem.minPurchases - bucketItem.acquiredCount) : 0;
        const totalSquadCount = squad.purseState.totalSquadCount;
        const remainingPurse = squad.purseState.remainingPurse;

        // Squad cannot exceed 22
        if (totalSquadCount < 22 && remainingPurse >= 20) {
          franchisePriorities.push({
            id: f.id,
            name: f.name,
            bucketNeeded,
            unfilledSlots: 22 - totalSquadCount,
            remainingPurse,
          });
        }
      }

      if (franchisePriorities.length === 0) {
        return { success: false, error: 'No franchise has available squad slots and purse (>=20) for allotment.' };
      }

      // Sort: bucketNeeded DESC, then unfilledSlots DESC, then remainingPurse ASC
      franchisePriorities.sort((a, b) => {
        if (b.bucketNeeded !== a.bucketNeeded) return b.bucketNeeded - a.bucketNeeded;
        if (b.unfilledSlots !== a.unfilledSlots) return b.unfilledSlots - a.unfilledSlots;
        return a.remainingPurse - b.remainingPurse;
      });

      selectedFranchiseId = franchisePriorities[0].id;
      selectedFranchiseName = franchisePriorities[0].name;
    } else {
      const f = franchises.find((item) => item.id === selectedFranchiseId);
      selectedFranchiseName = f?.name || 'Franchise';
    }

    if (!selectedFranchiseId) {
      return { success: false, error: 'Target franchise could not be determined for auto-allotment.' };
    }

    const now = new Date().toISOString();

    // 4. Update lot to 'allotted' at 20 credits
    const { error: updateErr } = await adminClient
      .from('auction_lots')
      .update({
        status: 'allotted',
        current_price: 20,
        highest_bidder_franchise_id: selectedFranchiseId,
        ended_at: now,
        updated_at: now,
      })
      .eq('id', lotId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    // 5. Record ALLOTMENT event
    await adminClient.from('auction_events').insert({
      season_id: lot.season_id,
      auction_lot_id: lotId,
      event_type: 'ALLOTMENT',
      actor_user_id: adminContext.user.id,
      franchise_id: selectedFranchiseId,
      price: 20,
      reason: `Auto-allotted to ${selectedFranchiseName} at base 20 credits under §13 endgame rules`,
      payload: { allotted: true, bucket: lot.bucket },
      created_at: now,
    });

    // 6. Write to audit_logs
    await writeAuditLog(
      {
        seasonId: lot.season_id,
        actorUserId: adminContext.user.id,
        action: 'ALLOTMENT',
        entityType: 'auction_lot',
        entityId: lotId,
        reason: `Player auto-allotted to ${selectedFranchiseName} at 20 credits (§13).`,
        metadata: { franchise_id: selectedFranchiseId, price: 20, bucket: lot.bucket },
      },
      adminClient
    );

    revalidatePath('/admin/auction');
    revalidatePath('/admin');
    revalidatePath('/live');
    revalidatePath('/franchise/squad');

    return {
      success: true,
      data: {
        lotId,
        allottedToFranchiseId: selectedFranchiseId,
        franchiseName: selectedFranchiseName,
      },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Auto-allotment failed.' };
  }
}

/**
 * Uniform Bucket Relaxation Action (§7, §13, §40).
 * Super Admin relaxes a bucket minimum (e.g. from 2 to 1) uniformly across all franchises.
 */
export async function adminRelaxBucketMinimumAction(
  bucket: string,
  newMinimum: number,
  reason: string
): Promise<AuctionActionResult<{ bucket: string; newMinimum: number }>> {
  try {
    const adminContext = await requireAdmin();
    if (!adminContext.isSuperAdmin) {
      return { success: false, error: 'Unauthorized: Only Super Admin can relax bucket minimums (§13).' };
    }

    if (!reason || reason.trim().length < 5) {
      return { success: false, error: 'A valid reason of at least 5 characters is required for bucket relaxation.' };
    }

    const activeSeason = adminContext.activeSeason;
    if (!activeSeason) {
      return { success: false, error: 'No active season found.' };
    }

    const adminClient = createAdminClient();
    const now = new Date().toISOString();

    // 1. Record BUCKET_RELAXATION in auction_events
    await adminClient.from('auction_events').insert({
      season_id: activeSeason.id,
      auction_lot_id: null,
      event_type: 'BUCKET_RELAXATION',
      actor_user_id: adminContext.user.id,
      reason: reason.trim(),
      payload: { bucket, new_minimum: newMinimum },
      created_at: now,
    });

    // 2. Write to audit_logs
    await writeAuditLog(
      {
        seasonId: activeSeason.id,
        actorUserId: adminContext.user.id,
        action: 'BUCKET_RELAXATION',
        entityType: 'bucket',
        reason: reason.trim(),
        metadata: { bucket, new_minimum: newMinimum },
      },
      adminClient
    );

    revalidatePath('/admin/auction');
    revalidatePath('/admin');
    revalidatePath('/live');

    return { success: true, data: { bucket, newMinimum } };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to relax bucket minimum.' };
  }
}

/**
 * Direct Assignment Action (§16).
 * Super Admin directly assigns a player to a franchise at a typed price.
 */
export async function adminDirectAssignAction(
  lotId: string,
  franchiseId: string,
  customPrice: number,
  reason: string
): Promise<AuctionActionResult<{ lotId: string; franchiseId: string; price: number }>> {
  try {
    const adminContext = await requireAdmin();
    if (!adminContext.isSuperAdmin) {
      return { success: false, error: 'Unauthorized: Only Super Admin can direct-assign players (§16).' };
    }

    if (!reason || reason.trim().length < 5) {
      return { success: false, error: 'A valid reason of at least 5 characters is required for direct assignment.' };
    }

    if (customPrice < 20) {
      return { success: false, error: 'Assignment price must be at least the base floor of 20 credits.' };
    }

    const adminClient = createAdminClient();

    const { data: lot, error: lotErr } = await adminClient
      .from('auction_lots')
      .select('*')
      .eq('id', lotId)
      .single();

    if (lotErr || !lot) {
      return { success: false, error: 'Lot not found.' };
    }

    const now = new Date().toISOString();

    const { error: updateErr } = await adminClient
      .from('auction_lots')
      .update({
        status: 'sold',
        current_price: customPrice,
        highest_bidder_franchise_id: franchiseId,
        ended_at: now,
        updated_at: now,
      })
      .eq('id', lotId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    await adminClient.from('auction_events').insert({
      season_id: lot.season_id,
      auction_lot_id: lotId,
      event_type: 'SALE',
      actor_user_id: adminContext.user.id,
      franchise_id: franchiseId,
      price: customPrice,
      reason: `Directly assigned by Super Admin: ${reason.trim()}`,
      payload: { direct_assigned: true, reason: reason.trim() },
      created_at: now,
    });

    await writeAuditLog(
      {
        seasonId: lot.season_id,
        actorUserId: adminContext.user.id,
        action: 'DIRECT_ASSIGNMENT',
        entityType: 'auction_lot',
        entityId: lotId,
        reason: reason.trim(),
        metadata: { franchise_id: franchiseId, price: customPrice },
      },
      adminClient
    );

    revalidatePath('/admin/auction');
    revalidatePath('/admin');
    revalidatePath('/live');
    revalidatePath('/franchise/squad');

    return { success: true, data: { lotId, franchiseId, price: customPrice } };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Direct assignment failed.' };
  }
}

/**
 * Scouting Action (§13, Endgame Step 2).
 * Super Admin registers a scouted player at fixed 20 credits for a franchise after genuine exhaustion.
 * Scouting is STRICTLY BLOCKED if any unsold players remain in the bucket (§13).
 */
export async function adminRegisterScoutedPlayerAction(params: {
  franchiseId: string;
  bucket: string;
  fullName: string;
  rollNumber: string;
  mobile?: string;
  reason?: string;
}): Promise<AuctionActionResult<{ lotId: string; playerId: string }>> {
  try {
    const adminContext = await requireAdmin();
    if (!adminContext.isSuperAdmin) {
      return { success: false, error: 'Unauthorized: Only Super Admin can register scouted players (§13).' };
    }

    const activeSeason = adminContext.activeSeason;
    if (!activeSeason) {
      return { success: false, error: 'No active season found.' };
    }

    const { franchiseId, bucket, fullName, rollNumber, mobile, reason } = params;

    if (!fullName || !rollNumber) {
      return { success: false, error: 'Player full name and roll number are required.' };
    }

    const adminClient = createAdminClient();

    // 1. Verify GENUINE EXHAUSTION (§13): check that 0 unsold players remain in this bucket
    const { count: unsoldInBucket } = await adminClient
      .from('auction_lots')
      .select('id', { count: 'exact', head: true })
      .eq('season_id', activeSeason.id)
      .eq('bucket', bucket)
      .in('status', ['pending', 'in_progress', 'skipped']);

    if (unsoldInBucket && unsoldInBucket > 0) {
      return {
        success: false,
        error: `Cannot scout: ${unsoldInBucket} unsold player(s) still remain in Bucket ${bucket}. Scouting is only permitted upon genuine exhaustion (§13).`,
      };
    }

    const now = new Date().toISOString();

    // 2. Insert or find player
    let { data: player } = await adminClient
      .from('players')
      .select('id')
      .eq('roll_number', rollNumber.trim().toUpperCase())
      .maybeSingle();

    if (!player) {
      const { data: createdPlayer, error: createErr } = await adminClient
        .from('players')
        .insert({
          full_name: fullName.trim(),
          roll_number: rollNumber.trim().toUpperCase(),
          mobile: mobile?.trim() || '9876543210',
          is_active: true,
        })
        .select('id')
        .single();

      if (createErr || !createdPlayer) {
        return { success: false, error: createErr?.message || 'Failed to create scouted player record.' };
      }
      player = createdPlayer;
    }

    // 3. Insert season registration
    const { data: reg, error: regErr } = await adminClient
      .from('player_season_registrations')
      .insert({
        player_id: player.id,
        season_id: activeSeason.id,
        bucket,
        base_price: 20,
        registration_status: 'eligible',
        payment_status: 'paid',
        is_auction_eligible: true,
      })
      .select('id')
      .single();

    if (regErr || !reg) {
      return { success: false, error: regErr?.message || 'Failed to register scouted player for season.' };
    }

    // 4. Create lot as 'allotted' at 20 credits
    const { data: newLot, error: lotErr } = await adminClient
      .from('auction_lots')
      .insert({
        season_id: activeSeason.id,
        registration_id: reg.id,
        bucket,
        draw_number: 999,
        base_price: 20,
        current_price: 20,
        highest_bidder_franchise_id: franchiseId,
        status: 'allotted',
        round: 2,
        started_at: now,
        ended_at: now,
      })
      .select('id')
      .single();

    if (lotErr || !newLot) {
      return { success: false, error: lotErr?.message || 'Failed to create auction lot for scouted player.' };
    }

    // 5. Record SCOUTING event in auction_events
    await adminClient.from('auction_events').insert({
      season_id: activeSeason.id,
      auction_lot_id: newLot.id,
      event_type: 'SCOUTING',
      actor_user_id: adminContext.user.id,
      franchise_id: franchiseId,
      price: 20,
      reason: reason || `Scouted player registered under §13 genuine exhaustion rules`,
      payload: { scouted: true, bucket, rollNumber },
      created_at: now,
    });

    // 6. Write to audit_logs
    await writeAuditLog(
      {
        seasonId: activeSeason.id,
        actorUserId: adminContext.user.id,
        action: 'SCOUTING',
        entityType: 'player',
        entityId: player.id,
        reason: reason || `Scouted player registered for franchise under §13.`,
        metadata: { franchise_id: franchiseId, bucket, price: 20, rollNumber },
      },
      adminClient
    );

    revalidatePath('/admin/auction');
    revalidatePath('/admin');
    revalidatePath('/live');
    revalidatePath('/franchise/squad');

    return { success: true, data: { lotId: newLot.id, playerId: player.id } };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Scouting registration failed.' };
  }
}

/**
 * Authoritative Draw Sequence (§10):
 * B.Tech 3rd year (B3) -> B.Tech 4th year (B4) -> B.Tech 2nd year (B2) -> Diploma (B5) -> B.Tech 1st year (B1) -> PG (last)
 */
const BUCKET_DRAW_SEQUENCE = ['B3', 'B4', 'B2', 'B5', 'B1', 'PG'] as const;

/**
 * Super Admin / Operator Action to skip a lot (§10).
 * Skipped players can be recalled at the end of their bucket or carried into Round 2.
 */
export async function skipLotAction(
  lotId: string,
  reason: string = 'Skipped by operator'
): Promise<AuctionActionResult<{ lotId: string }>> {
  try {
    const adminContext = await requireAdmin();
    const adminClient = createAdminClient();

    const { data: lot, error: fetchErr } = await adminClient
      .from('auction_lots')
      .select('*')
      .eq('id', lotId)
      .single();

    if (fetchErr || !lot) {
      return { success: false, error: 'Lot not found.' };
    }

    if (lot.status !== 'in_progress' && lot.status !== 'pending') {
      return { success: false, error: `Cannot skip lot in status '${lot.status}'.` };
    }

    const now = new Date().toISOString();
    const { error: updateErr } = await adminClient
      .from('auction_lots')
      .update({
        status: 'skipped',
        current_price: null,
        highest_bidder_franchise_id: null,
        started_at: null,
        ended_at: null,
        updated_at: now,
      })
      .eq('id', lotId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    await adminClient.from('auction_events').insert({
      season_id: lot.season_id,
      auction_lot_id: lotId,
      event_type: 'SKIP_LOT',
      actor_user_id: adminContext.user.id,
      reason: reason.trim(),
      created_at: now,
    });

    await writeAuditLog(
      {
        seasonId: lot.season_id,
        actorUserId: adminContext.user.id,
        action: 'SKIP_LOT',
        entityType: 'auction_lot',
        entityId: lotId,
        reason: reason.trim(),
        metadata: { lot_number: lot.lot_number, bucket: lot.bucket },
      },
      adminClient
    );

    revalidatePath('/admin/auction');
    revalidatePath('/admin/queue');
    revalidatePath('/live');
    revalidatePath('/live/projector');

    return { success: true, data: { lotId } };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to skip lot.' };
  }
}

/**
 * Super Admin / Operator Action to recall a skipped lot back to the floor (§10).
 */
export async function recallSkippedLotAction(
  lotId: string
): Promise<AuctionActionResult<{ lotId: string }>> {
  try {
    const adminContext = await requireAdmin();
    const adminClient = createAdminClient();

    const { data: lot, error: fetchErr } = await adminClient
      .from('auction_lots')
      .select('*')
      .eq('id', lotId)
      .single();

    if (fetchErr || !lot) {
      return { success: false, error: 'Lot not found.' };
    }

    if (lot.status !== 'skipped') {
      return { success: false, error: `Cannot recall lot. Status is '${lot.status}', expected 'skipped'.` };
    }

    const now = new Date().toISOString();
    const { error: updateErr } = await adminClient
      .from('auction_lots')
      .update({
        status: 'pending',
        current_price: null,
        highest_bidder_franchise_id: null,
        started_at: null,
        ended_at: null,
        updated_at: now,
      })
      .eq('id', lotId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    await adminClient.from('auction_events').insert({
      season_id: lot.season_id,
      auction_lot_id: lotId,
      event_type: 'RECALL_LOT',
      actor_user_id: adminContext.user.id,
      reason: `Recalled skipped player ${lot.lot_number} back to floor queue at base price ${lot.base_price} credits`,
      created_at: now,
    });

    await writeAuditLog(
      {
        seasonId: lot.season_id,
        actorUserId: adminContext.user.id,
        action: 'RECALL_LOT',
        entityType: 'auction_lot',
        entityId: lotId,
        reason: 'Recalled skipped player back to auction queue (§10)',
        metadata: { lot_number: lot.lot_number, bucket: lot.bucket },
      },
      adminClient
    );

    revalidatePath('/admin/auction');
    revalidatePath('/admin/queue');
    revalidatePath('/live');

    return { success: true, data: { lotId } };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to recall skipped lot.' };
  }
}

/**
 * Auto-Mode Draw Action (§10).
 * System randomly draws the next player according to the authoritative bucket sequence:
 * B3 -> B4 -> B2 -> B5 -> B1 -> PG.
 */
export async function drawNextAutoLotAction(
  activeBucket?: string
): Promise<AuctionActionResult<{ lotId: string; drawNumber: number; bucket: string; playerName: string }>> {
  try {
    const adminContext = await requireAdmin();
    const activeSeason = adminContext.activeSeason;
    if (!activeSeason) {
      return { success: false, error: 'No active season found.' };
    }

    const adminClient = createAdminClient();

    // Check if a lot is already in progress
    const { data: existingActive } = await adminClient
      .from('auction_lots')
      .select('id, lot_number')
      .eq('season_id', activeSeason.id)
      .eq('status', 'in_progress')
      .limit(1);

    if (existingActive && existingActive.length > 0) {
      return { success: false, error: 'A lot is already in progress on the auction block.' };
    }

    // Determine target bucket sequence
    const bucketsToSearch = activeBucket
      ? [activeBucket]
      : [...BUCKET_DRAW_SEQUENCE];

    let candidateLots: any[] = [];
    let selectedBucket = '';

    for (const b of bucketsToSearch) {
      const { data: pendingInBucket } = await adminClient
        .from('auction_lots')
        .select(`
          id,
          lot_number,
          draw_number,
          bucket,
          base_price,
          player_season_registrations (
            players (
              full_name
            )
          )
        `)
        .eq('season_id', activeSeason.id)
        .eq('bucket', b)
        .eq('status', 'pending');

      if (pendingInBucket && pendingInBucket.length > 0) {
        candidateLots = pendingInBucket;
        selectedBucket = b;
        break;
      }
    }

    if (candidateLots.length === 0) {
      return { success: false, error: 'No pending lots remain in the auction draw pool.' };
    }

    // Pick random lot within the selected bucket
    const randomIndex = Math.floor(Math.random() * candidateLots.length);
    const chosenLot = candidateLots[randomIndex];
    const reg: any = Array.isArray(chosenLot.player_season_registrations)
      ? chosenLot.player_season_registrations[0]
      : chosenLot.player_season_registrations;
    const player: any = Array.isArray(reg?.players) ? reg.players[0] : reg?.players;
    const playerName = player?.full_name || 'Player';

    // Move to in_progress
    const selectRes = await selectLotAction(chosenLot.id);
    if (!selectRes.success) {
      return { success: false, error: selectRes.error };
    }

    return {
      success: true,
      data: {
        lotId: chosenLot.id,
        drawNumber: chosenLot.draw_number || chosenLot.lot_number,
        bucket: selectedBucket,
        playerName,
      },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Auto draw failed.' };
  }
}

/**
 * Guest-Mode Draw Action (§10).
 * Honorary guest calls a number aloud; operator enters it and that player comes up.
 * Enforces: no number is ever called twice.
 */
export async function callGuestDrawNumberAction(
  drawNumber: number,
  bucket: string
): Promise<AuctionActionResult<{ lotId: string; drawNumber: number; playerName: string }>> {
  try {
    const adminContext = await requireAdmin();
    const activeSeason = adminContext.activeSeason;
    if (!activeSeason) {
      return { success: false, error: 'No active season found.' };
    }

    if (!drawNumber || drawNumber < 1) {
      return { success: false, error: 'Please enter a valid draw number.' };
    }

    const adminClient = createAdminClient();

    // Find lot by draw_number in active bucket
    const { data: lots, error: lotErr } = await adminClient
      .from('auction_lots')
      .select(`
        id,
        lot_number,
        draw_number,
        bucket,
        status,
        base_price,
        player_season_registrations (
          players (
            full_name
          )
        )
      `)
      .eq('season_id', activeSeason.id)
      .eq('bucket', bucket)
      .eq('draw_number', drawNumber);

    if (lotErr || !lots || lots.length === 0) {
      return { success: false, error: `Draw number #${drawNumber} not found in Bucket ${bucket}.` };
    }

    const targetLot = lots[0];

    // Enforce: no number is ever called twice (§10)
    if (targetLot.status === 'sold' || targetLot.status === 'allotted') {
      return {
        success: false,
        error: `Draw number #${drawNumber} has already been called and sold/allotted. No number may be called twice (§10).`,
      };
    }

    if (targetLot.status === 'in_progress') {
      return { success: false, error: `Draw number #${drawNumber} is already on the auction block.` };
    }

    const reg: any = Array.isArray(targetLot.player_season_registrations)
      ? targetLot.player_season_registrations[0]
      : targetLot.player_season_registrations;
    const player: any = Array.isArray(reg?.players) ? reg.players[0] : reg?.players;
    const playerName = player?.full_name || 'Player';

    // Bring to floor
    const selectRes = await selectLotAction(targetLot.id);
    if (!selectRes.success) {
      return { success: false, error: selectRes.error };
    }

    return {
      success: true,
      data: {
        lotId: targetLot.id,
        drawNumber,
        playerName,
      },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Guest draw failed.' };
  }
}

