import { describe, it, expect } from 'vitest';
import { calculateMaxPermissibleBid } from '@/domain/franchises/max-bid';

describe('Authoritative Max Permissible Bid Formula (Spec §20)', () => {
  // Helper to create mandatory bucket deficits
  function createMandatoryBuckets(acquiredPerBucket: Record<string, number>) {
    return ['B1', 'B2', 'B3', 'B4', 'B5'].map((b) => ({
      bucket: b,
      minRequired: 2,
      acquiredCount: acquiredPerBucket[b] || 0,
    }));
  }

  // ---------------------------------------------------------------------------
  // 1. Acceptance Test Cases from ACC Rules Specification (docs/rules/auction-rules.md)
  // ---------------------------------------------------------------------------
  describe('Official Specification Acceptance Test Cases', () => {
    it('Case 1 (Opening Auction): Purse 1000, 0 purchases, 0 of 5 buckets met -> Max Bid: 720', () => {
      // G = 15 - 0 = 15
      // D = 5 * 2 = 10
      // max(G, D) = 15
      // reserve_slots = 14
      // reserved_purse = 14 * 20 = 280
      // max_bid = 1000 - 280 = 720
      const result = calculateMaxPermissibleBid({
        remainingPurse: 1000,
        auctionPurchasesSoFar: 0,
        minAuctionPurchases: 15,
        minBasePrice: 20,
        mandatoryBucketDeficits: createMandatoryBuckets({
          B1: 0,
          B2: 0,
          B3: 0,
          B4: 0,
          B5: 0,
        }),
      });

      expect(result.gDeficit).toBe(15);
      expect(result.dDeficit).toBe(10);
      expect(result.limitingConstraint).toBe('total_purchases');
      expect(result.reserveSlots).toBe(14);
      expect(result.reservedPurse).toBe(280);
      expect(result.maxBid).toBe(720);
    });

    it('Case 2 (Near Completion): Purse 1000, 14 purchases, all buckets met -> Max Bid: 1000', () => {
      // G = 15 - 14 = 1
      // D = 0
      // max(1, 0) = 1
      // reserve_slots = max(0, 1 - 1) = 0
      // max_bid = 1000 - 0 = 1000
      const result = calculateMaxPermissibleBid({
        remainingPurse: 1000,
        auctionPurchasesSoFar: 14,
        minAuctionPurchases: 15,
        minBasePrice: 20,
        mandatoryBucketDeficits: createMandatoryBuckets({
          B1: 2,
          B2: 2,
          B3: 2,
          B4: 2,
          B5: 2,
        }),
      });

      expect(result.gDeficit).toBe(1);
      expect(result.dDeficit).toBe(0);
      expect(result.reserveSlots).toBe(0);
      expect(result.reservedPurse).toBe(0);
      expect(result.maxBid).toBe(1000);
    });

    it('Case 3 (Bucket Deficit Dominates): Purse 340, 11 purchases, 5 remaining in buckets -> Max Bid: 260', () => {
      // G = 15 - 11 = 4
      // D = 5 (e.g. 1 in each of 5 buckets: 5 remaining needed)
      // max(G, D) = max(4, 5) = 5
      // reserve_slots = 5 - 1 = 4
      // reserved_purse = 4 * 20 = 80
      // max_bid = 340 - 80 = 260
      const result = calculateMaxPermissibleBid({
        remainingPurse: 340,
        auctionPurchasesSoFar: 11,
        minAuctionPurchases: 15,
        minBasePrice: 20,
        mandatoryBucketDeficits: createMandatoryBuckets({
          B1: 1, // deficit 1
          B2: 1, // deficit 1
          B3: 1, // deficit 1
          B4: 1, // deficit 1
          B5: 1, // deficit 1 -> total D = 5
        }),
      });

      expect(result.gDeficit).toBe(4);
      expect(result.dDeficit).toBe(5);
      expect(result.limitingConstraint).toBe('bucket_requirements');
      expect(result.reserveSlots).toBe(4);
      expect(result.reservedPurse).toBe(80);
      expect(result.maxBid).toBe(260);
    });

    it('Case 4 (Purchases Deficit Dominates): Purse 200, 13 purchases, all buckets met -> Max Bid: 180', () => {
      // G = 15 - 13 = 2
      // D = 0
      // max(2, 0) = 2
      // reserve_slots = 2 - 1 = 1
      // reserved_purse = 1 * 20 = 20
      // max_bid = 200 - 20 = 180
      const result = calculateMaxPermissibleBid({
        remainingPurse: 200,
        auctionPurchasesSoFar: 13,
        minAuctionPurchases: 15,
        minBasePrice: 20,
        mandatoryBucketDeficits: createMandatoryBuckets({
          B1: 2,
          B2: 2,
          B3: 2,
          B4: 2,
          B5: 2,
        }),
      });

      expect(result.gDeficit).toBe(2);
      expect(result.dDeficit).toBe(0);
      expect(result.limitingConstraint).toBe('total_purchases');
      expect(result.reserveSlots).toBe(1);
      expect(result.reservedPurse).toBe(20);
      expect(result.maxBid).toBe(180);
    });

    it('Case 5 (Exact Reserve Limit): Purse 20, 14 purchases, all buckets met -> Max Bid: 20', () => {
      // G = 1, D = 0, reserve_slots = 0
      // max_bid = 20
      const result = calculateMaxPermissibleBid({
        remainingPurse: 20,
        auctionPurchasesSoFar: 14,
        minAuctionPurchases: 15,
        minBasePrice: 20,
        mandatoryBucketDeficits: createMandatoryBuckets({
          B1: 2,
          B2: 2,
          B3: 2,
          B4: 2,
          B5: 2,
        }),
      });

      expect(result.gDeficit).toBe(1);
      expect(result.reserveSlots).toBe(0);
      expect(result.reservedPurse).toBe(0);
      expect(result.maxBid).toBe(20);
    });

    it('Case 6 (Squad Quota Met): Purse 600, 15 purchases, all buckets met -> Max Bid: 600', () => {
      // G = 0, D = 0, max(G, D) = 0
      // reserve_slots = 0
      // max_bid = 600
      const result = calculateMaxPermissibleBid({
        remainingPurse: 600,
        auctionPurchasesSoFar: 15,
        minAuctionPurchases: 15,
        minBasePrice: 20,
        mandatoryBucketDeficits: createMandatoryBuckets({
          B1: 2,
          B2: 2,
          B3: 2,
          B4: 2,
          B5: 2,
        }),
      });

      expect(result.gDeficit).toBe(0);
      expect(result.dDeficit).toBe(0);
      expect(result.limitingConstraint).toBe('none');
      expect(result.reserveSlots).toBe(0);
      expect(result.reservedPurse).toBe(0);
      expect(result.maxBid).toBe(600);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Edge Cases Required by User Review
  // ---------------------------------------------------------------------------
  describe('Formula Edge Cases & Boundary Conditions', () => {
    it('handles G and D being equal', () => {
      // G = 15 - 12 = 3
      // D = 3 (e.g. B1 has 1, B2 has 1, B3 has 1, B4 has 2, B5 has 2 -> deficits: 1, 1, 1 -> D = 3)
      // max(3, 3) = 3
      // reserve_slots = 3 - 1 = 2
      // reserved_purse = 2 * 20 = 40
      // max_bid = 500 - 40 = 460
      const result = calculateMaxPermissibleBid({
        remainingPurse: 500,
        auctionPurchasesSoFar: 12,
        minAuctionPurchases: 15,
        minBasePrice: 20,
        mandatoryBucketDeficits: createMandatoryBuckets({
          B1: 1,
          B2: 1,
          B3: 1,
          B4: 2,
          B5: 2,
        }),
      });

      expect(result.gDeficit).toBe(3);
      expect(result.dDeficit).toBe(3);
      expect(result.limitingConstraint).toBe('equal');
      expect(result.reserveSlots).toBe(2);
      expect(result.reservedPurse).toBe(40);
      expect(result.maxBid).toBe(460);
    });

    it('clamps maxBid to 0 when purse is already below the required reserve', () => {
      // Remaining purse = 50
      // G = 15 - 10 = 5, D = 6 -> max(5, 6) = 6
      // reserve_slots = 5 -> reserved_purse = 100
      // remainingPurse (50) - reservedPurse (100) = -50 -> clamped to 0
      const result = calculateMaxPermissibleBid({
        remainingPurse: 50,
        auctionPurchasesSoFar: 10,
        minAuctionPurchases: 15,
        minBasePrice: 20,
        mandatoryBucketDeficits: createMandatoryBuckets({
          B1: 0,
          B2: 1,
          B3: 1,
          B4: 2,
          B5: 0,
        }), // D = 2 + 1 + 1 + 0 + 2 = 6
      });

      expect(result.reserveSlots).toBe(5);
      expect(result.reservedPurse).toBe(100);
      expect(result.maxBid).toBe(0);
    });

    it('ignores non-mandatory buckets like PG from contributing to deficit D', () => {
      // PG has minRequired: 0 -> deficit is 0
      const result = calculateMaxPermissibleBid({
        remainingPurse: 400,
        auctionPurchasesSoFar: 14,
        minAuctionPurchases: 15,
        minBasePrice: 20,
        mandatoryBucketDeficits: [
          ...createMandatoryBuckets({ B1: 2, B2: 2, B3: 2, B4: 2, B5: 2 }),
          { bucket: 'PG', minRequired: 0, acquiredCount: 0 },
        ],
      });

      expect(result.dDeficit).toBe(0);
      expect(result.gDeficit).toBe(1);
      expect(result.reserveSlots).toBe(0);
      expect(result.maxBid).toBe(400);
    });
  });
});
