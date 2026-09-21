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
import { getFranchiseSquadData } from '@/lib/franchises/queries';
import { executeAuctionMutationFlow } from './transaction';
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

    // 4. Non-cascading rule check: ensure NO subsequent acquisition events have occurred
    const { data: subsequentAcquisitions } = await adminClient
      .from('auction_events')
      .select('id, event_type, sequence_number')
      .eq('season_id', lot.season_id)
      .in('event_type', ['SALE', 'ALLOTMENT', 'SCOUTING'])
      .gt('sequence_number', saleEvent.sequence_number);

    if (subsequentAcquisitions && subsequentAcquisitions.length > 0) {
      return {
        success: false,
        error:
          'Cannot undo sale: subsequent player acquisition events have already taken place. Non-cascading rule blocks undo of non-recent sales.',
      };
    }

    // 5. Find the bidding state immediately prior to the sale
    const { data: priorBids } = await adminClient
      .from('auction_events')
      .select('*')
      .eq('auction_lot_id', lotId)
      .eq('event_type', 'BID_PLACED')
      .lt('sequence_number', saleEvent.sequence_number)
      .order('sequence_number', { ascending: false });

    const winningBid = priorBids && priorBids.length > 0 ? priorBids[0] : null;
    const now = new Date().toISOString();

    // 6. Apply restoration via atomic mutation flow
    const isResume = restoreTo === 'resume_bidding';
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
        reason: `Sale undone by auction operator. Restored to: ${restoreTo}`,
        payload: {
          restored_to: restoreTo,
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

    revalidatePath('/admin/auction');
    revalidatePath('/live');
    revalidatePath('/live/projector');
    revalidatePath('/franchise');
    revalidatePath('/franchise/squad');

    return { success: true, data: { restoredTo: restoreTo } };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to undo sale.' };
  }
}
