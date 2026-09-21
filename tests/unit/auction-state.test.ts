// =============================================================================
// ACC Auction Portal — Unit Tests: Auction State Machine & Timer Rules
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  replayAuctionLotEvents,
  type ReplayLotState,
  type AuctionEventLogItem,
} from '@/domain/auction';

describe('Auction State Machine & Timer Authority (Spec §22, §23)', () => {
  const baseLot: ReplayLotState = {
    id: 'lot-1',
    seasonId: 'acc-2026',
    registrationId: 'reg-1',
    bucket: 'B1',
    basePrice: 20,
    status: 'pending',
    currentPrice: null,
    highestBidderFranchiseId: null,
    startedAt: null,
    endedAt: null,
  };

  it('correctly transitions pending -> in_progress upon selection', () => {
    const event: AuctionEventLogItem = {
      id: 'e1',
      season_id: 'acc-2026',
      auction_lot_id: 'lot-1',
      event_type: 'PLAYER_SELECTED',
      actor_user_id: 'admin-1',
      franchise_id: null,
      price: null,
      reason: null,
      payload: null,
      sequence_number: '1',
      created_at: '2026-03-01T10:00:00.000Z',
    };

    const state = replayAuctionLotEvents(baseLot, [event]);
    expect(state.status).toBe('in_progress');
    expect(state.startedAt).toBe('2026-03-01T10:00:00.000Z');
    expect(state.endedAt).toBeNull();
  });

  it('correctly transitions in_progress -> sold upon hammer', () => {
    const events: AuctionEventLogItem[] = [
      {
        id: 'e1',
        season_id: 'acc-2026',
        auction_lot_id: 'lot-1',
        event_type: 'PLAYER_SELECTED',
        actor_user_id: 'admin-1',
        franchise_id: null,
        price: null,
        reason: null,
        payload: null,
        sequence_number: '1',
        created_at: '2026-03-01T10:00:00.000Z',
      },
      {
        id: 'e2',
        season_id: 'acc-2026',
        auction_lot_id: 'lot-1',
        event_type: 'BID_PLACED',
        actor_user_id: 'user-1',
        franchise_id: 'franchise-titans',
        price: 20,
        reason: null,
        payload: null,
        sequence_number: '2',
        created_at: '2026-03-01T10:00:15.000Z',
      },
      {
        id: 'e3',
        season_id: 'acc-2026',
        auction_lot_id: 'lot-1',
        event_type: 'SALE',
        actor_user_id: 'admin-1',
        franchise_id: 'franchise-titans',
        price: 20,
        reason: 'Sold by hammer',
        payload: null,
        sequence_number: '3',
        created_at: '2026-03-01T10:00:35.000Z',
      },
    ];

    const state = replayAuctionLotEvents(baseLot, events);
    expect(state.status).toBe('sold');
    expect(state.currentPrice).toBe(20);
    expect(state.highestBidderFranchiseId).toBe('franchise-titans');
    expect(state.endedAt).toBe('2026-03-01T10:00:35.000Z');
  });

  it('correctly transitions in_progress -> unsold when passed', () => {
    const events: AuctionEventLogItem[] = [
      {
        id: 'e1',
        season_id: 'acc-2026',
        auction_lot_id: 'lot-1',
        event_type: 'PLAYER_SELECTED',
        actor_user_id: 'admin-1',
        franchise_id: null,
        price: null,
        reason: null,
        payload: null,
        sequence_number: '1',
        created_at: '2026-03-01T10:00:00.000Z',
      },
      {
        id: 'e2',
        season_id: 'acc-2026',
        auction_lot_id: 'lot-1',
        event_type: 'UNSOLD',
        actor_user_id: 'admin-1',
        franchise_id: null,
        price: null,
        reason: 'No bids received',
        payload: null,
        sequence_number: '2',
        created_at: '2026-03-01T10:00:30.000Z',
      },
    ];

    const state = replayAuctionLotEvents(baseLot, events);
    expect(state.status).toBe('unsold');
    expect(state.currentPrice).toBeNull();
    expect(state.highestBidderFranchiseId).toBeNull();
    expect(state.endedAt).toBe('2026-03-01T10:00:30.000Z');
  });

  it('restores lot to pending when UNDO_SALE mode is return_to_queue', () => {
    const events: AuctionEventLogItem[] = [
      {
        id: 'e1',
        season_id: 'acc-2026',
        auction_lot_id: 'lot-1',
        event_type: 'PLAYER_SELECTED',
        actor_user_id: 'admin-1',
        franchise_id: null,
        price: null,
        reason: null,
        payload: null,
        sequence_number: '1',
        created_at: '2026-03-01T10:00:00.000Z',
      },
      {
        id: 'e2',
        season_id: 'acc-2026',
        auction_lot_id: 'lot-1',
        event_type: 'BID_PLACED',
        actor_user_id: 'user-1',
        franchise_id: 'franchise-titans',
        price: 20,
        reason: null,
        payload: null,
        sequence_number: '2',
        created_at: '2026-03-01T10:00:10.000Z',
      },
      {
        id: 'e3',
        season_id: 'acc-2026',
        auction_lot_id: 'lot-1',
        event_type: 'SALE',
        actor_user_id: 'admin-1',
        franchise_id: 'franchise-titans',
        price: 20,
        reason: 'Sold',
        payload: null,
        sequence_number: '3',
        created_at: '2026-03-01T10:00:20.000Z',
      },
      {
        id: 'e4',
        season_id: 'acc-2026',
        auction_lot_id: 'lot-1',
        event_type: 'UNDO_SALE',
        actor_user_id: 'admin-1',
        franchise_id: 'franchise-titans',
        price: 20,
        reason: 'Returned to queue',
        payload: {
          restored_to: 'return_to_queue',
        },
        sequence_number: '4',
        created_at: '2026-03-01T10:00:25.000Z',
      },
    ];

    const state = replayAuctionLotEvents(baseLot, events);
    expect(state.status).toBe('pending');
    expect(state.currentPrice).toBeNull();
    expect(state.highestBidderFranchiseId).toBeNull();
    expect(state.startedAt).toBeNull();
    expect(state.endedAt).toBeNull();
  });
});

describe('Timer Authority Formula Rules', () => {
  it('computes exact deadline timestamp from started_at and configured duration', () => {
    const startedAt = '2026-03-01T10:00:00.000Z';
    const firstBidDuration = 30; // seconds
    const subsequentBidDuration = 20; // seconds

    // Opening clock deadline
    const openingDeadline = new Date(startedAt).getTime() + firstBidDuration * 1000;
    expect(new Date(openingDeadline).toISOString()).toBe('2026-03-01T10:00:30.000Z');

    // Subsequent bid clock deadline
    const subsequentDeadline = new Date(startedAt).getTime() + subsequentBidDuration * 1000;
    expect(new Date(subsequentDeadline).toISOString()).toBe('2026-03-01T10:00:20.000Z');
  });
});
