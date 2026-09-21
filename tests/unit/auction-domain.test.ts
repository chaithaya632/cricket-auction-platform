// =============================================================================
// ACC Auction Portal — Unit Tests: Auction Domain & Bidding Engine
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  getIncrementForPrice,
  calculateNextBid,
  validateBidAmount,
  validateBidEligibility,
  isAuctionEventSequenceMonotonic,
  replayAuctionLotEvents,
  type ReplayLotState,
  type AuctionEventLogItem,
} from '@/domain/auction';

describe('Auction Domain — Bid Increment Rules (Spec §21)', () => {
  it('returns +10 increment for prices under 100', () => {
    expect(getIncrementForPrice(0)).toBe(10);
    expect(getIncrementForPrice(20)).toBe(10);
    expect(getIncrementForPrice(50)).toBe(10);
    expect(getIncrementForPrice(90)).toBe(10);
    expect(getIncrementForPrice(99)).toBe(10);
  });

  it('returns +20 increment for prices 100 to 199', () => {
    expect(getIncrementForPrice(100)).toBe(20);
    expect(getIncrementForPrice(120)).toBe(20);
    expect(getIncrementForPrice(150)).toBe(20);
    expect(getIncrementForPrice(180)).toBe(20);
    expect(getIncrementForPrice(199)).toBe(20);
  });

  it('returns +30 increment for prices 200 and above', () => {
    expect(getIncrementForPrice(200)).toBe(30);
    expect(getIncrementForPrice(230)).toBe(30);
    expect(getIncrementForPrice(250)).toBe(30);
    expect(getIncrementForPrice(500)).toBe(30);
  });

  it('calculates opening bid as base price when no bids have been placed', () => {
    expect(calculateNextBid(null, 20)).toBe(20);
    expect(calculateNextBid(null, 50)).toBe(50);
    expect(calculateNextBid(undefined as any, 30)).toBe(30);
  });

  it('calculates correct ladder progression from base price 20', () => {
    expect(calculateNextBid(20, 20)).toBe(30);
    expect(calculateNextBid(30, 20)).toBe(40);
    expect(calculateNextBid(90, 20)).toBe(100);
    expect(calculateNextBid(100, 20)).toBe(120);
    expect(calculateNextBid(180, 20)).toBe(200);
    expect(calculateNextBid(200, 20)).toBe(230);
    expect(calculateNextBid(230, 20)).toBe(260);
    expect(calculateNextBid(250, 20)).toBe(280);
  });

  it('validates exact next bid and rejects jump bids or underbids', () => {
    // Current price 20, next legal bid is 30
    const valid = validateBidAmount(30, 20, 20);
    expect(valid.valid).toBe(true);
    expect(valid.expectedBid).toBe(30);

    // Jump bid (proposing 50 instead of 30)
    const jump = validateBidAmount(50, 20, 20);
    expect(jump.valid).toBe(false);
    expect(jump.expectedBid).toBe(30);
    expect(jump.reason).toContain('Jump bids are prohibited');

    // Underbid (proposing 20 when current is 20)
    const under = validateBidAmount(20, 20, 20);
    expect(under.valid).toBe(false);
    expect(under.expectedBid).toBe(30);
    expect(under.reason).toContain('below the next required bid');
  });
});

describe('Auction Domain — Bid Eligibility & Max Permissible Bid Integration', () => {
  const sampleLot = {
    id: 'lot-1',
    status: 'in_progress',
    current_price: 20,
    base_price: 20,
    highest_bidder_franchise_id: 'franchise-A',
    bucket: 'B1',
  };

  const sampleFranchise = {
    id: 'franchise-B',
    remainingPurse: 600,
    squadCount: 5,
    maxSquadSize: 22,
    auctionPurchasesSoFar: 5,
    minAuctionPurchases: 15,
    minBasePrice: 20,
    mandatoryBucketDeficits: [
      { bucket: 'B1', minRequired: 2, acquiredCount: 1 },
      { bucket: 'B2', minRequired: 2, acquiredCount: 1 },
      { bucket: 'B3', minRequired: 2, acquiredCount: 1 },
      { bucket: 'B4', minRequired: 2, acquiredCount: 1 },
      { bucket: 'B5', minRequired: 2, acquiredCount: 1 },
    ],
  };

  it('approves eligible bid from different franchise with sufficient purse', () => {
    const res = validateBidEligibility({
      lot: sampleLot,
      franchise: sampleFranchise,
      proposedBid: 30, // next legal bid after 20
    });

    expect(res.eligible).toBe(true);
    expect(res.expectedBid).toBe(30);
  });

  it('rejects bidding when lot is not in_progress', () => {
    const res = validateBidEligibility({
      lot: { ...sampleLot, status: 'pending' },
      franchise: sampleFranchise,
      proposedBid: 30,
    });

    expect(res.eligible).toBe(false);
    expect(res.reason).toContain('expected \'in_progress\'');
  });

  it('rejects self-bidding (franchise already holds highest bid)', () => {
    const res = validateBidEligibility({
      lot: sampleLot,
      franchise: { ...sampleFranchise, id: 'franchise-A' }, // same as highest_bidder
      proposedBid: 30,
    });

    expect(res.eligible).toBe(false);
    expect(res.reason).toContain('already holds the highest bid');
  });

  it('rejects bidding when franchise squad is full', () => {
    const res = validateBidEligibility({
      lot: sampleLot,
      franchise: { ...sampleFranchise, squadCount: 22, maxSquadSize: 22 },
      proposedBid: 30,
    });

    expect(res.eligible).toBe(false);
    expect(res.reason).toContain('squad is full');
  });

  it('rejects bid that exceeds max permissible bid formula', () => {
    // If franchise has only ₹200 left, and must reserve for remaining slots
    // G = 15 - 5 = 10, D = 5, maxConstraint = 10, reserveSlots = 9, reservedPurse = 180
    // maxBid = 200 - 180 = 20
    // A bid of 30 exceeds maxBid of 20!
    const constrainedFranchise = {
      ...sampleFranchise,
      remainingPurse: 200,
    };

    const res = validateBidEligibility({
      lot: sampleLot,
      franchise: constrainedFranchise,
      proposedBid: 30,
    });

    expect(res.eligible).toBe(false);
    expect(res.maxPermissibleBid).toBe(20);
    expect(res.reason).toContain('exceeds your maximum permissible bid');
  });
});

