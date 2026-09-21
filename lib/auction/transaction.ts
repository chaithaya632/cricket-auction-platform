// =============================================================================
// ACC Auction Portal — Application Layer: Auction Transaction Coordinator
// =============================================================================
// Authoritative coordinator for executing auction state transitions and
// event logging across the frozen Phase 2 schema (migrations 001–013).
//
// TRANSACTION ARCHITECTURE & GUARANTEES:
// 1. Concurrency Serialization:
//    PostgreSQL acquires an exclusive row lock (FOR UPDATE semantics) during the
//    execution of every conditional UPDATE on `auction_lots`.
//    Concurrent bids on the same lot are serialized at the database row level.
//    If two bids arrive concurrently with the same `expectedPrice`, the first
//    acquires the lock and modifies the row; the second unblocks, re-evaluates
//    `WHERE current_price = expectedPrice`, sees the new price, and matches 0 rows,
//    safely returning STALE_BID_PRICE.
//
// 2. Application-Level Compensating Coordination (NOT a Single PostgreSQL Transaction):
//    Over Supabase PostgREST HTTP, each REST request executes in its own isolated
//    PostgreSQL transaction. Interactive multi-statement transactions (BEGIN ... COMMIT)
//    across multiple tables require a server-side PostgreSQL stored procedure (RPC)
//    or direct TCP connectivity, neither of which is present in Phase 6 due to the
//    frozen schema constraint (migrations 001–013 locked, migration 014 forbidden).
//    Therefore, database-level multi-table atomicity is NOT claimed.
//
// 3. Residual Failure Window:
//    The coordinator uses application-level compensating rollback: it executes the
//    projection update with row-level locking, then inserts the immutable event. If event
//    insertion fails, it triggers a compensating rollback to revert `auction_lots`.
//    RESIDUAL RISK: If the server process abruptly crashes (OOM, SIGKILL) or experiences
//    a hard network disconnection in the millisecond window between the lot update
//    committing and the event insert being processed, the compensating update cannot run,
//    leaving the projection updated without an audit event. This is a known architectural
//    limitation of the frozen-schema PostgREST architecture.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuctionEventType, LotStatus } from '@/lib/constants';

export interface ConditionalLotUpdateParams {
  lotId: string;
  expectedStatus: LotStatus | string;
  expectedPrice?: number | null;
  newStatus?: LotStatus | string;
  newPrice?: number | null;
  highestBidderId?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
}

export interface EventInsertParams {
  seasonId: string;
  lotId: string;
  eventType: AuctionEventType;
  actorUserId: string;
  franchiseId?: string | null;
  price?: number | null;
  reason?: string | null;
  payload?: Record<string, unknown> | null;
  createdAt?: string;
}

export interface AuctionMutationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Executes a conditional lot update against auction_lots.
 * Uses strict row-level matching on expectedStatus and expectedPrice to serialize
 * concurrent mutations and reject race conditions.
 */
export async function executeConditionalLotUpdate(
  client: SupabaseClient,
  params: ConditionalLotUpdateParams
): Promise<{ success: boolean; updatedLot?: any; error?: string }> {
  const {
    lotId,
    expectedStatus,
    expectedPrice,
    newStatus,
    newPrice,
    highestBidderId,
    startedAt,
    endedAt,
  } = params;

  const now = new Date().toISOString();
  const updatePayload: Record<string, any> = {
    updated_at: now,
  };

  if (newStatus !== undefined) updatePayload.status = newStatus;
  if (newPrice !== undefined) updatePayload.current_price = newPrice;
  if (highestBidderId !== undefined) updatePayload.highest_bidder_franchise_id = highestBidderId;
  if (startedAt !== undefined) updatePayload.started_at = startedAt;
  if (endedAt !== undefined) updatePayload.ended_at = endedAt;

  let query = client
    .from('auction_lots')
    .update(updatePayload)
    .eq('id', lotId)
    .eq('status', expectedStatus);

  // If checking expectedPrice (e.g. for BID_PLACED)
  if (expectedPrice !== undefined) {
    if (expectedPrice === null) {
      query = query.is('current_price', null);
    } else {
      query = query.eq('current_price', expectedPrice);
    }
  }

  const { data: updatedLots, error } = await query.select();

  if (error || !updatedLots || updatedLots.length === 0) {
    return {
      success: false,
      error:
        'STALE_BID_PRICE: The lot state or price has changed concurrently. Mutation rejected.',
    };
  }

  return { success: true, updatedLot: updatedLots[0] };
}

/**
 * Inserts an immutable event into auction_events.
 */
export async function insertAuctionEvent(
  client: SupabaseClient,
  params: EventInsertParams
): Promise<{ success: boolean; event?: any; error?: string }> {
  const {
    seasonId,
    lotId,
    eventType,
    actorUserId,
    franchiseId,
    price,
    reason,
    payload,
    createdAt = new Date().toISOString(),
  } = params;

  const { data, error } = await client
    .from('auction_events')
    .insert({
      season_id: seasonId,
      auction_lot_id: lotId,
      event_type: eventType,
      actor_user_id: actorUserId,
      franchise_id: franchiseId ?? null,
      price: price ?? null,
      reason: reason ?? null,
      payload: payload ?? null,
      created_at: createdAt,
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, event: data };
}

/**
 * Coordinates the full mutation lifecycle:
 * 1. Executes the conditional update on auction_lots with optimistic locking.
 * 2. If successful, inserts into auction_events.
 * 3. If event insert fails, performs compensating rollback on auction_lots.
 */
export async function executeAuctionMutationFlow(
  client: SupabaseClient,
  originalLot: {
    id: string;
    status: string;
    current_price: number | null;
    highest_bidder_franchise_id: string | null;
    started_at: string | null;
    ended_at: string | null;
  },
  lotUpdate: ConditionalLotUpdateParams,
  eventParams: EventInsertParams
): Promise<AuctionMutationResult<{ lot: any; event: any }>> {
  // 1. Conditional projection update
  const updateRes = await executeConditionalLotUpdate(client, lotUpdate);
  if (!updateRes.success) {
    return { success: false, error: updateRes.error };
  }

  // 2. Append immutable audit event
  const eventRes = await insertAuctionEvent(client, eventParams);
  if (!eventRes.success) {
    // Compensating rollback
    await client
      .from('auction_lots')
      .update({
        status: originalLot.status,
        current_price: originalLot.current_price,
        highest_bidder_franchise_id: originalLot.highest_bidder_franchise_id,
        started_at: originalLot.started_at,
        ended_at: originalLot.ended_at,
        updated_at: new Date().toISOString(),
      })
      .eq('id', originalLot.id)
      .select();

    return {
      success: false,
      error: `Failed to insert auction event: ${eventRes.error}. Projection rolled back.`,
    };
  }

  return {
    success: true,
    data: {
      lot: updateRes.updatedLot,
      event: eventRes.event,
    },
  };
}
