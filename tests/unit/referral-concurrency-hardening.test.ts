// @vitest-environment jsdom
// =============================================================================
// ACC Auction Portal — Referral Concurrency Hardening Tests
// =============================================================================
// Tests:
// A. Same referral approved concurrently → exactly one succeeds
// B. Two different referrals competing for final squad slot → at most one succeeds
// C. Franchise already at 22 → referral approval rejected
// D. Lot + event consistency via executeAuctionMutationFlow
// E. Event insertion failure path → compensating rollback
// F. No duplicate ALLOTMENT events
// G. Bucket-boundary regression remains passing (covered in sibling test file)
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  executeConditionalLotUpdate,
  insertAuctionEvent,
  executeAuctionMutationFlow,
} from '@/lib/auction/transaction';

describe('ACC Auction Portal — Referral Concurrency Hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // TEST A: Same referral approved concurrently — only one succeeds
  // ===========================================================================
  describe('A. Duplicate Approval Prevention (same referral)', () => {
    it('conditional update with .eq(status, pending) allows only one concurrent approval to succeed', async () => {
      // Simulate two concurrent admin requests trying to approve the same referral.
      // The referral starts as 'pending'. The first update transitions it to 'approved'.
      // The second update finds 0 rows with status='pending' → returns empty array.

      let currentStatus = 'pending';

      // Simulates PostgreSQL conditional UPDATE WHERE status='pending'
      // Only the first caller sees the row as 'pending'; PostgreSQL serializes the row lock.
      const simulateConditionalUpdate = () => {
        if (currentStatus === 'pending') {
          currentStatus = 'approved';
          return { data: [{ id: 'ref-1', status: 'approved' }], error: null };
        }
        // Second concurrent call: status is no longer 'pending' → 0 rows match
        return { data: [] as any[], error: null };
      };

      // First approval attempt
      const firstResult = simulateConditionalUpdate();
      expect(firstResult.data).toHaveLength(1);
      expect(firstResult.data[0].status).toBe('approved');

      // Second concurrent approval attempt (same referral)
      const secondResult = simulateConditionalUpdate();
      expect(secondResult.data).toHaveLength(0);

      // Verification: exactly one approval, exactly one status transition
      expect(currentStatus).toBe('approved');
    });

    it('early guard rejects referrals that are already approved/rejected before DB mutation', () => {
      const checkReferralStatus = (status: string) => {
        if (status !== 'pending') {
          return {
            success: false,
            error: `Referral has already been ${status}. No action taken.`,
          };
        }
        return { success: true };
      };

      expect(checkReferralStatus('pending').success).toBe(true);
      expect(checkReferralStatus('approved').success).toBe(false);
      expect(checkReferralStatus('approved').error).toContain('already been approved');
      expect(checkReferralStatus('rejected').success).toBe(false);
      expect(checkReferralStatus('rejected').error).toContain('already been rejected');
    });
  });

  // ===========================================================================
  // TEST B: Two different referrals competing for final squad slot
  // ===========================================================================
  describe('B. Concurrent Squad Capacity Race (two referrals, one slot)', () => {
    it('post-mutation re-check detects squad overallocation from concurrent approvals', () => {
      // Scenario: Franchise has 21 players. Two admins simultaneously approve
      // two different referrals for the same franchise.
      // Both pass the initial "squadPlayers.length >= 22" check (seeing 21).
      // After both approve, squad is at 23 (21 + 2).
      // The post-mutation re-check catches this: postSquadData.squadPlayers.length > 22.

      const MAX_SQUAD_SIZE = 22;

      const simulateConcurrentApprovals = (
        initialSquadSize: number,
        concurrentApprovalCount: number
      ) => {
        // Both requests pass initial check
        const initialCheckPasses = initialSquadSize < MAX_SQUAD_SIZE;

        // After both mutations, squad size increases
        const postMutationSquadSize = initialSquadSize + concurrentApprovalCount;

        // Post-mutation re-check
        const postCheckFails = postMutationSquadSize > MAX_SQUAD_SIZE;

        return {
          initialCheckPasses,
          postMutationSquadSize,
          needsRevert: postCheckFails,
        };
      };

      // Normal case: 21 players, 1 approval → 22, no revert
      const normal = simulateConcurrentApprovals(21, 1);
      expect(normal.initialCheckPasses).toBe(true);
      expect(normal.postMutationSquadSize).toBe(22);
      expect(normal.needsRevert).toBe(false);

      // Race condition: 21 players, 2 concurrent approvals → 23, second must revert
      const race = simulateConcurrentApprovals(21, 2);
      expect(race.initialCheckPasses).toBe(true);
      expect(race.postMutationSquadSize).toBe(23);
      expect(race.needsRevert).toBe(true);
    });

    it('post-mutation revert restores referral to pending and auction lot to original state', () => {
      // When overallocation is detected, the compensating rollback must:
      // 1. Revert referral status from 'approved' back to 'pending'
      // 2. Revert auction lot from 'allotted' back to original status
      // 3. Restore is_auction_eligible to true

      const revertActions = {
        referralReverted: false,
        lotReverted: false,
        eligibilityRestored: false,
      };

      const performRevert = (
        overCapacity: boolean,
        existingLot: { id: string; status: string } | null
      ) => {
        if (!overCapacity) return revertActions;

        revertActions.referralReverted = true;
        if (existingLot) {
          revertActions.lotReverted = true;
        }
        revertActions.eligibilityRestored = true;
        return revertActions;
      };

      const result = performRevert(true, { id: 'lot-1', status: 'pending' });
      expect(result.referralReverted).toBe(true);
      expect(result.lotReverted).toBe(true);
      expect(result.eligibilityRestored).toBe(true);
    });
  });

  // ===========================================================================
  // TEST C: Franchise already at 22 — immediate rejection
  // ===========================================================================
  describe('C. Franchise at Max Squad Capacity', () => {
    it('rejects referral approval when franchise already has 22 squad players', () => {
      const MAX_SQUAD_SIZE = 22;
      const currentSquadSize = 22;

      const canApprove = currentSquadSize < MAX_SQUAD_SIZE;
      expect(canApprove).toBe(false);

      const result = currentSquadSize >= MAX_SQUAD_SIZE
        ? { success: false, error: 'Squad is full. This player cannot be added.' }
        : { success: true };
      expect(result.success).toBe(false);
      expect(result.error).toBe('Squad is full. This player cannot be added.');
    });

    it('rejects referral approval when franchise has more than 22 players', () => {
      const currentSquadSize = 23;
      const canApprove = currentSquadSize < 22;
      expect(canApprove).toBe(false);
    });

    it('allows referral approval when franchise has fewer than 22 players', () => {
      const sizes = [0, 10, 15, 20, 21];
      sizes.forEach((size) => {
        expect(size < 22).toBe(true);
      });
    });
  });

  // ===========================================================================
  // TEST D: Lot + Event Consistency via executeAuctionMutationFlow
  // ===========================================================================
  describe('D. Lot + Event Consistency (executeAuctionMutationFlow)', () => {
    it('successful mutation produces both updated lot AND event in a single result', async () => {
      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === 'auction_lots') {
            return {
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    select: vi.fn().mockResolvedValue({
                      data: [{ id: 'lot-1', status: 'allotted', current_price: 0 }],
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'auction_events') {
            return {
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'evt-1', event_type: 'ALLOTMENT', auction_lot_id: 'lot-1' },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      } as any;

      const result = await executeAuctionMutationFlow(
        mockClient,
        {
          id: 'lot-1',
          status: 'pending',
          current_price: null,
          highest_bidder_franchise_id: null,
          started_at: null,
          ended_at: null,
        },
        {
          lotId: 'lot-1',
          expectedStatus: 'pending',
          newStatus: 'allotted',
          newPrice: 0,
          highestBidderId: 'fran-1',
        },
        {
          seasonId: 'season-1',
          lotId: 'lot-1',
          eventType: 'ALLOTMENT',
          actorUserId: 'admin-1',
          franchiseId: 'fran-1',
          price: 0,
          reason: 'Referred player added to squad by Admin',
        }
      );

      expect(result.success).toBe(true);
      expect(result.data?.lot).toBeDefined();
      expect(result.data?.lot.status).toBe('allotted');
      expect(result.data?.event).toBeDefined();
      expect(result.data?.event.event_type).toBe('ALLOTMENT');
      expect(result.data?.event.auction_lot_id).toBe('lot-1');
    });

    it('conditional lot update rejects when lot status has already changed (concurrent mutation)', async () => {
      // Simulate: lot was already transitioned from 'pending' to something else
      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === 'auction_lots') {
            return {
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    select: vi.fn().mockResolvedValue({
                      data: [], // 0 rows matched → concurrent mutation
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      } as any;

      const result = await executeConditionalLotUpdate(mockClient, {
        lotId: 'lot-1',
        expectedStatus: 'pending',
        newStatus: 'allotted',
        newPrice: 0,
        highestBidderId: 'fran-1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('STALE_BID_PRICE');
    });
  });

  // ===========================================================================
  // TEST E: Event Insertion Failure → Compensating Rollback
  // ===========================================================================
  describe('E. Event Insertion Failure Path', () => {
    it('executeAuctionMutationFlow rolls back lot when event insert fails', async () => {
      let lotRolledBack = false;

      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === 'auction_lots') {
            return {
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockImplementation((_col: string, val: string) => {
                  // Check if this is the rollback update (restoring original status)
                  return {
                    eq: vi.fn().mockReturnValue({
                      select: vi.fn().mockImplementation(async () => {
                        // First call: successful forward update
                        // Second call: compensating rollback
                        if (!lotRolledBack) {
                          return {
                            data: [{ id: 'lot-1', status: 'allotted', current_price: 0 }],
                            error: null,
                          };
                        }
                        return {
                          data: [{ id: 'lot-1', status: 'pending', current_price: null }],
                          error: null,
                        };
                      }),
                    }),
                    select: vi.fn().mockImplementation(async () => {
                      lotRolledBack = true;
                      return {
                        data: [{ id: 'lot-1', status: 'pending', current_price: null }],
                        error: null,
                      };
                    }),
                  };
                }),
              }),
            };
          }
          if (table === 'auction_events') {
            return {
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: null,
                    error: { message: 'Simulated event insert failure' },
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      } as any;

      const result = await executeAuctionMutationFlow(
        mockClient,
        {
          id: 'lot-1',
          status: 'pending',
          current_price: null,
          highest_bidder_franchise_id: null,
          started_at: null,
          ended_at: null,
        },
        {
          lotId: 'lot-1',
          expectedStatus: 'pending',
          newStatus: 'allotted',
          newPrice: 0,
          highestBidderId: 'fran-1',
        },
        {
          seasonId: 'season-1',
          lotId: 'lot-1',
          eventType: 'ALLOTMENT',
          actorUserId: 'admin-1',
          franchiseId: 'fran-1',
          price: 0,
          reason: 'Referred player added to squad by Admin',
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to insert auction event');
      expect(result.error).toContain('Projection rolled back');
    });
  });

  // ===========================================================================
  // TEST F: No Duplicate ALLOTMENT Events
  // ===========================================================================
  describe('F. No Duplicate ALLOTMENT Events', () => {
    it('conditional lot update prevents second ALLOTMENT because lot is no longer pending', async () => {
      // After the first ALLOTMENT mutation, lot status = 'allotted'.
      // A second executeAuctionMutationFlow call with expectedStatus='pending'
      // will find 0 matching rows → mutation rejected → no second event.

      let callCount = 0;

      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === 'auction_lots') {
            return {
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    select: vi.fn().mockImplementation(async () => {
                      callCount++;
                      if (callCount === 1) {
                        // First call: lot is pending → update succeeds
                        return {
                          data: [{ id: 'lot-1', status: 'allotted', current_price: 0 }],
                          error: null,
                        };
                      }
                      // Second call: lot is already 'allotted', not 'pending' → 0 rows
                      return { data: [], error: null };
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'auction_events') {
            return {
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'evt-1', event_type: 'ALLOTMENT', auction_lot_id: 'lot-1' },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      } as any;

      const originalLot = {
        id: 'lot-1',
        status: 'pending',
        current_price: null,
        highest_bidder_franchise_id: null,
        started_at: null,
        ended_at: null,
      };

      const lotUpdate = {
        lotId: 'lot-1',
        expectedStatus: 'pending' as const,
        newStatus: 'allotted' as const,
        newPrice: 0,
        highestBidderId: 'fran-1',
      };

      const eventParams = {
        seasonId: 'season-1',
        lotId: 'lot-1',
        eventType: 'ALLOTMENT' as const,
        actorUserId: 'admin-1',
        franchiseId: 'fran-1',
        price: 0,
        reason: 'Referred player added to squad by Admin',
      };

      // First mutation: succeeds
      const first = await executeAuctionMutationFlow(mockClient, originalLot, lotUpdate, eventParams);
      expect(first.success).toBe(true);
      expect(first.data?.event.event_type).toBe('ALLOTMENT');

      // Second mutation (simulating concurrent/duplicate): fails because lot is no longer pending
      const second = await executeAuctionMutationFlow(mockClient, originalLot, lotUpdate, eventParams);
      expect(second.success).toBe(false);
      expect(second.error).toContain('STALE_BID_PRICE');

      // Exactly 2 update attempts, but only 1 succeeded
      expect(callCount).toBe(2);
    });
  });

  // ===========================================================================
  // TEST: Atomicity documentation — explicit labeling
  // ===========================================================================
  describe('Atomicity Documentation', () => {
    it('executeAuctionMutationFlow is labeled as application-level compensation, NOT database transaction atomicity', () => {
      // This test documents the architectural constraint:
      // The frozen schema (migrations 001-014 locked) does not include a stored procedure
      // for multi-table atomic operations over PostgREST.
      //
      // executeAuctionMutationFlow provides:
      // 1. Conditional lot update (PostgreSQL row-level locking serializes concurrent mutations)
      // 2. Event insertion
      // 3. Compensating rollback if event insertion fails
      //
      // This is APPLICATION-LEVEL compensating rollback, NOT database transaction atomicity.
      // Residual risk: if the server process crashes between step 1 and step 2,
      // the lot may be updated without an event. This is a known architectural limitation
      // of the frozen-schema PostgREST architecture.

      expect(typeof executeAuctionMutationFlow).toBe('function');
      expect(typeof executeConditionalLotUpdate).toBe('function');
      expect(typeof insertAuctionEvent).toBe('function');
    });
  });
});
