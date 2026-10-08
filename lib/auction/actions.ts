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
import { getActiveLot, getAuctionSessionState, getGuestDrawCandidates } from './queries';
import { getActiveSeason } from '@/lib/permissions/context';
import { executeAuctionMutationFlow } from './transaction';
import { broadcastAuctionUpdate } from './realtime';
import { writeAuditLog } from '@/lib/audit/logger';
import { DEFAULT_BUCKET_ORDER } from './types';
import { parseBucketPlayerNumber } from './bucket-numbering';
import type {
  AuctionActionResult,
  AuctionLotWithDetails,
  AuctionSessionState,
  RestoreToMode,
  AdminAuctionRestartRecoveryParams,
  AuctionRecoveryResult,
  GuestDrawCandidate,
} from './types';

/**
 * Selects an upcoming lot from the queue and transitions it to 'in_progress'.
 * Guarded by requireAdmin().
 */
export async function selectLotAction(
  lotId: string
): Promise<
  AuctionActionResult<{
    lotId: string;
    activeLot?: AuctionLotWithDetails | null;
    sessionState?: AuctionSessionState;
  }>
> {
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

    // Validate that lot belongs to currently active buckets if configured
    const { data: bucketConfig } = await adminClient
      .from('season_config')
      .select('value')
      .eq('season_id', lot.season_id)
      .eq('key', 'auction_active_buckets')
      .maybeSingle();

    if (bucketConfig?.value) {
      try {
        const activeBuckets = JSON.parse(bucketConfig.value);
        if (Array.isArray(activeBuckets) && activeBuckets.length > 0) {
          if (!activeBuckets.includes(lot.bucket)) {
            return {
              success: false,
              error: `Cannot select lot: Bucket '${lot.bucket}' is not in the active bucket selection (${activeBuckets.join(', ')}).`,
            };
          }
        }
      } catch {
        // Fallback on JSON parse error
      }
    }

    // 3. Ensure no lot is currently in progress with active bids
    const { data: existingActive } = await adminClient
      .from('auction_lots')
      .select('id, highest_bidder_franchise_id, current_price')
      .eq('season_id', lot.season_id)
      .eq('status', 'in_progress')
      .maybeSingle();

    if (existingActive) {
      if (existingActive.highest_bidder_franchise_id !== null || existingActive.current_price !== null) {
        return {
          success: false,
          error: 'Cannot select lot: active bidding is currently in progress. Complete (SOLD) or pass (UNSOLD) the lot first.',
        };
      }
      // Unbid lot on the floor: revert to pending safely
      await adminClient
        .from('auction_lots')
        .update({
          status: 'pending',
          started_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingActive.id);
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

    await adminClient
      .from('season_config')
      .delete()
      .eq('season_id', lot.season_id)
      .in('key', ['auction_lot_paused_remaining_seconds', 'auction_paused_at']);

    revalidatePath('/live');
    revalidatePath('/live/projector');
    revalidatePath('/franchise/auction');
    revalidatePath('/player/auction');
    const { data: timerConfig } = await adminClient
      .from('season_config')
      .select('value')
      .eq('season_id', lot.season_id)
      .eq('key', 'auction_first_bid_timer_seconds')
      .maybeSingle();
    const durationSeconds = timerConfig?.value ? parseInt(timerConfig.value, 10) : 30;

    await broadcastAuctionUpdate(lot.season_id, 'PLAYER_SELECTED', {
      lotId: lot.id,
      currentPrice: null,
      highestBidderId: null,
      startedAt: now,
      durationSeconds,
    });

    const activeLotWithDetails = await getActiveLot(adminClient, lot.season_id);
    const sessionState = await getAuctionSessionState(adminClient, lot.season_id);

    return {
      success: true,
      data: {
        lotId: lot.id,
        activeLot: activeLotWithDetails,
        sessionState,
      },
    };
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

    // 2. Fetch active lot, session config, and franchise squad concurrently
    const targetSeasonId = franchiseContext.activeSeason?.id || '00000000-0000-0000-0000-000000000001';
    const [lotRes, sessionConfigRes, squadData] = await Promise.all([
      adminClient.from('auction_lots').select('*').eq('id', lotId).single(),
      adminClient
        .from('season_config')
        .select('value')
        .eq('season_id', targetSeasonId)
        .eq('key', 'auction_session_status')
        .maybeSingle(),
      getFranchiseSquadData(adminClient, franchiseId, targetSeasonId),
    ]);

    const lot = lotRes.data;
    if (lotRes.error || !lot) {
      return { success: false, error: 'Lot not found.' };
    }

    if (lot.status !== 'in_progress') {
      return { success: false, error: 'Lot is no longer in progress.' };
    }

    const sessionConfig = sessionConfigRes.data;
    if (sessionConfig?.value === 'paused') {
      return { success: false, error: 'Cannot place bid: auction session is currently paused.' };
    }
    if (sessionConfig?.value === 'completed') {
      return { success: false, error: 'Cannot place bid: auction session has ended.' };
    }

    if (!squadData) {
      return { success: false, error: 'Franchise data could not be retrieved.' };
    }

    // 3. Determine next legal bid and validate full domain eligibility
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

    // 4. Execute atomic mutation flow
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

    revalidatePath('/live');
    revalidatePath('/live/projector');
    revalidatePath('/franchise/auction');
    revalidatePath('/player/auction');
    revalidatePath('/admin/auction');

    const franchise = franchiseContext.assignedFranchise;
    const { data: timerConfig } = await adminClient
      .from('season_config')
      .select('value')
      .eq('season_id', targetSeasonId)
      .eq('key', 'auction_subsequent_bid_timer_seconds')
      .maybeSingle();
    const durationSeconds = timerConfig?.value ? parseInt(timerConfig.value, 10) : 20;

    await broadcastAuctionUpdate(lot.season_id, 'BID_PLACED', {
      lotId: lot.id,
      currentPrice: nextBid,
      highestBidderId: franchise.id,
      highestBidderName: franchise.name,
      highestBidderShortName: franchise.short_name,
      highestBidderPrimaryColor: (franchise as any).color_primary || null,
      startedAt: now,
      durationSeconds,
    });

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
/**
 * Automatically advances to the next eligible lot based on active buckets and DEFAULT_BUCKET_ORDER.
 * Returns true if a lot was advanced, false if no pending lots remain in the selected buckets.
 */
export async function autoAdvanceToNextLot(
  adminClient: any,
  seasonId: string,
  actorUserId: string
): Promise<{ advanced: boolean; nextLotId: string | null; nextLot?: AuctionLotWithDetails | null }> {
  try {
    // 1. Check session state - do not advance if completed
    const { data: sessionConfig } = await adminClient
      .from('season_config')
      .select('value')
      .eq('season_id', seasonId)
      .eq('key', 'auction_session_status')
      .maybeSingle();

    if (sessionConfig?.value === 'completed') {
      return { advanced: false, nextLotId: null, nextLot: null };
    }

    // 2. Ensure no lot is currently in_progress
    const { data: activeLot } = await adminClient
      .from('auction_lots')
      .select('id')
      .eq('season_id', seasonId)
      .eq('status', 'in_progress')
      .maybeSingle();

    if (activeLot) {
      const existingDetails = await getActiveLot(adminClient, seasonId);
      return { advanced: false, nextLotId: activeLot.id, nextLot: existingDetails };
    }

    // 3. Read active buckets from season_config
    const { data: bucketConfig } = await adminClient
      .from('season_config')
      .select('value')
      .eq('season_id', seasonId)
      .eq('key', 'auction_active_buckets')
      .maybeSingle();

    let activeBuckets: string[] = [...DEFAULT_BUCKET_ORDER];
    if (bucketConfig?.value) {
      try {
        const parsed = JSON.parse(bucketConfig.value);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const valid = parsed.filter((b: string) =>
            (DEFAULT_BUCKET_ORDER as readonly string[]).includes(b as any)
          );
          if (valid.length > 0) {
            activeBuckets = valid;
          }
        }
      } catch {
        // Fallback on parse failure
      }
    }

    // 4. Query pending lots in active buckets
    const { data: pendingLots } = await adminClient
      .from('auction_lots')
      .select('*')
      .eq('season_id', seasonId)
      .eq('status', 'pending')
      .in('bucket', activeBuckets)
      .order('round', { ascending: true })
      .order('draw_number', { ascending: true })
      .limit(100);

    if (!pendingLots || pendingLots.length === 0) {
      return { advanced: false, nextLotId: null, nextLot: null };
    }

    // 5. Deterministic sorting: active bucket priority first, then draw_number ASC
    const nextLot = [...pendingLots].sort((a, b) => {
      const rankA = activeBuckets.indexOf(a.bucket);
      const rankB = activeBuckets.indexOf(b.bucket);
      const orderA = rankA === -1 ? 999 : rankA;
      const orderB = rankB === -1 ? 999 : rankB;
      if (orderA !== orderB) return orderA - orderB;
      return a.draw_number - b.draw_number;
    })[0];

    if (!nextLot) {
      return { advanced: false, nextLotId: null, nextLot: null };
    }

    const now = new Date().toISOString();

    // 6. Activate next lot atomically using existing mutation engine
    const mutation = await executeAuctionMutationFlow(
      adminClient,
      nextLot,
      {
        lotId: nextLot.id,
        expectedStatus: 'pending',
        newStatus: 'in_progress',
        newPrice: null,
        highestBidderId: null,
        startedAt: now,
        endedAt: null,
      },
      {
        seasonId,
        lotId: nextLot.id,
        eventType: 'PLAYER_SELECTED',
        actorUserId,
        reason: `Auto-advanced by auction system (Bucket ${nextLot.bucket})`,
        createdAt: now,
      }
    );

    if (!mutation.success) {
      return { advanced: false, nextLotId: null, nextLot: null };
    }

    // Clear pause states
    await adminClient
      .from('season_config')
      .delete()
      .eq('season_id', seasonId)
      .in('key', ['auction_lot_paused_remaining_seconds', 'auction_paused_at']);

    revalidatePath('/live');
    revalidatePath('/live/projector');
    revalidatePath('/franchise/auction');
    revalidatePath('/player/auction');

    const { data: timerConfig } = await adminClient
      .from('season_config')
      .select('value')
      .eq('season_id', seasonId)
      .eq('key', 'auction_first_bid_timer_seconds')
      .maybeSingle();

    const durationSeconds = timerConfig?.value ? parseInt(timerConfig.value, 10) : 30;

    // Broadcast PLAYER_SELECTED for the new lot
    await broadcastAuctionUpdate(seasonId, 'PLAYER_SELECTED', {
      lotId: nextLot.id,
      currentPrice: null,
      highestBidderId: null,
      startedAt: now,
      durationSeconds,
    });

    const nextLotDetails = await getActiveLot(adminClient, seasonId);

    return { advanced: true, nextLotId: nextLot.id, nextLot: nextLotDetails };
  } catch (err) {
    console.error('[autoAdvanceToNextLot] Error during automatic progression:', err);
    return { advanced: false, nextLotId: null, nextLot: null };
  }
}

/**
 * Confirms the sale of an active lot to the highest bidder (Hammer).
 * Guarded by requireAdmin().
 * Automatically advances to the next eligible lot in active buckets.
 */
export async function confirmSaleAction(
  lotId: string
): Promise<
  AuctionActionResult<{
    price: number;
    franchiseId: string;
    nextLotId?: string | null;
    activeLot?: AuctionLotWithDetails | null;
    sessionState?: AuctionSessionState;
  }>
> {
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

    await adminClient
      .from('season_config')
      .delete()
      .eq('season_id', lot.season_id)
      .in('key', ['auction_lot_paused_remaining_seconds', 'auction_paused_at']);

    revalidatePath('/live');
    revalidatePath('/live/projector');
    revalidatePath('/franchise/auction');
    revalidatePath('/player/auction');
    revalidatePath('/franchise');
    revalidatePath('/franchise/squad');

    await broadcastAuctionUpdate(lot.season_id, 'SALE', {
      lotId: lot.id,
      currentPrice: lot.current_price,
      highestBidderId: lot.highest_bidder_franchise_id,
    });

    // 3. Concurrency-safe automatic advance to next player
    const advanceResult = await autoAdvanceToNextLot(
      adminClient,
      lot.season_id,
      adminContext.user.id
    );

    const sessionState = await getAuctionSessionState(adminClient, lot.season_id);

    return {
      success: true,
      data: {
        price: lot.current_price,
        franchiseId: lot.highest_bidder_franchise_id,
        nextLotId: advanceResult.nextLotId,
        activeLot: advanceResult.nextLot ?? null,
        sessionState,
      },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to confirm sale.' };
  }
}

/**
 * Marks an active lot as unsold.
 * Guarded by requireAdmin().
 * Automatically advances to the next eligible lot in active buckets.
 */
export async function markUnsoldAction(
  lotId: string
): Promise<
  AuctionActionResult<{
    nextLotId?: string | null;
    activeLot?: AuctionLotWithDetails | null;
    sessionState?: AuctionSessionState;
  }>
> {
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

    await adminClient
      .from('season_config')
      .delete()
      .eq('season_id', lot.season_id)
      .in('key', ['auction_lot_paused_remaining_seconds', 'auction_paused_at']);

    revalidatePath('/live');
    revalidatePath('/live/projector');
    revalidatePath('/franchise/auction');
    revalidatePath('/player/auction');

    await broadcastAuctionUpdate(lot.season_id, 'UNSOLD', {
      lotId: lot.id,
    });

    // 3. Concurrency-safe automatic advance to next player
    const advanceResult = await autoAdvanceToNextLot(
      adminClient,
      lot.season_id,
      adminContext.user.id
    );

    const sessionState = await getAuctionSessionState(adminClient, lot.season_id);

    return {
      success: true,
      data: {
        nextLotId: advanceResult.nextLotId,
        activeLot: advanceResult.nextLot ?? null,
        sessionState,
      },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to mark lot unsold.' };
  }
}

/**
 * Updates the active auction buckets persisted in season_config.
 * Guarded by requireAdmin().
 * Normalizes to DEFAULT_BUCKET_ORDER and broadcasts ACTIVE_BUCKETS_UPDATED.
 */
export async function updateActiveBucketsAction(
  buckets: string[]
): Promise<AuctionActionResult<{ activeBuckets: string[] }>> {
  try {
    const adminContext = await requireAdmin();
    const targetSeasonId =
      adminContext.activeSeason?.id || '00000000-0000-0000-0000-000000000001';
    const adminClient = createAdminClient();

    if (!Array.isArray(buckets) || buckets.length === 0) {
      return { success: false, error: 'At least one active bucket must be selected.' };
    }

    const invalidBuckets = buckets.filter(
      (b) => !(DEFAULT_BUCKET_ORDER as readonly string[]).includes(b as any)
    );
    if (invalidBuckets.length > 0) {
      return {
        success: false,
        error: `Invalid bucket selection: ${invalidBuckets.join(', ')}`,
      };
    }

    const normalizedBuckets = buckets.filter(
      (b, idx, arr) => (DEFAULT_BUCKET_ORDER as readonly string[]).includes(b as any) && arr.indexOf(b) === idx
    );
    const now = new Date().toISOString();

    const { error: upsertErr } = await adminClient.from('season_config').upsert(
      {
        season_id: targetSeasonId,
        key: 'auction_active_buckets',
        value: JSON.stringify(normalizedBuckets),
        value_type: 'json',
        description: 'Active auction buckets currently prioritized for progression',
        updated_at: now,
      },
      { onConflict: 'season_id,key' }
    );

    if (upsertErr) {
      return { success: false, error: 'Failed to persist active bucket configuration.' };
    }

    await broadcastAuctionUpdate(targetSeasonId, 'ACTIVE_BUCKETS_UPDATED', {
      activeBuckets: normalizedBuckets,
    });

    revalidatePath('/admin/queue');
    revalidatePath('/live');
    revalidatePath('/live/projector');

    return {
      success: true,
      data: { activeBuckets: normalizedBuckets },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to update active buckets.' };
  }
}

/**
 * Selects a random eligible pending lot from the currently persisted active buckets.
 * Guarded by requireAdmin().
 */
export async function drawRandomLotFromBucketsAction(): Promise<
  AuctionActionResult<{
    lotId: string;
    drawNumber: number;
    bucket: string;
    activeLot?: AuctionLotWithDetails | null;
    sessionState?: AuctionSessionState;
  }>
> {
  try {
    const adminContext = await requireAdmin();
    const targetSeasonId =
      adminContext.activeSeason?.id || '00000000-0000-0000-0000-000000000001';
    const adminClient = createAdminClient();

    // 1. Verify auction session is not completed
    const { data: sessionConfig } = await adminClient
      .from('season_config')
      .select('value')
      .eq('season_id', targetSeasonId)
      .eq('key', 'auction_session_status')
      .maybeSingle();

    if (sessionConfig?.value === 'completed') {
      return { success: false, error: 'Cannot draw player: auction session has ended.' };
    }

    // 2. Ensure no active in_progress lot with active bids
    const { data: activeLot } = await adminClient
      .from('auction_lots')
      .select('id, highest_bidder_franchise_id, current_price')
      .eq('season_id', targetSeasonId)
      .eq('status', 'in_progress')
      .maybeSingle();

    if (activeLot) {
      if (activeLot.highest_bidder_franchise_id !== null || activeLot.current_price !== null) {
        return {
          success: false,
          error: 'Active bidding is currently in progress. Complete (SOLD) or pass (UNSOLD) the lot first.',
        };
      }
      // Unbid lot on the floor: safely revert to pending
      await adminClient
        .from('auction_lots')
        .update({
          status: 'pending',
          started_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', activeLot.id);
    }

    // 3. Read active buckets persisted in season_config (server-authoritative)
    const { data: bucketConfig } = await adminClient
      .from('season_config')
      .select('value')
      .eq('season_id', targetSeasonId)
      .eq('key', 'auction_active_buckets')
      .maybeSingle();

    let activeBuckets: string[] = [...DEFAULT_BUCKET_ORDER];
    if (bucketConfig?.value) {
      try {
        const parsed = JSON.parse(bucketConfig.value);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const valid = parsed.filter((b: string) =>
            (DEFAULT_BUCKET_ORDER as readonly string[]).includes(b as any)
          );
          if (valid.length > 0) {
            activeBuckets = DEFAULT_BUCKET_ORDER.filter((b) => valid.includes(b));
          }
        }
      } catch {
        // Fallback
      }
    }

    // 4. Query pending lots in active buckets
    const { data: candidates, error: fetchErr } = await adminClient
      .from('auction_lots')
      .select('*')
      .eq('season_id', targetSeasonId)
      .eq('status', 'pending')
      .in('bucket', activeBuckets);

    if (fetchErr || !candidates || candidates.length === 0) {
      return {
        success: false,
        error: 'No eligible pending players remain in the selected buckets.',
      };
    }

    // 5. Select a random candidate server-side
    const selectedLot = candidates[Math.floor(Math.random() * candidates.length)];
    const now = new Date().toISOString();

    // 6. Activate using existing transaction mechanism
    const mutation = await executeAuctionMutationFlow(
      adminClient,
      selectedLot,
      {
        lotId: selectedLot.id,
        expectedStatus: 'pending',
        newStatus: 'in_progress',
        newPrice: null,
        highestBidderId: null,
        startedAt: now,
        endedAt: null,
      },
      {
        seasonId: targetSeasonId,
        lotId: selectedLot.id,
        eventType: 'PLAYER_SELECTED',
        actorUserId: adminContext.user.id,
        reason: `Random draw from active buckets [${activeBuckets.join(', ')}]`,
        createdAt: now,
      }
    );

    if (!mutation.success) {
      return { success: false, error: mutation.error };
    }

    await adminClient
      .from('season_config')
      .delete()
      .eq('season_id', targetSeasonId)
      .in('key', ['auction_lot_paused_remaining_seconds', 'auction_paused_at']);

    revalidatePath('/live');
    revalidatePath('/live/projector');
    revalidatePath('/franchise/auction');
    revalidatePath('/player/auction');

    const { data: timerConfig } = await adminClient
      .from('season_config')
      .select('value')
      .eq('season_id', targetSeasonId)
      .eq('key', 'auction_first_bid_timer_seconds')
      .maybeSingle();

    const durationSeconds = timerConfig?.value ? parseInt(timerConfig.value, 10) : 30;

    await broadcastAuctionUpdate(targetSeasonId, 'PLAYER_SELECTED', {
      lotId: selectedLot.id,
      currentPrice: null,
      highestBidderId: null,
      startedAt: now,
      durationSeconds,
    });

    const activeLotWithDetails = await getActiveLot(adminClient, targetSeasonId);
    const sessionState = await getAuctionSessionState(adminClient, targetSeasonId);

    return {
      success: true,
      data: {
        lotId: selectedLot.id,
        drawNumber: selectedLot.draw_number,
        bucket: selectedLot.bucket,
        activeLot: activeLotWithDetails,
        sessionState,
      },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to draw random lot.' };
  }
}

/**
 * Brings a specific lot selected via Guest Draw to the floor.
 * Guarded by requireAdmin().
 * Supports either direct lot ID (card click) or numeric draw number (voice call).
 * Server independently validates lot belongs to season, matches bucket, and is 'pending'.
 */
export async function callGuestDrawNumberAction(
  lotIdOrDrawNumber: string | number,
  bucket: string,
  seasonId?: string
): Promise<AuctionActionResult<{
  lotId: string;
  drawNumber: number;
  playerName: string;
  activeLot?: AuctionLotWithDetails | null;
  sessionState?: AuctionSessionState;
}>> {
  try {
    const adminContext = await requireAdmin();
    const targetSeasonId =
      seasonId ||
      adminContext.activeSeason?.id ||
      '00000000-0000-0000-0000-000000000001';
    const adminClient = createAdminClient();

    // 1. Session check
    const { data: sessionConfig } = await adminClient
      .from('season_config')
      .select('value')
      .eq('season_id', targetSeasonId)
      .eq('key', 'auction_session_status')
      .maybeSingle();

    if (sessionConfig?.value === 'completed') {
      return { success: false, error: 'Cannot select lot: auction session has ended.' };
    }

    // 2. Ensure no active in_progress lot on the floor
    const { data: activeLot } = await adminClient
      .from('auction_lots')
      .select('id, highest_bidder_franchise_id, current_price')
      .eq('season_id', targetSeasonId)
      .eq('status', 'in_progress')
      .maybeSingle();

    if (activeLot) {
      return {
        success: false,
        error:
          'Cannot draw: a player is already active on the auction floor. Complete (SOLD) or pass (UNSOLD) the lot before drawing another player.',
      };
    }

    // 3. Fetch targeted lot and independently validate
    const isUuid =
      typeof lotIdOrDrawNumber === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lotIdOrDrawNumber);

    let targetLotId: string | null = null;
    let targetDrawNumber: number | null = null;

    if (isUuid) {
      targetLotId = lotIdOrDrawNumber as string;
    } else {
      const parsedBucketNum =
        typeof lotIdOrDrawNumber === 'string' ? parseBucketPlayerNumber(lotIdOrDrawNumber) : null;

      if (parsedBucketNum) {
        // e.g. "B31"
        const targetBucket = parsedBucketNum.bucket;
        const targetSeq = parsedBucketNum.sequenceNumber;
        const { data: bucketLots } = await adminClient
          .from('auction_lots')
          .select('id, draw_number')
          .eq('season_id', targetSeasonId)
          .eq('bucket', targetBucket)
          .order('draw_number', { ascending: true });

        if (bucketLots && bucketLots[targetSeq - 1]) {
          targetLotId = bucketLots[targetSeq - 1].id;
        }
      } else {
        const numericVal = Number(lotIdOrDrawNumber);
        if (!isNaN(numericVal)) {
          // Check if numericVal corresponds to card index within the bucket (1..N)
          const { data: bucketLots } = await adminClient
            .from('auction_lots')
            .select('id, draw_number')
            .eq('season_id', targetSeasonId)
            .eq('bucket', bucket)
            .order('draw_number', { ascending: true });

          if (bucketLots && numericVal >= 1 && numericVal <= bucketLots.length) {
            targetLotId = bucketLots[numericVal - 1].id;
          } else {
            targetDrawNumber = numericVal;
          }
        }
      }
    }

    let lotQuery = adminClient
      .from('auction_lots')
      .select(`
        *,
        player_season_registrations (
          players (
            full_name
          )
        )
      `)
      .eq('season_id', targetSeasonId);

    if (targetLotId) {
      lotQuery = lotQuery.eq('id', targetLotId);
    } else if (targetDrawNumber !== null) {
      lotQuery = lotQuery.eq('draw_number', targetDrawNumber).eq('bucket', bucket);
    } else {
      return { success: false, error: 'Selected Guest Draw lot was not found.' };
    }

    const { data: lots, error: fetchErr } = await lotQuery;
    const lot: any = lots?.[0];

    if (fetchErr || !lot) {
      return { success: false, error: 'Selected Guest Draw lot was not found.' };
    }

    if (lot.bucket !== bucket) {
      return {
        success: false,
        error: `Lot bucket mismatch. Expected '${bucket}', found '${lot.bucket}'.`,
      };
    }

    if (lot.status !== 'pending') {
      return {
        success: false,
        error: `Lot is already ${lot.status} and cannot be drawn.`,
      };
    }

    const reg: any = Array.isArray(lot.player_season_registrations)
      ? lot.player_season_registrations[0]
      : lot.player_season_registrations;
    const player: any = Array.isArray(reg?.players) ? reg.players[0] : reg?.players;
    const playerName = player?.full_name || 'Player';

    const now = new Date().toISOString();

    // 4. Activate atomically
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
        seasonId: targetSeasonId,
        lotId: lot.id,
        eventType: 'PLAYER_SELECTED',
        actorUserId: adminContext.user.id,
        reason: `Guest Draw card selection (Bucket ${bucket}, Draw #${lot.draw_number})`,
        createdAt: now,
      }
    );

    if (!mutation.success) {
      return { success: false, error: mutation.error };
    }

    await adminClient
      .from('season_config')
      .delete()
      .eq('season_id', targetSeasonId)
      .in('key', ['auction_lot_paused_remaining_seconds', 'auction_paused_at']);

    // 5. Automatically activate the auction session if called before auction start
    const isSessionLive = sessionConfig?.value === 'live';
    if (!isSessionLive) {
      await adminClient
        .from('seasons')
        .update({ status: 'auction', updated_at: now })
        .eq('id', targetSeasonId);

      await adminClient.from('season_config').upsert(
        {
          season_id: targetSeasonId,
          key: 'auction_session_status',
          value: 'live',
          value_type: 'text',
          description: 'Current operational state of the live auction session (live, paused, completed)',
          updated_at: now,
        },
        { onConflict: 'season_id,key' }
      );

      await adminClient.from('season_config').upsert(
        {
          season_id: targetSeasonId,
          key: 'auction_started_at',
          value: now,
          value_type: 'text',
          description: 'Timestamp when auction session was officially started',
          updated_at: now,
        },
        { onConflict: 'season_id,key' }
      );

      await broadcastAuctionUpdate(targetSeasonId, 'AUCTION_STARTED', {
        lotId: lot.id,
        startedAt: now,
        sessionStatus: 'live',
      });
    }

    revalidatePath('/admin/queue');
    revalidatePath('/live');
    revalidatePath('/live/projector');
    revalidatePath('/franchise/auction');
    revalidatePath('/player/auction');

    const { data: timerConfig } = await adminClient
      .from('season_config')
      .select('value')
      .eq('season_id', targetSeasonId)
      .eq('key', 'auction_first_bid_timer_seconds')
      .maybeSingle();

    const durationSeconds = timerConfig?.value ? parseInt(timerConfig.value, 10) : 30;

    await broadcastAuctionUpdate(targetSeasonId, 'PLAYER_SELECTED', {
      lotId: lot.id,
      currentPrice: null,
      highestBidderId: null,
      startedAt: now,
      durationSeconds,
    });

    const activeLotWithDetails = await getActiveLot(adminClient, targetSeasonId);
    const sessionState = await getAuctionSessionState(adminClient, targetSeasonId);

    return {
      success: true,
      data: {
        lotId: lot.id,
        drawNumber: lot.draw_number,
        playerName,
        activeLot: activeLotWithDetails,
        sessionState,
      },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to execute Guest Draw selection.' };
  }
}

/**
 * Fetches the stable snapshot of guest draw candidates for a given bucket.
 * Available by default so guests and operators can view available cards without an unlock step.
 * Privileged floor mutations remain strictly guarded by requireAdmin() in callGuestDrawNumberAction.
 */
export async function getGuestDrawSnapshotAction(
  bucket: string,
  seasonId?: string
): Promise<AuctionActionResult<GuestDrawCandidate[]>> {
  try {
    const adminClient = createAdminClient();
    let targetSeasonId: string = seasonId || '';
    if (!targetSeasonId) {
      const activeSeason = await getActiveSeason(adminClient);
      targetSeasonId = activeSeason?.id || '';
    }
    if (!targetSeasonId) {
      const { data: latestSeason } = await adminClient
        .from('seasons')
        .select('id')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      targetSeasonId = latestSeason?.id || '00000000-0000-0000-0000-000000000001';
    }

    const candidates = await getGuestDrawCandidates(adminClient, targetSeasonId, bucket);
    return { success: true, data: candidates };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to fetch guest draw snapshot.' };
  }
}

/**
 * Extends the timer for an in_progress lot when TIME UP is reached.
 * Guarded by requireAdmin().
 * Validates that current time >= deadline before allowing extension.
 * Atomically updates started_at, records in audit_logs, and broadcasts TIMER_EXTENDED.
 */
export async function extendTimerAction(
  lotId: string,
  extensionSeconds: 10 | 20 | 30
): Promise<AuctionActionResult<{ startedAt: string; extensionSeconds: number }>> {
  try {
    if (![10, 20, 30].includes(extensionSeconds)) {
      return { success: false, error: 'Extension duration must be 10, 20, or 30 seconds.' };
    }

    const adminContext = await requireAdmin();
    const adminClient = createAdminClient();

    // 1. Fetch lot
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
        error: `Cannot extend timer. Lot status is '${lot.status}', expected 'in_progress'.`,
      };
    }

    if (!lot.started_at) {
      return { success: false, error: 'Lot has not been started.' };
    }

    // 2. Fetch session and config
    const targetSeasonId = lot.season_id;
    const { data: configRows } = await adminClient
      .from('season_config')
      .select('key, value')
      .eq('season_id', targetSeasonId)
      .in('key', [
        'auction_session_status',
        'auction_first_bid_timer_seconds',
        'auction_subsequent_bid_timer_seconds',
      ]);

    const configMap = new Map((configRows || []).map((r) => [r.key, r.value]));
    const sessionStatus = configMap.get('auction_session_status');
    if (sessionStatus === 'paused' || sessionStatus === 'completed') {
      return {
        success: false,
        error: `Cannot extend timer while auction session is ${sessionStatus}.`,
      };
    }

    const firstBidTimer = parseInt(configMap.get('auction_first_bid_timer_seconds') || '30', 10);
    const subsequentBidTimer = parseInt(
      configMap.get('auction_subsequent_bid_timer_seconds') || '20',
      10
    );

    const timerDuration = lot.highest_bidder_franchise_id ? subsequentBidTimer : firstBidTimer;
    const deadlineMs = new Date(lot.started_at).getTime() + timerDuration * 1000;
    const nowMs = Date.now();

    // 3. Extension calculation:
    // If timer reached zero (TIME UP), reset timer with extensionSeconds remaining.
    // If timer is still actively running, add extensionSeconds to the existing deadline.
    const effectiveDeadlineMs = nowMs >= deadlineMs ? nowMs : deadlineMs;
    const newStartedAtMs = effectiveDeadlineMs + extensionSeconds * 1000 - timerDuration * 1000;
    const newStartedAt = new Date(newStartedAtMs).toISOString();
    const nowIso = new Date(nowMs).toISOString();

    // 4. Concurrency-safe atomic conditional update
    const { data: updatedLot, error: updateErr } = await adminClient
      .from('auction_lots')
      .update({
        started_at: newStartedAt,
        updated_at: nowIso,
      })
      .eq('id', lot.id)
      .eq('status', 'in_progress')
      .eq('started_at', lot.started_at) // Concurrency guard
      .select()
      .maybeSingle();

    if (updateErr || !updatedLot) {
      return {
        success: false,
        error: 'Timer was already modified concurrently by another operator or bid.',
      };
    }

    // 5. Record in audit_logs
    await writeAuditLog({
      seasonId: targetSeasonId,
      actorUserId: adminContext.user.id,
      action: 'TIMER_EXTENDED',
      entityType: 'auction_lot',
      entityId: lot.id,
      reason: `Timer extended by ${extensionSeconds}s`,
      metadata: {
        extensionSeconds,
        previousStartedAt: lot.started_at,
        newStartedAt,
        timerDuration,
      },
    });

    // 6. Broadcast TIMER_EXTENDED
    await broadcastAuctionUpdate(targetSeasonId, 'TIMER_EXTENDED', {
      lotId: lot.id,
      startedAt: newStartedAt,
      durationSeconds: timerDuration,
      remainingSeconds: extensionSeconds,
    });

    revalidatePath('/live');
    revalidatePath('/live/projector');

    return {
      success: true,
      data: {
        startedAt: newStartedAt,
        extensionSeconds,
      },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to extend timer.' };
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
): Promise<
  AuctionActionResult<{
    restoredTo: RestoreToMode;
    activeLot?: AuctionLotWithDetails | null;
    sessionState?: AuctionSessionState;
  }>
> {
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
        reason: `Sale of lot #${lot.draw_number} undone by Super Admin (§12.4). Restored to: ${effectiveRestoreTo}`,
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
    revalidatePath('/franchise/auction');
    revalidatePath('/player/auction');

    await broadcastAuctionUpdate(lot.season_id, 'UNDO_SALE');

    const activeLotWithDetails = await getActiveLot(adminClient, lot.season_id);
    const sessionState = await getAuctionSessionState(adminClient, lot.season_id);

    return {
      success: true,
      data: {
        restoredTo: effectiveRestoreTo,
        activeLot: activeLotWithDetails,
        sessionState,
      },
    };
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
export async function startAuctionAction(
  selectedBuckets?: string[]
): Promise<
  AuctionActionResult<{
    status: 'live';
    activeLotId?: string | null;
    activeLot?: AuctionLotWithDetails | null;
    sessionState?: AuctionSessionState;
  }>
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

    // If selectedBuckets provided, persist them
    if (selectedBuckets && Array.isArray(selectedBuckets) && selectedBuckets.length > 0) {
      const valid = selectedBuckets.filter((b) =>
        (DEFAULT_BUCKET_ORDER as readonly string[]).includes(b as any)
      );
      if (valid.length > 0) {
        const sorted = DEFAULT_BUCKET_ORDER.filter((b) => valid.includes(b));
        await adminClient.from('season_config').upsert(
          {
            season_id: activeSeason.id,
            key: 'auction_active_buckets',
            value: JSON.stringify(sorted),
            value_type: 'json',
            description: 'Active auction buckets currently open for drawing lots',
            updated_at: now,
          },
          { onConflict: 'season_id,key' }
        );
      }
    }

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

    revalidatePath('/admin');
    revalidatePath('/live');
    revalidatePath('/live/projector');
    revalidatePath('/auction');
    revalidatePath('/franchise/auction');
    revalidatePath('/player/auction');
    revalidatePath('/franchise');
    revalidatePath('/player');

    // 4. Check if a lot is ALREADY on the floor (e.g. from Guest Draw called before auction start)
    const { data: existingFloorLot } = await adminClient
      .from('auction_lots')
      .select('id, bucket, draw_number, started_at')
      .eq('season_id', activeSeason.id)
      .eq('status', 'in_progress')
      .maybeSingle();

    let activeLotId: string | null = null;
    let activeLot: AuctionLotWithDetails | null = null;

    if (existingFloorLot) {
      // PRESERVE THE EXISTING PLAYER ON THE FLOOR!
      // Do NOT replace the player, and do NOT auto-advance to a second player.
      // Reset started_at to now so the auction countdown starts freshly.
      await adminClient
        .from('auction_lots')
        .update({
          started_at: now,
          updated_at: now,
        })
        .eq('id', existingFloorLot.id);

      activeLotId = existingFloorLot.id;
      activeLot = await getActiveLot(adminClient, activeSeason.id);
    } else {
      // Automatically bring the first eligible unique-number player to the floor
      const advanceResult = await autoAdvanceToNextLot(
        adminClient,
        activeSeason.id,
        adminContext.user.id
      );
      activeLotId = advanceResult.nextLotId;
      activeLot = advanceResult.nextLot ?? null;
    }

    await broadcastAuctionUpdate(activeSeason.id, 'AUCTION_STARTED', {
      lotId: activeLotId,
      startedAt: now,
      sessionStatus: 'live',
    });

    const sessionState: AuctionSessionState = {
      status: 'live',
      seasonId: activeSeason.id,
      seasonName: activeSeason.name,
      isLive: true,
      isPaused: false,
      isNotStarted: false,
      isCompleted: false,
      startedAt: now,
      activeLotId,
    };

    return {
      success: true,
      data: {
        status: 'live',
        activeLotId,
        activeLot,
        sessionState,
      },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to start auction session.' };
  }
}

/**
 * Starts the next bucket group when the current bucket group is concluded.
 * Locks previously completed buckets in `season_config.auction_completed_buckets`,
 * updates `season_config.auction_active_buckets`, and automatically draws the first
 * eligible player of the new group to the auction floor.
 * Guarded by requireAdmin().
 */
export async function startNextBucketGroupAction(
  selectedBuckets: string[]
): Promise<
  AuctionActionResult<{
    status: 'live';
    activeBuckets: string[];
    completedBuckets: string[];
    activeLotId?: string | null;
    activeLot?: AuctionLotWithDetails | null;
  }>
> {
  try {
    const adminContext = await requireAdmin();
    const activeSeason = adminContext.activeSeason;

    if (!activeSeason) {
      return { success: false, error: 'No active season found to continue auction.' };
    }

    if (!selectedBuckets || selectedBuckets.length === 0) {
      return { success: false, error: 'Please select at least one bucket to continue the auction.' };
    }

    const adminClient = createAdminClient();
    const now = new Date().toISOString();

    // 1. Fetch current active buckets and completed buckets
    const [activeBucketsRes, completedBucketsRes] = await Promise.all([
      adminClient
        .from('season_config')
        .select('value')
        .eq('season_id', activeSeason.id)
        .eq('key', 'auction_active_buckets')
        .maybeSingle(),
      adminClient
        .from('season_config')
        .select('value')
        .eq('season_id', activeSeason.id)
        .eq('key', 'auction_completed_buckets')
        .maybeSingle(),
    ]);

    let previousActive: string[] = [];
    if (activeBucketsRes.data?.value) {
      try {
        const parsed = JSON.parse(activeBucketsRes.data.value);
        if (Array.isArray(parsed)) previousActive = parsed;
      } catch {}
    }

    let existingCompleted: string[] = [];
    if (completedBucketsRes.data?.value) {
      try {
        const parsed = JSON.parse(completedBucketsRes.data.value);
        if (Array.isArray(parsed)) existingCompleted = parsed;
      } catch {}
    }

    // Merge previousActive into completedBuckets, excluding any newly selected buckets
    const newlyCompleted = Array.from(new Set([...existingCompleted, ...previousActive]))
      .filter((b) => !selectedBuckets.includes(b));

    const sortedNewBuckets = selectedBuckets.filter(
      (b, idx, arr) => (DEFAULT_BUCKET_ORDER as readonly string[]).includes(b as any) && arr.indexOf(b) === idx
    );

    // 2. Persist new completed buckets and new active buckets
    await Promise.all([
      adminClient.from('season_config').upsert(
        {
          season_id: activeSeason.id,
          key: 'auction_completed_buckets',
          value: JSON.stringify(newlyCompleted),
          value_type: 'json',
          description: 'Completed auction buckets from previous rounds/groups',
          updated_at: now,
        },
        { onConflict: 'season_id,key' }
      ),
      adminClient.from('season_config').upsert(
        {
          season_id: activeSeason.id,
          key: 'auction_active_buckets',
          value: JSON.stringify(sortedNewBuckets),
          value_type: 'json',
          description: 'Active auction buckets currently open for drawing lots',
          updated_at: now,
        },
        { onConflict: 'season_id,key' }
      ),
    ]);

    // 3. Ensure session status is live
    await adminClient.from('season_config').upsert(
      {
        season_id: activeSeason.id,
        key: 'auction_session_status',
        value: 'live',
        value_type: 'text',
        description: 'Current operational state of the live auction session',
        updated_at: now,
      },
      { onConflict: 'season_id,key' }
    );

    // 4. Automatically advance to the first eligible player in the newly selected bucket group
    const advanceResult = await autoAdvanceToNextLot(
      adminClient,
      activeSeason.id,
      adminContext.user.id
    );

    revalidatePath('/live');
    revalidatePath('/live/projector');
    revalidatePath('/franchise/auction');
    revalidatePath('/player/auction');

    await broadcastAuctionUpdate(activeSeason.id, 'AUCTION_STARTED');

    return {
      success: true,
      data: {
        status: 'live',
        activeBuckets: sortedNewBuckets,
        completedBuckets: newlyCompleted,
        activeLotId: advanceResult.nextLotId,
        activeLot: advanceResult.nextLot ?? null,
      },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to start next bucket group.' };
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
  AuctionActionResult<{
    status: 'live';
    activeLotId?: string | null;
    activeLot?: AuctionLotWithDetails | null;
    sessionState?: AuctionSessionState;
  }>
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

    // 4. Record session reopen audit in audit_logs (valid audit ledger, no FK or CHECK violation)
    await writeAuditLog(
      {
        seasonId: activeSeason.id,
        actorUserId: adminContext.user.id,
        action: 'AUCTION_SESSION_REOPENED',
        entityType: 'auction_session',
        entityId: activeSeason.id,
        reason: 'Auction session reopened by operator (START AUCTION AGAIN)',
        metadata: { restarted_at: now, multi_session: true },
      },
      adminClient
    );

    revalidatePath('/admin');
    revalidatePath('/live');
    revalidatePath('/live/projector');
    revalidatePath('/auction');
    revalidatePath('/franchise/auction');
    revalidatePath('/player/auction');
    revalidatePath('/franchise');
    revalidatePath('/player');

    await broadcastAuctionUpdate(activeSeason.id, 'AUCTION_RESTARTED');

    const advanceResult = await autoAdvanceToNextLot(
      adminClient,
      activeSeason.id,
      adminContext.user.id
    );

    const sessionState: AuctionSessionState = {
      status: 'live',
      seasonId: activeSeason.id,
      seasonName: activeSeason.name,
      isLive: true,
      isPaused: false,
      isNotStarted: false,
      isCompleted: false,
      startedAt: now,
      activeLotId: advanceResult.nextLotId,
    };

    return {
      success: true,
      data: {
        status: 'live',
        activeLotId: advanceResult.nextLotId,
        activeLot: advanceResult.nextLot ?? null,
        sessionState,
      },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to restart auction session.' };
  }
}

/**
 * Pauses the live auction session.
 * Records a PAUSE event if an active lot is in progress.
 * Guarded by requireAdmin().
 */
export async function pauseAuctionAction(
  seasonId?: string,
  clientRemainingSeconds?: number
): Promise<
  AuctionActionResult<{
    status: 'paused';
    remainingSeconds?: number;
    sessionState?: AuctionSessionState;
  }>
> {
  try {
    const adminContext = await requireAdmin();
    const activeSeason = adminContext.activeSeason;

    if (!activeSeason) {
      return { success: false, error: 'No active season found.' };
    }

    const adminClient = createAdminClient();
    const now = new Date().toISOString();

    // 0. Idempotency: if already paused, return success immediately
    const { data: currentConfig } = await adminClient
      .from('season_config')
      .select('value')
      .eq('season_id', activeSeason.id)
      .eq('key', 'auction_session_status')
      .maybeSingle();

    if (currentConfig?.value === 'paused') {
      return { success: true, data: { status: 'paused' } };
    }

    // 1. Fetch active lot and timer configs to calculate remaining seconds
    const [activeLotRes, timerConfigsRes] = await Promise.all([
      adminClient
        .from('auction_lots')
        .select('id, started_at, highest_bidder_franchise_id')
        .eq('season_id', activeSeason.id)
        .eq('status', 'in_progress')
        .maybeSingle(),
      adminClient
        .from('season_config')
        .select('key, value')
        .eq('season_id', activeSeason.id)
        .in('key', ['first_bid_timer_seconds', 'subsequent_bid_timer_seconds']),
    ]);

    const activeLot = activeLotRes.data;
    const timerConfigs = timerConfigsRes.data;

    let firstBidSeconds = 30;
    let subsequentBidSeconds = 20;
    if (timerConfigs) {
      for (const tc of timerConfigs) {
        if (tc.key === 'first_bid_timer_seconds') firstBidSeconds = parseInt(tc.value, 10) || 30;
        if (tc.key === 'subsequent_bid_timer_seconds') subsequentBidSeconds = parseInt(tc.value, 10) || 20;
      }
    }

    const timerDuration = activeLot?.highest_bidder_franchise_id
      ? subsequentBidSeconds
      : firstBidSeconds;

    let remainingSeconds: number = timerDuration;
    if (clientRemainingSeconds !== undefined && Number.isFinite(clientRemainingSeconds)) {
      // Operator saw exact displayed value when clicking pause; validate within bounds
      remainingSeconds = Math.max(0, Math.min(timerDuration, Math.round(clientRemainingSeconds)));
    } else if (activeLot?.started_at) {
      const elapsedMs = Date.now() - new Date(activeLot.started_at).getTime();
      const elapsedSec = Math.max(0, Math.floor(elapsedMs / 1000));
      remainingSeconds = Math.max(0, timerDuration - elapsedSec);
    }

    // 2. Set auction_session_status, auction_paused_at, and auction_lot_paused_remaining_seconds
    const configUpserts = [
      {
        season_id: activeSeason.id,
        key: 'auction_session_status',
        value: 'paused',
        value_type: 'text',
        updated_at: now,
      },
      {
        season_id: activeSeason.id,
        key: 'auction_paused_at',
        value: now,
        value_type: 'text',
        updated_at: now,
      },
    ];

    if (activeLot) {
      configUpserts.push({
        season_id: activeSeason.id,
        key: 'auction_lot_paused_remaining_seconds',
        value: String(remainingSeconds),
        value_type: 'integer',
        updated_at: now,
      });
    }

    const { error: configErr } = await adminClient
      .from('season_config')
      .upsert(configUpserts, { onConflict: 'season_id,key' });

    if (configErr) {
      return {
        success: false,
        error: configErr.message || 'Failed to persist auction pause state.',
      };
    }

    // 3. If a lot is currently in progress, record PAUSE event in auction_events
    if (activeLot) {
      const { error: eventErr } = await adminClient.from('auction_events').insert({
        season_id: activeSeason.id,
        auction_lot_id: activeLot.id,
        event_type: 'PAUSE',
        actor_user_id: adminContext.user.id,
        reason: 'Auction paused by operator',
        payload: {
          paused_at: now,
          remaining_seconds: remainingSeconds,
        },
        created_at: now,
      });

      if (eventErr) {
        return {
          success: false,
          error: eventErr.message || 'Failed to record auction pause event.',
        };
      }
    }

    revalidatePath('/admin/auction');
    revalidatePath('/live');
    revalidatePath('/live/projector');
    revalidatePath('/franchise/auction');
    revalidatePath('/player/auction');

    await broadcastAuctionUpdate(activeSeason.id, 'PAUSE', {
      remainingSeconds,
      sessionStatus: 'paused',
    });

    const sessionState: AuctionSessionState = {
      status: 'paused',
      seasonId: activeSeason.id,
      seasonName: activeSeason.name,
      isLive: true,
      isPaused: true,
      isNotStarted: false,
      isCompleted: false,
      startedAt: null,
      activeLotId: activeLot?.id || null,
      pausedRemainingSeconds: remainingSeconds,
      pausedAt: now,
    };

    return { success: true, data: { status: 'paused', remainingSeconds, sessionState } };
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
  AuctionActionResult<{ status: 'live'; sessionState?: AuctionSessionState }>
> {
  try {
    const adminContext = await requireAdmin();
    const activeSeason = adminContext.activeSeason;

    if (!activeSeason) {
      return { success: false, error: 'No active season found.' };
    }

    const adminClient = createAdminClient();
    const now = new Date().toISOString();

    // 0. Idempotency: if already live, return success immediately
    const { data: currentConfig } = await adminClient
      .from('season_config')
      .select('value')
      .eq('season_id', activeSeason.id)
      .eq('key', 'auction_session_status')
      .maybeSingle();

    if (currentConfig?.value === 'live') {
      return { success: true, data: { status: 'live' } };
    }

    // 1. Fetch active lot and paused config to restore timer
    const [activeLotRes, configRowsRes] = await Promise.all([
      adminClient
        .from('auction_lots')
        .select('id, highest_bidder_franchise_id')
        .eq('season_id', activeSeason.id)
        .eq('status', 'in_progress')
        .maybeSingle(),
      adminClient
        .from('season_config')
        .select('key, value')
        .eq('season_id', activeSeason.id)
        .in('key', [
          'auction_lot_paused_remaining_seconds',
          'first_bid_timer_seconds',
          'subsequent_bid_timer_seconds',
        ]),
    ]);

    const activeLot = activeLotRes.data;
    const configRows = configRowsRes.data;

    let firstBidSeconds = 30;
    let subsequentBidSeconds = 20;
    let pausedRemainingSec: number | null = null;

    if (configRows) {
      for (const cr of configRows) {
        if (cr.key === 'first_bid_timer_seconds') firstBidSeconds = parseInt(cr.value, 10) || 30;
        if (cr.key === 'subsequent_bid_timer_seconds') subsequentBidSeconds = parseInt(cr.value, 10) || 20;
        if (cr.key === 'auction_lot_paused_remaining_seconds' && cr.value) {
          const parsed = parseInt(cr.value, 10);
          if (!isNaN(parsed)) pausedRemainingSec = parsed;
        }
      }
    }

    const timerDuration = activeLot?.highest_bidder_franchise_id
      ? subsequentBidSeconds
      : firstBidSeconds;

    const remainingToRestore = pausedRemainingSec !== null
      ? Math.min(timerDuration, Math.max(1, pausedRemainingSec))
      : timerDuration;

    // Synthetic started_at so that: Date.now() + remainingToRestore === newStartedAt + timerDuration
    // => newStartedAt = Date.now() - (timerDuration - remainingToRestore) * 1000
    const elapsedSeconds = timerDuration - remainingToRestore;
    const restoredStartedAt = new Date(Date.now() - elapsedSeconds * 1000).toISOString();

    // 2. FIRST update auction_lots.started_at = restoredStartedAt if a lot is in progress
    // so no reader ever observes isPaused=false while started_at is still the old pre-pause timestamp.
    if (activeLot) {
      const { error: lotUpdateErr } = await adminClient
        .from('auction_lots')
        .update({ started_at: restoredStartedAt, updated_at: now })
        .eq('id', activeLot.id);

      if (lotUpdateErr) {
        return {
          success: false,
          error: lotUpdateErr.message || 'Failed to restore active lot timer on resume.',
        };
      }
    }

    // 3. Only after auction_lots.started_at is updated, set auction_session_status to 'live'
    // and delete pause keys.
    const { error: statusUpsertErr } = await adminClient
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

    if (statusUpsertErr) {
      return {
        success: false,
        error: statusUpsertErr.message || 'Failed to update auction session status to live.',
      };
    }

    const { error: deletePauseErr } = await adminClient
      .from('season_config')
      .delete()
      .eq('season_id', activeSeason.id)
      .in('key', ['auction_lot_paused_remaining_seconds', 'auction_paused_at']);

    if (deletePauseErr) {
      return {
        success: false,
        error: deletePauseErr.message || 'Failed to clear paused timer configuration.',
      };
    }

    // 4. If a lot is currently in progress, record RESUME event
    if (activeLot) {
      const { error: resumeEventErr } = await adminClient.from('auction_events').insert({
        season_id: activeSeason.id,
        auction_lot_id: activeLot.id,
        event_type: 'RESUME',
        actor_user_id: adminContext.user.id,
        reason: 'Auction resumed by operator',
        payload: {
          resumed_at: now,
          remaining_seconds: remainingToRestore,
        },
        created_at: now,
      });

      if (resumeEventErr) {
        return {
          success: false,
          error: resumeEventErr.message || 'Failed to record auction resume event.',
        };
      }
    }

    revalidatePath('/live');
    revalidatePath('/live/projector');
    revalidatePath('/franchise/auction');
    revalidatePath('/player/auction');

    await broadcastAuctionUpdate(activeSeason.id, 'RESUME', {
      startedAt: activeLot ? restoredStartedAt : null,
      sessionStatus: 'live',
    });

    const sessionState: AuctionSessionState = {
      status: 'live',
      seasonId: activeSeason.id,
      seasonName: activeSeason.name,
      isLive: true,
      isPaused: false,
      isNotStarted: false,
      isCompleted: false,
      startedAt: activeLot ? restoredStartedAt : null,
      activeLotId: activeLot?.id || null,
      pausedRemainingSeconds: null,
      pausedAt: null,
    };

    return {
      success: true,
      data: {
        status: 'live',
        sessionState,
      },
    };
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
): Promise<
  AuctionActionResult<{
    status: 'completed';
    activeLot?: AuctionLotWithDetails | null;
    sessionState?: AuctionSessionState;
  }>
> {
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

    // 5. Authoritatively record session completion in audit_logs
    await writeAuditLog({
      seasonId: activeSeason.id,
      actorUserId: adminContext.user.id,
      action: 'AUCTION_ENDED',
      entityType: 'season',
      entityId: activeSeason.id,
      reason: 'Auction session completed by operator',
      metadata: {
        ended_at: now,
        active_lot_resolved: Boolean(activeLot),
        active_lot_id: activeLot?.id ?? null,
      },
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

    await broadcastAuctionUpdate(activeSeason.id, 'AUCTION_ENDED', {
      sessionStatus: 'completed',
    });

    const sessionState: AuctionSessionState = {
      status: 'completed',
      seasonId: activeSeason.id,
      seasonName: activeSeason.name,
      isLive: false,
      isPaused: false,
      isNotStarted: false,
      isCompleted: true,
      startedAt: null,
      activeLotId: null,
    };

    return {
      success: true,
      data: {
        status: 'completed',
        activeLot: null,
        sessionState,
      },
    };
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

    await broadcastAuctionUpdate(targetSeasonId, 'QUEUE_UPDATED');

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
    revalidatePath('/franchise/auction');
    revalidatePath('/player/auction');

    await broadcastAuctionUpdate(lot.season_id, 'BID_PLACED');

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
      .select('id, draw_number, registration_id, bucket')
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

    await broadcastAuctionUpdate(activeSeason.id, 'ROUND_TWO_STARTED');

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

    await broadcastAuctionUpdate(lot.season_id, 'ALLOTMENT');

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

    await broadcastAuctionUpdate(activeSeason.id, 'BUCKET_RELAXATION');

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

    await broadcastAuctionUpdate(lot.season_id, 'DIRECT_ASSIGNMENT');

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

    await broadcastAuctionUpdate(activeSeason.id, 'SCOUTING');

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
): Promise<
  AuctionActionResult<{
    lotId: string;
    nextLotId?: string | null;
    activeLot?: AuctionLotWithDetails | null;
    sessionState?: AuctionSessionState;
  }>
> {
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
      event_type: 'SKIP',
      actor_user_id: adminContext.user.id,
      reason: reason.trim(),
      created_at: now,
    });

    await writeAuditLog(
      {
        seasonId: lot.season_id,
        actorUserId: adminContext.user.id,
        action: 'SKIP',
        entityType: 'auction_lot',
        entityId: lotId,
        reason: reason.trim(),
        metadata: { draw_number: lot.draw_number, bucket: lot.bucket },
      },
      adminClient
    );

    revalidatePath('/live');
    revalidatePath('/live/projector');
    revalidatePath('/franchise/auction');
    revalidatePath('/player/auction');

    await broadcastAuctionUpdate(lot.season_id, 'SKIP');

    // Concurrency-safe automatic advance to next player
    const advanceResult = await autoAdvanceToNextLot(
      adminClient,
      lot.season_id,
      adminContext.user.id
    );

    const sessionState = await getAuctionSessionState(adminClient, lot.season_id);

    return {
      success: true,
      data: {
        lotId,
        nextLotId: advanceResult.nextLotId,
        activeLot: advanceResult.nextLot ?? null,
        sessionState,
      },
    };
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
      event_type: 'RE_ENTER',
      actor_user_id: adminContext.user.id,
      reason: `Recalled skipped player #${lot.draw_number} back to floor queue at base price ${lot.base_price} credits`,
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
        metadata: { draw_number: lot.draw_number, bucket: lot.bucket },
      },
      adminClient
    );

    revalidatePath('/admin/auction');
    revalidatePath('/live');
    revalidatePath('/live/projector');
    revalidatePath('/franchise/auction');
    revalidatePath('/player/auction');

    await broadcastAuctionUpdate(lot.season_id, 'RE_ENTER');

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
      .select('id, draw_number')
      .eq('season_id', activeSeason.id)
      .eq('status', 'in_progress')
      .limit(1);

    if (existingActive && existingActive.length > 0) {
      return { success: false, error: 'A lot is already in progress on the auction block.' };
    }

    // Determine target bucket sequence
    let bucketsToSearch = activeBucket ? [activeBucket] : [];
    if (bucketsToSearch.length === 0) {
      const { data: bucketConfig } = await adminClient
        .from('season_config')
        .select('value')
        .eq('season_id', activeSeason.id)
        .eq('key', 'auction_active_buckets')
        .maybeSingle();

      if (bucketConfig?.value) {
        try {
          const parsed = JSON.parse(bucketConfig.value);
          if (Array.isArray(parsed) && parsed.length > 0) {
            bucketsToSearch = parsed.filter((b: string) =>
              (DEFAULT_BUCKET_ORDER as readonly string[]).includes(b as any)
            );
          }
        } catch {}
      }

      if (bucketsToSearch.length === 0) {
        bucketsToSearch = [...BUCKET_DRAW_SEQUENCE];
      }
    }

    let candidateLots: any[] = [];
    let selectedBucket = '';

    for (const b of bucketsToSearch) {
      const { data: pendingInBucket } = await adminClient
        .from('auction_lots')
        .select(`
          id,
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
      return {
        success: false,
        error: 'Current bucket group complete. Select remaining buckets to continue.',
      };
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
        drawNumber: chosenLot.draw_number,
        bucket: selectedBucket,
        playerName,
      },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Auto draw failed.' };
  }
}

/**
 * Admin Action to re-auction an unsold player (§13).
 * Directly resets an unsold lot to 'pending' at their ORIGINAL base price
 * (NOT ₹20, preserving original base price without altering Round 2 logic).
 * Appends a 'RE_ENTER' event to auction_events for authoritative audit trail.
 */
export async function reAuctionUnsoldLotAction(
  lotOrRegistrationId: string
): Promise<AuctionActionResult<{ lotId: string; drawNumber: number; basePrice: number }>> {
  try {
    const adminContext = await requireAdmin();
    const adminClient = createAdminClient();

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lotOrRegistrationId);
    if (!isUuid) {
      return { success: false, error: 'Invalid lot or registration ID.' };
    }

    // 1. Fetch targeted lot (supports either lot ID or registration ID)
    const { data: lots, error: fetchErr } = await adminClient
      .from('auction_lots')
      .select(`
        id,
        season_id,
        registration_id,
        draw_number,
        status,
        round,
        base_price,
        player_season_registrations!inner (
          id,
          base_price,
          bucket,
          is_auction_eligible,
          players!inner (
            id,
            full_name,
            is_active
          )
        )
      `)
      .or(`id.eq.${lotOrRegistrationId},registration_id.eq.${lotOrRegistrationId}`)
      .limit(1);

    const lot: any = lots?.[0];
    if (fetchErr || !lot) {
      return { success: false, error: 'Unsold lot not found in auction records.' };
    }

    const reg = Array.isArray(lot.player_season_registrations)
      ? lot.player_season_registrations[0]
      : lot.player_season_registrations;
    const player = Array.isArray(reg?.players) ? reg.players[0] : reg?.players;
    const originalBasePrice = reg?.base_price ?? lot.base_price;

    // 1b. Idempotency: if lot is already pending, return success immediately
    if (lot.status === 'pending') {
      return {
        success: true,
        data: {
          lotId: lot.id,
          drawNumber: lot.draw_number,
          basePrice: originalBasePrice,
        },
      };
    }

    if (lot.status !== 'unsold') {
      return {
        success: false,
        error: `Cannot re-auction lot. Status is '${lot.status}', expected 'unsold'.`,
      };
    }

    if (player?.is_active === false) {
      return {
        success: false,
        error: 'Cannot re-auction player: Player account is currently blocked.',
      };
    }

    // 2. Authoritative original base price from player registration (NOT ₹20)
    const now = new Date().toISOString();

    // 3. Update existing lot to 'pending'
    const { error: updateErr } = await adminClient
      .from('auction_lots')
      .update({
        status: 'pending',
        base_price: originalBasePrice,
        current_price: originalBasePrice,
        highest_bidder_franchise_id: null,
        started_at: null,
        ended_at: null,
        updated_at: now,
      })
      .eq('id', lot.id);

    if (updateErr) {
      return { success: false, error: updateErr.message || 'Failed to update lot status.' };
    }

    // 4. Record RE_ENTER event in auction_events
    await adminClient.from('auction_events').insert({
      season_id: lot.season_id,
      auction_lot_id: lot.id,
      event_type: 'RE_ENTER',
      actor_user_id: adminContext.user.id,
      reason: 'Unsold player re-entered lot queue at original base price by operator',
      payload: {
        registration_id: lot.registration_id,
        draw_number: lot.draw_number,
        base_price: originalBasePrice,
        previous_status: 'unsold',
      },
      created_at: now,
    });

    // 5. Revalidate paths
    revalidatePath('/admin/queue');
    revalidatePath('/admin/players');
    revalidatePath('/admin/auction');
    revalidatePath('/admin');
    revalidatePath('/live');
    revalidatePath('/live/projector');

    await broadcastAuctionUpdate(lot.season_id, 'RE_ENTER');

    return {
      success: true,
      data: {
        lotId: lot.id,
        drawNumber: lot.draw_number,
        basePrice: originalBasePrice,
      },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to re-auction unsold player.' };
  }
}

/**
 * Brings an unsold player down from the active auction board to the Lot Queue.
 *
 * Operational invariants:
 * 1. Admin/Super Admin authorization check (server-enforced).
 * 2. Idempotent: If lot is already 'pending', returns success immediately.
 * 3. Validates lot exists and status === 'unsold'.
 * 4. Preserves player's authoritative original base price from player registration (NOT ₹20 Round 2 reset).
 * 5. Updates auction_lots: status = 'pending', base_price = originalBasePrice, current_price = originalBasePrice, started_at = null, ended_at = null, highest_bidder_franchise_id = null.
 * 6. Preserves existing UNSOLD event in auction_events (zero deletion, zero history rewriting).
 * 7. Does NOT auto-start auction, does NOT auto-call player, does NOT create sale, does NOT alter purse/squad.
 * 8. Revalidates paths: /admin/auction, /admin/queue, /live, /live/projector.
 */
export async function bringDownUnsoldLotAction(
  lotOrRegistrationId: string
): Promise<AuctionActionResult<{ lotId: string; drawNumber: number; basePrice: number; playerName: string }>> {
  try {
    const adminContext = await requireAdmin();
    const adminClient = createAdminClient();

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lotOrRegistrationId);
    if (!isUuid) {
      return { success: false, error: 'Invalid lot or registration ID.' };
    }

    // 1. Fetch targeted lot (supports either lot ID or registration ID)
    const { data: lots, error: fetchErr } = await adminClient
      .from('auction_lots')
      .select(`
        id,
        season_id,
        registration_id,
        draw_number,
        status,
        round,
        base_price,
        player_season_registrations!inner (
          id,
          base_price,
          bucket,
          is_auction_eligible,
          players!inner (
            id,
            full_name,
            is_active
          )
        )
      `)
      .or(`id.eq.${lotOrRegistrationId},registration_id.eq.${lotOrRegistrationId}`)
      .limit(1);

    const lot: any = lots?.[0];
    if (fetchErr || !lot) {
      return { success: false, error: 'Target lot not found in auction records.' };
    }

    const reg = Array.isArray(lot.player_season_registrations)
      ? lot.player_season_registrations[0]
      : lot.player_season_registrations;
    const player = Array.isArray(reg?.players) ? reg.players[0] : reg?.players;
    const playerName = player?.full_name || 'Player';
    const originalBasePrice = reg?.base_price ?? lot.base_price;

    // Idempotency: If already returned to pending queue, return success immediately
    if (lot.status === 'pending') {
      return {
        success: true,
        data: {
          lotId: lot.id,
          drawNumber: lot.draw_number,
          basePrice: originalBasePrice,
          playerName,
        },
      };
    }

    if (lot.status !== 'unsold') {
      return {
        success: false,
        error: `Cannot bring down lot. Status is '${lot.status}', expected 'unsold'.`,
      };
    }

    const now = new Date().toISOString();

    // Update existing lot to 'pending' with original base price
    const { error: updateErr } = await adminClient
      .from('auction_lots')
      .update({
        status: 'pending',
        base_price: originalBasePrice,
        current_price: originalBasePrice,
        highest_bidder_franchise_id: null,
        started_at: null,
        ended_at: null,
        updated_at: now,
      })
      .eq('id', lot.id);

    if (updateErr) {
      return { success: false, error: updateErr.message || 'Failed to update lot status.' };
    }

    revalidatePath('/admin/auction');
    revalidatePath('/admin/queue');
    revalidatePath('/admin/players');
    revalidatePath('/live');
    revalidatePath('/live/projector');

    await broadcastAuctionUpdate(lot.season_id, 'QUEUE_UPDATED');

    return {
      success: true,
      data: {
        lotId: lot.id,
        drawNumber: lot.draw_number,
        basePrice: originalBasePrice,
        playerName,
      },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to bring down unsold lot.' };
  }
}

/**
 * Automatically populates the lot queue for all auction-eligible registered players
 * who are not yet queued in auction_lots for the active season.
 * Ensures approved players are immediately available as 'pending' lots without manual intervention.
 */
export async function autoQueueEligiblePlayers(
  adminClient: any,
  seasonId: string,
  actorUserId?: string
): Promise<{ addedCount: number }> {
  try {
    // 1. Fetch all eligible registrations and existing lots concurrently
    const [regsResult, lotsResult] = await Promise.all([
      adminClient
        .from('player_season_registrations')
        .select(`
          id,
          season_id,
          bucket,
          base_price,
          is_auction_eligible,
          players!inner (
            id,
            full_name,
            is_active
          )
        `)
        .eq('season_id', seasonId)
        .eq('is_auction_eligible', true),
      adminClient
        .from('auction_lots')
        .select('id, registration_id, draw_number')
        .eq('season_id', seasonId),
    ]);

    const eligibleRegs = regsResult.data || [];
    const existingLots = lotsResult.data || [];

    const queuedRegistrationIds = new Set(existingLots.map((l: any) => l.registration_id));

    // Find eligible active players not yet queued
    const unqueuedRegs = eligibleRegs.filter((r: any) => {
      const player = Array.isArray(r.players) ? r.players[0] : r.players;
      return !queuedRegistrationIds.has(r.id) && player?.is_active !== false;
    });

    if (unqueuedRegs.length === 0) {
      return { addedCount: 0 };
    }

    // Determine starting draw_number
    let currentMaxDrawNumber = existingLots.reduce(
      (max: number, l: any) => Math.max(max, l.draw_number ?? 0),
      0
    );

    const now = new Date().toISOString();
    const lotsToInsert = unqueuedRegs.map((r: any) => {
      currentMaxDrawNumber += 1;
      return {
        season_id: seasonId,
        registration_id: r.id,
        bucket: r.bucket,
        draw_number: currentMaxDrawNumber,
        base_price: r.base_price,
        current_price: r.base_price,
        round: 1,
        status: 'pending',
        created_at: now,
        updated_at: now,
      };
    });

    const { data: insertedLots, error: insertErr } = await adminClient
      .from('auction_lots')
      .insert(lotsToInsert)
      .select('id, registration_id, draw_number, bucket, base_price');

    if (insertErr || !insertedLots) {
      console.error('[autoQueueEligiblePlayers] Insert error:', insertErr);
      return { addedCount: 0 };
    }

    // Log LOT_CREATED events
    if (actorUserId) {
      const events = insertedLots.map((lot: any) => ({
        season_id: seasonId,
        auction_lot_id: lot.id,
        event_type: 'LOT_CREATED',
        actor_user_id: actorUserId,
        reason: 'Player auto-queued upon auction eligibility',
        payload: {
          registration_id: lot.registration_id,
          draw_number: lot.draw_number,
          bucket: lot.bucket,
          base_price: lot.base_price,
        },
        created_at: now,
      }));

      await adminClient.from('auction_events').insert(events);
    }

    return { addedCount: insertedLots.length };
  } catch (err: any) {
    console.error('[autoQueueEligiblePlayers] Error:', err);
    return { addedCount: 0 };
  }
}

/**
 * Super Admin Auction Restart & Recovery Action (§12.4).
 * Operational recovery mechanism for correcting auction-recording errors.
 *
 * MODES:
 * 1. 'full': Restores all original auction lots for the active season to the beginning of the draw.
 * 2. 'selective': Restores auction state starting from a specific target lot (draw_number >= target.draw_number).
 *    All lots prior to target remain completely untouched.
 *
 * NON-NEGOTIABLE SAFETY CONSTRAINTS:
 * - Restricted strictly to Super Admin (adminContext.isSuperAdmin === true). Operators are rejected.
 * - ZERO-MUTATION PREFLIGHT: If ANY affected lot has status 'allotted' or 'scouted', execution aborts
 *   immediately with 0 mutations, preserving endgame state.
 * - HISTORICAL IMMUTABILITY: Events in auction_events are NEVER updated or deleted.
 * - Every affected SOLD lot receives an UNDO_SALE event appending to auction_events.
 * - Original draw_number, round, bucket, and lot identity are 100% preserved.
 * - Session remains PAUSED after recovery; Super Admin must explicitly resume and CALL PLAYER.
 * - Centralized audit entry written to audit_logs (AUCTION_RECOVERY_FULL or AUCTION_RECOVERY_SELECTIVE).
 */
export async function adminAuctionRestartRecoveryAction(
  params: AdminAuctionRestartRecoveryParams
): Promise<AuctionActionResult<AuctionRecoveryResult>> {
  try {
    // 1. Authenticate and enforce strict Super Admin authorization
    const adminContext = await requireAdmin();
    if (!adminContext.isSuperAdmin) {
      return {
        success: false,
        error: 'Unauthorized: Only Super Admin has authority to perform auction restart and recovery (§12.4).',
      };
    }

    // 2. Validate input parameters
    const { mode, targetLotId, reason } = params || {};
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return {
        success: false,
        error: 'Administrative reason is required for auction restart and recovery.',
      };
    }

    if (mode !== 'full' && mode !== 'selective') {
      return {
        success: false,
        error: 'Invalid recovery mode. Expected "full" or "selective".',
      };
    }

    if (mode === 'selective' && (!targetLotId || typeof targetLotId !== 'string')) {
      return {
        success: false,
        error: 'Target lot ID is required for selective restart and recovery.',
      };
    }

    // 3. Resolve active season
    const activeSeason = adminContext.activeSeason;
    if (!activeSeason) {
      return { success: false, error: 'No active season found for auction recovery.' };
    }

    const adminClient = createAdminClient();

    // 4. Resolve affected lots
    let affectedLots: any[] = [];
    let targetDrawNumber: number | null = null;
    let targetPlayerName: string | null = null;

    if (mode === 'full') {
      const { data: allLots, error: fetchErr } = await adminClient
        .from('auction_lots')
        .select(`
          id,
          registration_id,
          bucket,
          draw_number,
          round,
          status,
          current_price,
          highest_bidder_franchise_id,
          base_price,
          player_season_registrations (
            players (
              full_name
            )
          )
        `)
        .eq('season_id', activeSeason.id)
        .order('draw_number', { ascending: true });

      if (fetchErr || !allLots || allLots.length === 0) {
        return { success: false, error: 'No auction lots found for this season to recover.' };
      }
      affectedLots = allLots;
    } else {
      // Selective restart: fetch target lot first
      const { data: targetLot, error: targetErr } = await adminClient
        .from('auction_lots')
        .select(`
          id,
          registration_id,
          bucket,
          draw_number,
          round,
          status,
          current_price,
          highest_bidder_franchise_id,
          base_price,
          player_season_registrations (
            players (
              full_name
            )
          )
        `)
        .eq('id', targetLotId)
        .eq('season_id', activeSeason.id)
        .maybeSingle();

      if (targetErr || !targetLot) {
        return { success: false, error: 'Target lot not found in active season.' };
      }

      targetDrawNumber = targetLot.draw_number;
      const reg: any = Array.isArray(targetLot.player_season_registrations)
        ? targetLot.player_season_registrations[0]
        : targetLot.player_season_registrations;
      const player: any = Array.isArray(reg?.players) ? reg.players[0] : reg?.players;
      targetPlayerName = player?.full_name || null;

      // Select all lots with draw_number >= targetDrawNumber
      const { data: scopedLots, error: scopeErr } = await adminClient
        .from('auction_lots')
        .select(`
          id,
          registration_id,
          bucket,
          draw_number,
          round,
          status,
          current_price,
          highest_bidder_franchise_id,
          base_price
        `)
        .eq('season_id', activeSeason.id)
        .gte('draw_number', targetDrawNumber)
        .order('draw_number', { ascending: true });

      if (scopeErr || !scopedLots || scopedLots.length === 0) {
        return { success: false, error: 'No auction lots found in the target recovery range.' };
      }
      affectedLots = scopedLots;
    }

    // 5. CRITICAL ZERO-MUTATION PREFLIGHT SAFETY CHECK
    // If ANY affected lot is 'allotted' or 'scouted', abort immediately with 0 changes.
    const unsafeLot = affectedLots.find(
      (l) => l.status === 'allotted' || l.status === 'scouted'
    );
    if (unsafeLot) {
      return {
        success: false,
        error:
          'Recovery cannot proceed because Round 2 allotment/scouting records are present in the affected range. No changes were made.',
      };
    }

    const now = new Date().toISOString();

    // 6. Freeze/Pause Auction Session (ensures zero concurrent bidding during recovery)
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

    // 7. Append immutable UNDO_SALE events for all affected SOLD lots
    const soldLots = affectedLots.filter((l) => l.status === 'sold');
    if (soldLots.length > 0) {
      const undoEvents = soldLots.map((lot) => ({
        season_id: activeSeason.id,
        auction_lot_id: lot.id,
        event_type: 'UNDO_SALE',
        actor_user_id: adminContext.user.id,
        franchise_id: lot.highest_bidder_franchise_id,
        price: lot.current_price,
        reason: `Auction recovery (${mode}) by Super Admin. Reason: ${reason.trim()}`,
        payload: {
          restored_to: 'return_to_queue',
          recovery_mode: mode,
          target_draw_number: mode === 'selective' ? targetDrawNumber : null,
          refunded_franchise_id: lot.highest_bidder_franchise_id,
          refunded_price: lot.current_price,
          reason: reason.trim(),
        },
        created_at: now,
      }));

      const { error: undoErr } = await adminClient.from('auction_events').insert(undoEvents);
      if (undoErr) {
        console.error('[adminAuctionRestartRecoveryAction] Failed to insert UNDO_SALE events:', undoErr);
        return { success: false, error: 'Failed to record recovery sale reversal events.' };
      }
    }

    // 8. Reset operational lot states to 'pending'
    // Preserves original draw_number, round, bucket, and base_price.
    const nonPendingLots = affectedLots.filter((l) => l.status !== 'pending');
    if (nonPendingLots.length > 0) {
      const resetIds = nonPendingLots.map((l) => l.id);
      const { error: resetErr } = await adminClient
        .from('auction_lots')
        .update({
          status: 'pending',
          current_price: null,
          highest_bidder_franchise_id: null,
          started_at: null,
          ended_at: null,
          updated_at: now,
        })
        .in('id', resetIds);

      if (resetErr) {
        console.error('[adminAuctionRestartRecoveryAction] Failed to reset lot states:', resetErr);
        return { success: false, error: 'Failed to reset operational lots to pending.' };
      }
    }

    // 9. Write centralized audit log entry
    const refundedFranchises = Array.from(
      new Set(soldLots.map((l) => l.highest_bidder_franchise_id).filter(Boolean))
    );

    await writeAuditLog(
      {
        seasonId: activeSeason.id,
        actorUserId: adminContext.user.id,
        action: mode === 'full' ? 'AUCTION_RECOVERY_FULL' : 'AUCTION_RECOVERY_SELECTIVE',
        entityType: 'auction_session',
        entityId: activeSeason.id,
        reason: reason.trim(),
        metadata: {
          restart_type: mode,
          target_lot_id: targetLotId ?? null,
          target_draw_number: mode === 'selective' ? targetDrawNumber : null,
          target_player_name: targetPlayerName ?? null,
          affected_lots_count: affectedLots.length,
          reversed_sold_lots_count: soldLots.length,
          reset_lots_count: nonPendingLots.length,
          refunded_franchises: refundedFranchises,
          timestamp: now,
        },
      },
      adminClient
    );

    // 10. Revalidate server-rendered paths
    revalidatePath('/admin/auction');
    revalidatePath('/admin');
    revalidatePath('/admin/queue');
    revalidatePath('/live');
    revalidatePath('/live/projector');
    revalidatePath('/auction');
    revalidatePath('/franchise/auction');
    revalidatePath('/player/auction');
    revalidatePath('/franchise');
    revalidatePath('/franchise/squad');
    revalidatePath('/player');

    await broadcastAuctionUpdate(activeSeason.id, 'AUCTION_RECOVERY');

    return {
      success: true,
      data: {
        mode,
        targetDrawNumber: mode === 'selective' ? targetDrawNumber : null,
        affectedLotsCount: affectedLots.length,
        reversedSoldLotsCount: soldLots.length,
      },
    };
  } catch (err: any) {
    console.error('[adminAuctionRestartRecoveryAction] Error:', err);
    return { success: false, error: err?.message || 'Failed to execute auction restart and recovery.' };
  }
}