describe('Auction Domain — Event Applicator & Monotonicity', () => {
  it('identifies monotonic sequences including acceptable gaps', () => {
    // Gapless
    expect(
      isAuctionEventSequenceMonotonic([
        { sequence_number: '1' },
        { sequence_number: '2' },
        { sequence_number: '3' },
      ])
    ).toBe(true);

    // Gaps allowed (e.g. from aborted transactions)
    expect(
      isAuctionEventSequenceMonotonic([
        { sequence_number: '1' },
        { sequence_number: '4' },
        { sequence_number: '17' },
      ])
    ).toBe(true);

    // Duplicate sequence numbers are NOT allowed
    expect(
      isAuctionEventSequenceMonotonic([
        { sequence_number: '1' },
        { sequence_number: '4' },
        { sequence_number: '4' },
      ])
    ).toBe(false);

    // Decreasing sequence numbers are NOT allowed
    expect(
      isAuctionEventSequenceMonotonic([
        { sequence_number: '10' },
        { sequence_number: '8' },
      ])
    ).toBe(false);
  });

  it('reconstructs lot state across full lifecycle including UNDO_SALE', () => {
    const initialLot: ReplayLotState = {
      id: 'lot-1',
      seasonId: 'season-1',
      registrationId: 'reg-1',
      bucket: 'B1',
      basePrice: 20,
      status: 'pending',
      currentPrice: null,
      highestBidderFranchiseId: null,
      startedAt: null,
      endedAt: null,
    };

    const events: AuctionEventLogItem[] = [
      {
        id: 'e1',
        season_id: 'season-1',
        auction_lot_id: 'lot-1',
        event_type: 'PLAYER_SELECTED',
        actor_user_id: 'user-admin',
        franchise_id: null,
        price: null,
        reason: null,
        payload: null,
        sequence_number: '1',
        created_at: '2026-03-01T10:00:00Z',
      },
      {
        id: 'e2',
        season_id: 'season-1',
        auction_lot_id: 'lot-1',
        event_type: 'BID_PLACED',
        actor_user_id: 'user-f1',
        franchise_id: 'franchise-1',
        price: 20,
        reason: null,
        payload: null,
        sequence_number: '3', // Notice gap (2 missing)
        created_at: '2026-03-01T10:00:10Z',
      },
      {
        id: 'e3',
        season_id: 'season-1',
        auction_lot_id: 'lot-1',
        event_type: 'BID_PLACED',
        actor_user_id: 'user-f2',
        franchise_id: 'franchise-2',
        price: 30,
        reason: null,
        payload: null,
        sequence_number: '5',
        created_at: '2026-03-01T10:00:20Z',
      },
      {
        id: 'e4',
        season_id: 'season-1',
        auction_lot_id: 'lot-1',
        event_type: 'SALE',
        actor_user_id: 'user-admin',
        franchise_id: 'franchise-2',
        price: 30,
        reason: 'Hammer',
        payload: null,
        sequence_number: '6',
        created_at: '2026-03-01T10:00:30Z',
      },
    ];

    const soldState = replayAuctionLotEvents(initialLot, events);
    expect(soldState.status).toBe('sold');
    expect(soldState.currentPrice).toBe(30);
    expect(soldState.highestBidderFranchiseId).toBe('franchise-2');

    // Now append UNDO_SALE (resume_bidding)
    const undoEvent: AuctionEventLogItem = {
      id: 'e5',
      season_id: 'season-1',
      auction_lot_id: 'lot-1',
      event_type: 'UNDO_SALE',
      actor_user_id: 'user-admin',
      franchise_id: 'franchise-2',
      price: 30,
      reason: 'Disputed sale',
      payload: {
        restored_to: 'resume_bidding',
        previous_price: 20,
        previous_bidder: 'franchise-1',
      },
      sequence_number: '8',
      created_at: '2026-03-01T10:00:40Z',
    };

    const undoneState = replayAuctionLotEvents(initialLot, [...events, undoEvent]);
    expect(undoneState.status).toBe('in_progress');
    expect(undoneState.currentPrice).toBe(20);
    expect(undoneState.highestBidderFranchiseId).toBe('franchise-1');
    expect(undoneState.endedAt).toBeNull();
  });
});
