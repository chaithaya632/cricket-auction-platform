// =============================================================================
// ACC Auction Portal — Domain: Auction Event Applicator & Replay
// =============================================================================
// Deterministic reducer for auction events (Spec §23).
// Monotonically increasing sequence values allow reconstructing lot state.
// Gaps in sequence numbers are supported and accepted.
// =============================================================================

export interface ReplayLotState {
  id: string;
  seasonId: string;
  registrationId: string;
  bucket: string;
  basePrice: number;
  status: string;
  currentPrice: number | null;
  highestBidderFranchiseId: string | null;
  startedAt: string | null;
  endedAt: string | null;
}

export interface AuctionEventLogItem {
  id: string;
  season_id: string;
  auction_lot_id: string;
  event_type: string;
  actor_user_id: string;
  franchise_id: string | null;
  price: number | null;
  reason: string | null;
  payload: Record<string, unknown> | null;
  sequence_number: number | string;
  created_at: string;
}

/**
 * Checks if a stream of auction events has monotonically increasing sequence numbers.
 * Gaps in sequence numbers are explicitly permitted.
 */
export function isAuctionEventSequenceMonotonic(
  events: Array<{ sequence_number: number | string }>
): boolean {
  for (let i = 1; i < events.length; i++) {
    const prevSeq = BigInt(events[i - 1].sequence_number);
    const currSeq = BigInt(events[i].sequence_number);
    if (currSeq <= prevSeq) {
      return false;
    }
  }
  return true;
}

/**
 * Applies a single event to a lot state.
 */
export function applyAuctionEvent(
  state: ReplayLotState,
  event: AuctionEventLogItem
): ReplayLotState {
  switch (event.event_type) {
    case 'LOT_CREATED':
      return {
        ...state,
        status: 'pending',
        currentPrice: null,
        highestBidderFranchiseId: null,
        startedAt: null,
        endedAt: null,
      };

    case 'PLAYER_SELECTED':
      return {
        ...state,
        status: 'in_progress',
        startedAt: event.created_at,
        endedAt: null,
      };

    case 'BID_PLACED':
      return {
        ...state,
        status: 'in_progress',
        currentPrice: event.price ?? state.currentPrice,
        highestBidderFranchiseId: event.franchise_id ?? state.highestBidderFranchiseId,
        startedAt: event.created_at,
        endedAt: null,
      };

    case 'SALE':
      return {
        ...state,
        status: 'sold',
        endedAt: event.created_at,
      };

    case 'UNSOLD':
      return {
        ...state,
        status: 'unsold',
        endedAt: event.created_at,
      };

    case 'UNDO_SALE': {
      const payload = (event.payload || {}) as {
        restored_to?: 'resume_bidding' | 'return_to_queue';
        previous_price?: number | null;
        previous_bidder?: string | null;
      };

      if (payload.restored_to === 'return_to_queue') {
        return {
          ...state,
          status: 'pending',
          currentPrice: null,
          highestBidderFranchiseId: null,
          startedAt: null,
          endedAt: null,
        };
      }

      // Default or 'resume_bidding':
      return {
        ...state,
        status: 'in_progress',
        currentPrice: payload.previous_price !== undefined ? payload.previous_price : null,
        highestBidderFranchiseId: payload.previous_bidder !== undefined ? payload.previous_bidder : null,
        startedAt: event.created_at,
        endedAt: null,
      };
    }

    default:
      return state;
  }
}

/**
 * Deterministically reconstructs the state of an auction lot by sorting events
 * by sequence_number ASC and applying each in order.
 */
export function replayAuctionLotEvents(
  initialLot: ReplayLotState,
  events: AuctionEventLogItem[]
): ReplayLotState {
  const sortedEvents = [...events].sort((a, b) => {
    const diff = BigInt(a.sequence_number) - BigInt(b.sequence_number);
    const zero = BigInt(0);
    return diff < zero ? -1 : diff > zero ? 1 : 0;
  });

  return sortedEvents.reduce(
    (currentState, event) => applyAuctionEvent(currentState, event),
    initialLot
  );
}
