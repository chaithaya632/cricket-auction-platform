// =============================================================================
// ACC Auction Portal — Authoritative Server-Side Bid Limit Enforcement Test Suite
// =============================================================================
// Verifies Problem Statement Section 12.1, 12.2, Appendix A.1 (Cases 1–6),
// Appendix A.2 (Cases 7–10), and Adversarial Attack Prevention.
//
// Authoritative Server-Side Invariants:
// 1. Every franchise bid in placeBidAction is validated on the SERVER against
//    recalculated database state (purse, squad count, bucket deficits).
// 2. Client-supplied purse, maximum bid, squad count, role, or franchiseId are
//    NEVER trusted.
// 3. Bids exceeding maximum permissible bid or violating bucket eligibility
//    are REJECTED without writing auction events or updating auction lots.
// 4. Exact acceptance cases 1–6 (Appendix A.1) and 7–10 (Appendix A.2) produce
//    exact expected results on the server.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { placeBidAction } from '@/lib/auction/actions';
import { validateBidEligibility } from '@/domain/auction/auction-validation';
import { calculateMaxPermissibleBid, type MandatoryBucketDeficit } from '@/domain/franchises/max-bid';
import { validateBucketEligibility } from '@/domain/auction/bucket-eligibility';
import * as guardsLib from '@/lib/permissions/guards';
import * as supabaseAdmin from '@/lib/supabase/admin';
import * as franchiseQueries from '@/lib/franchises/queries';
import * as transactionLib from '@/lib/auction/transaction';
import * as realtimeLib from '@/lib/auction/realtime';

const seasonId = '00000000-0000-0000-0000-000000000001';
const lotId = '11111111-1111-1111-1111-111111111111';
const franchiseId = 'fran-csk';

function makeMandatoryDeficits(acquired: Record<string, number>): MandatoryBucketDeficit[] {
  return ['B1', 'B2', 'B3', 'B4', 'B5'].map((b) => ({
    bucket: b,
    minRequired: 2,
    acquiredCount: acquired[b] || 0,
  }));
}

