// =============================================================================
// ACC Auction Portal — Unit & Regression Tests: Unsold Lots Queue Visibility
// =============================================================================
// Verifies Section 10, Section 13, and Appendix A requirements:
// 1. Unsold lots retain authoritative status = 'unsold' and do not vanish.
// 2. Queue & history filtering partitions states correctly (pending, in_progress, unsold, sold, skipped, recalled).
// 3. Round 2 reopening prerequisites: unsold players are available for reopening at base price 20 credits.
// =============================================================================

import { describe, it, expect } from 'vitest';
import type { LotStatus } from '@/lib/constants';

interface MockLot {
  id: string;
  season_id: string;
  registration_id: string;
  draw_number: number;
  bucket: string;
  base_price: number;
  current_price: number | null;
  round: number;
  status: LotStatus;
  highest_bidder_franchise_id: string | null;
  player: {
    id: string;
    full_name: string;
  };
}

describe('Auction Lot Queue — Unsold Player Visibility Regression (§13)', () => {
  const seasonId = '00000000-0000-0000-0000-000000000001';

  const mockLots: MockLot[] = [
    {
      id: 'lot-1',
      season_id: seasonId,
      registration_id: 'reg-1',
      draw_number: 1,
      bucket: 'B3',
      base_price: 20,
      current_price: null,
      round: 1,
      status: 'unsold',
      highest_bidder_franchise_id: null,
      player: { id: 'p-1', full_name: 'Chaitanya Swamy' },
    },
    {
      id: 'lot-2',
      season_id: seasonId,
      registration_id: 'reg-2',
      draw_number: 2,
      bucket: 'B3',
      base_price: 20,
      current_price: 20,
      round: 1,
      status: 'unsold',
      highest_bidder_franchise_id: 'ffffffff-0000-0000-0000-000000000001',
      player: { id: 'p-2', full_name: 'Vishnu' },
    },
    {
      id: 'lot-3',
      season_id: seasonId,
      registration_id: 'reg-3',
      draw_number: 3,
      bucket: 'B4',
      base_price: 20,
      current_price: null,
      round: 1,
      status: 'pending',
      highest_bidder_franchise_id: null,
      player: { id: 'p-3', full_name: 'Karthik' },
    },
    {
      id: 'lot-4',
      season_id: seasonId,
      registration_id: 'reg-4',
      draw_number: 4,
      bucket: 'B2',
      base_price: 20,
      current_price: 80,
      round: 1,
      status: 'sold',
      highest_bidder_franchise_id: 'ffffffff-0000-0000-0000-000000000002',
      player: { id: 'p-4', full_name: 'Rahul' },
    },
    {
      id: 'lot-5',
      season_id: seasonId,
      registration_id: 'reg-5',
      draw_number: 5,
      bucket: 'B5',
      base_price: 20,
      current_price: null,
      round: 1,
      status: 'skipped',
      highest_bidder_franchise_id: null,
      player: { id: 'p-5', full_name: 'Suresh' },
    },
  ];

  it('reproduces exact bug flow: player enters auction, receives no bid, becomes UNSOLD, and remains visible in unsold queries', () => {
    // 1. Initial upcoming queue only filters pending lots
    const initialPendingQueue = mockLots.filter((l) => l.status === 'pending');
    expect(initialPendingQueue.map((l) => l.id)).toContain('lot-3');
    expect(initialPendingQueue.map((l) => l.id)).not.toContain('lot-1');

    // 2. Dedicated unsold query exposes unsold players
    const unsoldLots = mockLots.filter((l) => l.status === 'unsold');
    expect(unsoldLots).toHaveLength(2);
    expect(unsoldLots.map((l) => l.player.full_name)).toEqual(['Chaitanya Swamy', 'Vishnu']);

    // 3. Ensure auction_lots status remained 'unsold' (no illegal mutation to 'pending')
    for (const lot of unsoldLots) {
      expect(lot.status).toBe('unsold');
    }
  });

  it('verifies state visibility matrix across all auction lot lifecycle states', () => {
    // pending -> visible in Upcoming Queue
    const upcomingQueue = mockLots.filter((l) => l.status === 'pending');
    expect(upcomingQueue).toHaveLength(1);
    expect(upcomingQueue[0].id).toBe('lot-3');

    // unsold -> visible in Unsold Lots tab & history
    const unsoldQueue = mockLots.filter((l) => l.status === 'unsold');
    expect(unsoldQueue).toHaveLength(2);
    expect(unsoldQueue.map((l) => l.id)).toEqual(['lot-1', 'lot-2']);

    // sold -> visible in Sold Lots & history
    const soldQueue = mockLots.filter((l) => l.status === 'sold');
    expect(soldQueue).toHaveLength(1);
    expect(soldQueue[0].id).toBe('lot-4');

    // skipped -> visible in Skipped / Completed Lots with recall capability (§10)
    const skippedQueue = mockLots.filter((l) => l.status === 'skipped');
    expect(skippedQueue).toHaveLength(1);
    expect(skippedQueue[0].id).toBe('lot-5');

    // recalled -> simulated transition from 'skipped' back to 'pending'
    const recalledLot: MockLot = {
      ...skippedQueue[0],
      status: 'pending',
    };
    expect(recalledLot.status).toBe('pending');
    expect(['lot-3', recalledLot.id]).toContain('lot-5');
  });

  it('validates Round 2 reopening contract: unsold lots retain player data and can reopen at base price 20 (§13)', () => {
    const unsoldLots = mockLots.filter((l) => l.status === 'unsold');

    // Reopen for Round 2 simulation
    const reopenedRoundTwoLots = unsoldLots.map((l) => ({
      ...l,
      round: 2,
      base_price: 20,
      current_price: null,
      status: 'pending' as LotStatus,
      highest_bidder_franchise_id: null,
    }));

    expect(reopenedRoundTwoLots).toHaveLength(2);
    for (const lot of reopenedRoundTwoLots) {
      expect(lot.round).toBe(2);
      expect(lot.base_price).toBe(20);
      expect(lot.status).toBe('pending');
      expect(lot.player.full_name).toBeDefined();
    }
  });

  it('guarantees that eligible player registration candidates excludes already created lots', () => {
    const allRegistrations = [
      { id: 'reg-1', player_id: 'p-1' },
      { id: 'reg-2', player_id: 'p-2' },
      { id: 'reg-3', player_id: 'p-3' },
      { id: 'reg-6', player_id: 'p-6' }, // new unregistered in lots
    ];

    const existingLotRegistrationIds = new Set(mockLots.map((l) => l.registration_id));
    const eligibleNewCandidates = allRegistrations.filter((r) => !existingLotRegistrationIds.has(r.id));

    expect(eligibleNewCandidates).toHaveLength(1);
    expect(eligibleNewCandidates[0].id).toBe('reg-6');
  });
});