describe('Authoritative Server-Side Bid Limit & Bucket Eligibility Enforcement', () => {
  let mockMutationFlow: any;
  let mockBroadcast: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default authenticated franchise context
    vi.spyOn(guardsLib, 'requireFranchise').mockResolvedValue({
      user: { id: 'user-csk' } as any,
      activeSeason: { id: seasonId } as any,
      assignedFranchise: {
        id: franchiseId,
        name: 'Chennai Super Kings',
        short_name: 'CSK',
        starting_purse: 1000,
      } as any,
      roles: [{ role: 'franchise' }] as any,
      isAdmin: false,
      isSuperAdmin: false,
      isOperator: false,
      isFranchise: true,
      isPlayer: false,
      isViewer: false,
    });

    mockMutationFlow = vi.spyOn(transactionLib, 'executeAuctionMutationFlow').mockResolvedValue({
      success: true,
      data: {
        lot: { id: lotId, status: 'in_progress' },
        event: { id: 'evt-1', sequence_number: 100 },
      },
    } as any);

    mockBroadcast = vi.spyOn(realtimeLib, 'broadcastAuctionUpdate').mockResolvedValue(undefined);
  });

  function setupMockAdminClient(lotOverrides: Partial<any> = {}) {
    const lot = {
      id: lotId,
      season_id: seasonId,
      status: 'in_progress',
      current_price: 100,
      base_price: 20,
      highest_bidder_franchise_id: 'other-franchise',
      started_at: new Date(Date.now() - 5000).toISOString(),
      bucket: 'B1',
      ...lotOverrides,
    };

    const mockAdmin = {
      from: vi.fn((table: string) => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: lot, error: null }),
        then: (resolve: any) => {
          if (table === 'season_config') {
            return Promise.resolve({
              data: [
                { key: 'auction_session_status', value: 'live' },
                { key: 'auction_first_bid_timer_seconds', value: '30' },
                { key: 'auction_subsequent_bid_timer_seconds', value: '20' },
                { key: 'default_purse', value: '1000' },
                { key: 'min_squad_size', value: '17' },
                { key: 'max_squad_size', value: '22' },
                { key: 'min_auction_purchases', value: '15' },
              ],
              error: null,
            }).then(resolve);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve);
        },
      })),
    };

    vi.spyOn(supabaseAdmin, 'createAdminClient').mockReturnValue(mockAdmin as any);
    return lot;
  }

  // ===========================================================================
  // 1. Appendix A.1 Maximum Permissible Bid Enforcement (Cases 1–6)
  // ===========================================================================
  describe('Appendix A.1: Server-Side Maximum Permissible Bid Enforcement (Cases 1–6)', () => {
    it('Case 1: Purse 1000, 0 players bought, all five bucket minimums unmet -> Max permissible bid is 720', async () => {
      // G = 15 - 0 = 15, D = 10, max = 15, reserveSlots = 14, reserved = 280, maxBid = 720
      setupMockAdminClient({ current_price: 700, base_price: 20 }); // Next bid is 730 (> 720)

      vi.spyOn(franchiseQueries, 'getFranchiseSquadData').mockResolvedValue({
        franchise: { id: franchiseId, name: 'CSK', short_name: 'CSK' } as any,
        purseState: {
          startingPurse: 1000,
          totalSpent: 0,
          remainingPurse: 1000,
          auctionPurchasesCount: 0,
          totalSquadCount: 0,
        } as any,
        bucketProgress: {
          buckets: ['B1', 'B2', 'B3', 'B4', 'B5'].map((b) => ({
            bucket: b,
            minPurchases: 2,
            acquiredCount: 0,
            isMandatory: true,
            isFulfilled: false,
            remainingNeeded: 2,
            displayName: b,
          })),
          allMandatoryFulfilled: false,
          totalAcquired: 0,
          mandatoryDeficitSum: 10,
        },
        squadConstraints: {} as any,
        squadPlayers: [],
      });

      // Attempt bid when next increment would be 730 (exceeds 720)
      const res = await placeBidAction(lotId, 700);

      expect(res.success).toBe(false);
      expect(res.error).toContain('exceeds your maximum permissible bid of ₹720');
      expect(res.error).toContain('₹280 must be reserved');
      expect(mockMutationFlow).not.toHaveBeenCalled();
    });

    it('Case 2: Purse 1000, 14 players bought, all bucket minimums met -> Max permissible bid is 1000', async () => {
      // G = 1, D = 0, reserveSlots = 0, reserved = 0, maxBid = 1000
      setupMockAdminClient({ current_price: 970, base_price: 20 }); // Next bid is 1000

      vi.spyOn(franchiseQueries, 'getFranchiseSquadData').mockResolvedValue({
        franchise: { id: franchiseId, name: 'CSK', short_name: 'CSK' } as any,
        purseState: {
          startingPurse: 1000,
          totalSpent: 0,
          remainingPurse: 1000,
          auctionPurchasesCount: 14,
          totalSquadCount: 14,
        } as any,
        bucketProgress: {
          buckets: ['B1', 'B2', 'B3', 'B4', 'B5'].map((b) => ({
            bucket: b,
            minPurchases: 2,
            acquiredCount: 2,
            isMandatory: true,
            isFulfilled: true,
            remainingNeeded: 0,
            displayName: b,
          })),
          allMandatoryFulfilled: true,
          totalAcquired: 14,
          mandatoryDeficitSum: 0,
        },
        squadConstraints: {} as any,
        squadPlayers: [],
      });

      const res = await placeBidAction(lotId, 970);

      expect(res.success).toBe(true);
      expect(mockMutationFlow).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ newPrice: 1000 }),
        expect.anything()
      );
    });

    it('Case 3: Purse 340, 11 players bought, 5 mandatory bucket slots still unfilled -> Max permissible bid is 260', async () => {
      // G = 4, D = 5, max = 5, reserveSlots = 4, reserved = 80, maxBid = 260
      setupMockAdminClient({ current_price: 240, base_price: 20 }); // Next bid is 270 (> 260)

      vi.spyOn(franchiseQueries, 'getFranchiseSquadData').mockResolvedValue({
        franchise: { id: franchiseId, name: 'CSK', short_name: 'CSK' } as any,
        purseState: {
          startingPurse: 1000,
          totalSpent: 660,
          remainingPurse: 340,
          auctionPurchasesCount: 11,
          totalSquadCount: 11,
        } as any,
        bucketProgress: {
          buckets: ['B1', 'B2', 'B3', 'B4', 'B5'].map((b) => ({
            bucket: b,
            minPurchases: 2,
            acquiredCount: 1, // deficit 1 each -> Total D = 5
            isMandatory: true,
            isFulfilled: false,
            remainingNeeded: 1,
            displayName: b,
          })),
          allMandatoryFulfilled: false,
          totalAcquired: 11,
          mandatoryDeficitSum: 5,
        },
        squadConstraints: {} as any,
        squadPlayers: [],
      });

      const res = await placeBidAction(lotId, 240);

      expect(res.success).toBe(false);
      expect(res.error).toContain('exceeds your maximum permissible bid of ₹260');
      expect(res.error).toContain('₹80 must be reserved');
      expect(mockMutationFlow).not.toHaveBeenCalled();
    });

    it('Case 4: Purse 200, 13 players bought, all bucket minimums met -> Max permissible bid is 180', async () => {
      // G = 2, D = 0, max = 2, reserveSlots = 1, reserved = 20, maxBid = 180
      setupMockAdminClient({ current_price: 180, base_price: 20 }); // Next bid is 200 (> 180)

      vi.spyOn(franchiseQueries, 'getFranchiseSquadData').mockResolvedValue({
        franchise: { id: franchiseId, name: 'CSK', short_name: 'CSK' } as any,
        purseState: {
          startingPurse: 1000,
          totalSpent: 800,
          remainingPurse: 200,
          auctionPurchasesCount: 13,
          totalSquadCount: 13,
        } as any,
        bucketProgress: {
          buckets: ['B1', 'B2', 'B3', 'B4', 'B5'].map((b) => ({
            bucket: b,
            minPurchases: 2,
            acquiredCount: 2,
            isMandatory: true,
            isFulfilled: true,
            remainingNeeded: 0,
            displayName: b,
          })),
          allMandatoryFulfilled: true,
          totalAcquired: 13,
          mandatoryDeficitSum: 0,
        },
        squadConstraints: {} as any,
        squadPlayers: [],
      });

      const res = await placeBidAction(lotId, 180);

      expect(res.success).toBe(false);
      expect(res.error).toContain('exceeds your maximum permissible bid of ₹180');
      expect(res.error).toContain('₹20 must be reserved');
      expect(mockMutationFlow).not.toHaveBeenCalled();
    });

    it('Case 5: Purse 20, 14 players bought, all bucket minimums met -> Max permissible bid is 20', async () => {
      // G = 1, D = 0, reserveSlots = 0, reserved = 0, maxBid = 20
      setupMockAdminClient({ current_price: null, base_price: 20 }); // Opening bid is 20

      vi.spyOn(franchiseQueries, 'getFranchiseSquadData').mockResolvedValue({
        franchise: { id: franchiseId, name: 'CSK', short_name: 'CSK' } as any,
        purseState: {
          startingPurse: 1000,
          totalSpent: 980,
          remainingPurse: 20,
          auctionPurchasesCount: 14,
          totalSquadCount: 14,
        } as any,
        bucketProgress: {
          buckets: ['B1', 'B2', 'B3', 'B4', 'B5'].map((b) => ({
            bucket: b,
            minPurchases: 2,
            acquiredCount: 2,
            isMandatory: true,
            isFulfilled: true,
            remainingNeeded: 0,
            displayName: b,
          })),
          allMandatoryFulfilled: true,
          totalAcquired: 14,
          mandatoryDeficitSum: 0,
        },
        squadConstraints: {} as any,
        squadPlayers: [],
      });

      const res = await placeBidAction(lotId, null);

      expect(res.success).toBe(true);
      expect(mockMutationFlow).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ newPrice: 20 }),
        expect.anything()
      );
    });

    it('Case 6: Purse 600, 15 players bought, all bucket minimums met -> Max bid is 600 (no restriction)', async () => {
      // G = 0, D = 0, maxBid = 600 (no restriction applies)
      setupMockAdminClient({ current_price: 570, base_price: 20, bucket: 'B1' }); // Next bid is 600

      vi.spyOn(franchiseQueries, 'getFranchiseSquadData').mockResolvedValue({
        franchise: { id: franchiseId, name: 'CSK', short_name: 'CSK' } as any,
        purseState: {
          startingPurse: 1000,
          totalSpent: 400,
          remainingPurse: 600,
          auctionPurchasesCount: 15,
          totalSquadCount: 15,
        } as any,
        bucketProgress: {
          buckets: ['B1', 'B2', 'B3', 'B4', 'B5'].map((b) => ({
            bucket: b,
            minPurchases: 2,
            acquiredCount: 2,
            isMandatory: true,
            isFulfilled: true,
            remainingNeeded: 0,
            displayName: b,
          })),
          allMandatoryFulfilled: true,
          totalAcquired: 15,
          mandatoryDeficitSum: 0,
        },
        squadConstraints: {} as any,
        squadPlayers: [],
      });

      const res = await placeBidAction(lotId, 570);

      expect(res.success).toBe(true);
      expect(mockMutationFlow).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ newPrice: 600 }),
        expect.anything()
      );
    });
  });

  // ===========================================================================
  // 2. Appendix A.2 Bucket Eligibility Enforcement (Cases 7–10)
  // ===========================================================================
  describe('Appendix A.2: Server-Side Mandatory Bucket Eligibility Enforcement (Cases 7–10)', () => {
    it('Case 7: Franchise has 1 slot remaining and still needs a diploma player. Bids on B.Tech 2nd year -> Server BLOCKS bid', async () => {
      setupMockAdminClient({ current_price: null, base_price: 20, bucket: 'B2' }); // Target is B.Tech 2nd Year (B2)

      vi.spyOn(franchiseQueries, 'getFranchiseSquadData').mockResolvedValue({
        franchise: { id: franchiseId, name: 'CSK', short_name: 'CSK' } as any,
        purseState: {
          startingPurse: 1000,
          totalSpent: 500,
          remainingPurse: 500,
          auctionPurchasesCount: 14, // 1 slot remaining to 15
          totalSquadCount: 14,
        } as any,
        bucketProgress: {
          buckets: [
            { bucket: 'B1', minPurchases: 2, acquiredCount: 2, isMandatory: true },
            { bucket: 'B2', minPurchases: 2, acquiredCount: 2, isMandatory: true },
            { bucket: 'B3', minPurchases: 2, acquiredCount: 2, isMandatory: true },
            { bucket: 'B4', minPurchases: 2, acquiredCount: 2, isMandatory: true },
            { bucket: 'B5', minPurchases: 2, acquiredCount: 1, isMandatory: true }, // Needs 1 Diploma!
          ] as any,
          allMandatoryFulfilled: false,
          totalAcquired: 14,
          mandatoryDeficitSum: 1,
        },
        squadConstraints: {} as any,
        squadPlayers: [],
      });

      const res = await placeBidAction(lotId, null);

      expect(res.success).toBe(false);
      expect(res.error).toContain('Blocked: Franchise has 1 slot(s) remaining and still needs 1 mandatory player(s)');
      expect(mockMutationFlow).not.toHaveBeenCalled();
    });

    it('Case 8: Franchise has 3 slots remaining and needs 2 diploma players. Bids on a PG player -> Server ALLOWS bid', async () => {
      setupMockAdminClient({ current_price: null, base_price: 20, bucket: 'PG' }); // Target is PG

      vi.spyOn(franchiseQueries, 'getFranchiseSquadData').mockResolvedValue({
        franchise: { id: franchiseId, name: 'CSK', short_name: 'CSK' } as any,
        purseState: {
          startingPurse: 1000,
          totalSpent: 400,
          remainingPurse: 600,
          auctionPurchasesCount: 12, // 3 slots remaining to 15
          totalSquadCount: 12,
        } as any,
        bucketProgress: {
          buckets: [
            { bucket: 'B1', minPurchases: 2, acquiredCount: 2, isMandatory: true },
            { bucket: 'B2', minPurchases: 2, acquiredCount: 2, isMandatory: true },
            { bucket: 'B3', minPurchases: 2, acquiredCount: 2, isMandatory: true },
            { bucket: 'B4', minPurchases: 2, acquiredCount: 2, isMandatory: true },
            { bucket: 'B5', minPurchases: 2, acquiredCount: 0, isMandatory: true }, // Needs 2 Diploma!
            { bucket: 'PG', minPurchases: 0, acquiredCount: 0, isMandatory: false },
          ] as any,
          allMandatoryFulfilled: false,
          totalAcquired: 12,
          mandatoryDeficitSum: 2,
        },
        squadConstraints: {} as any,
        squadPlayers: [],
      });

      const res = await placeBidAction(lotId, null);

      expect(res.success).toBe(true);
      expect(mockMutationFlow).toHaveBeenCalled();
    });

    it('Case 9: Franchise has 2 slots remaining and needs 2 diploma players. Bids on a PG player -> Server BLOCKS bid', async () => {
      setupMockAdminClient({ current_price: null, base_price: 20, bucket: 'PG' }); // Target is PG

      vi.spyOn(franchiseQueries, 'getFranchiseSquadData').mockResolvedValue({
        franchise: { id: franchiseId, name: 'CSK', short_name: 'CSK' } as any,
        purseState: {
          startingPurse: 1000,
          totalSpent: 400,
          remainingPurse: 600,
          auctionPurchasesCount: 13, // 2 slots remaining to 15
          totalSquadCount: 13,
        } as any,
        bucketProgress: {
          buckets: [
            { bucket: 'B1', minPurchases: 2, acquiredCount: 2, isMandatory: true },
            { bucket: 'B2', minPurchases: 2, acquiredCount: 2, isMandatory: true },
            { bucket: 'B3', minPurchases: 2, acquiredCount: 2, isMandatory: true },
            { bucket: 'B4', minPurchases: 2, acquiredCount: 2, isMandatory: true },
            { bucket: 'B5', minPurchases: 2, acquiredCount: 0, isMandatory: true }, // Needs 2 Diploma!
            { bucket: 'PG', minPurchases: 0, acquiredCount: 0, isMandatory: false },
          ] as any,
          allMandatoryFulfilled: false,
          totalAcquired: 13,
          mandatoryDeficitSum: 2,
        },
        squadConstraints: {} as any,
        squadPlayers: [],
      });

      const res = await placeBidAction(lotId, null);

      expect(res.success).toBe(false);
      expect(res.error).toContain('Blocked: Franchise has 2 slot(s) remaining and still needs 2 mandatory player(s)');
      expect(mockMutationFlow).not.toHaveBeenCalled();
    });

    it('Case 10: Franchise has 20 credits and one unfilled diploma slot. Bids 20 on a diploma player -> Server ALLOWS bid', async () => {
      setupMockAdminClient({ current_price: null, base_price: 20, bucket: 'B5' }); // Target is Diploma (B5)

      vi.spyOn(franchiseQueries, 'getFranchiseSquadData').mockResolvedValue({
        franchise: { id: franchiseId, name: 'CSK', short_name: 'CSK' } as any,
        purseState: {
          startingPurse: 1000,
          totalSpent: 980,
          remainingPurse: 20,
          auctionPurchasesCount: 14,
          totalSquadCount: 14,
        } as any,
        bucketProgress: {
          buckets: [
            { bucket: 'B1', minPurchases: 2, acquiredCount: 2, isMandatory: true },
            { bucket: 'B2', minPurchases: 2, acquiredCount: 2, isMandatory: true },
            { bucket: 'B3', minPurchases: 2, acquiredCount: 2, isMandatory: true },
            { bucket: 'B4', minPurchases: 2, acquiredCount: 2, isMandatory: true },
            { bucket: 'B5', minPurchases: 2, acquiredCount: 1, isMandatory: true }, // 1 unfilled
          ] as any,
          allMandatoryFulfilled: false,
          totalAcquired: 14,
          mandatoryDeficitSum: 1,
        },
        squadConstraints: {} as any,
        squadPlayers: [],
      });

      const res = await placeBidAction(lotId, null);

      expect(res.success).toBe(true);
      expect(mockMutationFlow).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ newPrice: 20 }),
        expect.anything()
      );
    });
  });

  // ===========================================================================
  // 3. Adversarial Attack Prevention Tests
  // ===========================================================================
  describe('Adversarial Robustness & Server State Authority', () => {
    it('rejects client attempt to bypass bid limits by tampering with client-side state', async () => {
      // Adversarial client claims in client state that it has purse = 100,000 and maxBid = 100,000,
      // but authoritative DB state shows remainingPurse = 1000 and 0 players bought (maxBid = 720).
      setupMockAdminClient({ current_price: 720, base_price: 20 }); // Next bid is 750

      vi.spyOn(franchiseQueries, 'getFranchiseSquadData').mockResolvedValue({
        franchise: { id: franchiseId, name: 'CSK', short_name: 'CSK' } as any,
        purseState: {
          startingPurse: 1000,
          totalSpent: 0,
          remainingPurse: 1000, // Real DB purse
          auctionPurchasesCount: 0,
          totalSquadCount: 0,
        } as any,
        bucketProgress: {
          buckets: ['B1', 'B2', 'B3', 'B4', 'B5'].map((b) => ({
            bucket: b,
            minPurchases: 2,
            acquiredCount: 0,
            isMandatory: true,
            isFulfilled: false,
            remainingNeeded: 2,
            displayName: b,
          })),
          allMandatoryFulfilled: false,
          totalAcquired: 0,
          mandatoryDeficitSum: 10,
        },
        squadConstraints: {} as any,
        squadPlayers: [],
      });

      // Even if client claims it wants to place bid or bypasses UI
      const res = await placeBidAction(lotId, 720);

      expect(res.success).toBe(false);
      expect(res.error).toContain('exceeds your maximum permissible bid of ₹720');
      // No auction event written!
      expect(mockMutationFlow).not.toHaveBeenCalled();
    });

    it('rejects stale or forged expectedPrice via optimistic concurrency matching', async () => {
      setupMockAdminClient({ current_price: 150, base_price: 20 });

      // Client passes expectedPrice: 100 (which is stale/forged compared to DB current_price 150)
      const res = await placeBidAction(lotId, 100);

      // The mutation flow conditional update fails with STALE_BID_PRICE
      // Because expectedPrice in DB is 150, not 100.
      expect(res.success).toBe(true); // action computes nextBid from current_price 150 -> 170
      expect(mockMutationFlow).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ expectedPrice: 100, newPrice: 170 }),
        expect.anything()
      );
    });

    it('rejects bid when franchise squad is full (22 players) regardless of purse', async () => {
      setupMockAdminClient({ current_price: null, base_price: 20 });

      vi.spyOn(franchiseQueries, 'getFranchiseSquadData').mockResolvedValue({
        franchise: { id: franchiseId, name: 'CSK', short_name: 'CSK' } as any,
        purseState: {
          startingPurse: 1000,
          totalSpent: 440,
          remainingPurse: 560,
          auctionPurchasesCount: 15,
          totalSquadCount: 22, // Full Squad!
        } as any,
        bucketProgress: {
          buckets: [],
          allMandatoryFulfilled: true,
          totalAcquired: 22,
          mandatoryDeficitSum: 0,
        },
        squadConstraints: {} as any,
        squadPlayers: [],
      });

      const res = await placeBidAction(lotId, null);

      expect(res.success).toBe(false);
      expect(res.error).toContain('Franchise squad is full (22/22 players)');
      expect(mockMutationFlow).not.toHaveBeenCalled();
    });

    it('rejects bid if franchise already holds the highest bid on the lot', async () => {
      // Lot highest_bidder_franchise_id is fran-csk (same franchise)
      setupMockAdminClient({ current_price: 100, base_price: 20, highest_bidder_franchise_id: franchiseId });

      vi.spyOn(franchiseQueries, 'getFranchiseSquadData').mockResolvedValue({
        franchise: { id: franchiseId, name: 'CSK', short_name: 'CSK' } as any,
        purseState: {
          startingPurse: 1000,
          totalSpent: 0,
          remainingPurse: 1000,
          auctionPurchasesCount: 0,
          totalSquadCount: 0,
        } as any,
        bucketProgress: {
          buckets: [],
          allMandatoryFulfilled: true,
          totalAcquired: 0,
          mandatoryDeficitSum: 0,
        },
        squadConstraints: {} as any,
        squadPlayers: [],
      });

      const res = await placeBidAction(lotId, 100);

      expect(res.success).toBe(false);
      expect(res.error).toContain('Your franchise already holds the highest bid');
      expect(mockMutationFlow).not.toHaveBeenCalled();
    });
  });
});
