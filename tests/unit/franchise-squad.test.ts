import { describe, it, expect } from 'vitest';
import {
  calculatePurseState,
  calculateBucketProgress,
  evaluateSquadConstraints,
  type AcquiredLotSummary,
  type BucketRuleSummary,
} from '@/domain/franchises';

describe('Franchise Squad Domain — Acquisition Semantics & Purse State', () => {
  const defaultBucketRules: BucketRuleSummary[] = [
    { bucket: 'B1', minPurchases: 2, isMandatory: true },
    { bucket: 'B2', minPurchases: 2, isMandatory: true },
    { bucket: 'B3', minPurchases: 2, isMandatory: true },
    { bucket: 'B4', minPurchases: 2, isMandatory: true },
    { bucket: 'B5', minPurchases: 2, isMandatory: true },
    { bucket: 'PG', minPurchases: 0, isMandatory: false },
  ];

  it('correctly calculates purse state with 0 acquisitions', () => {
    const state = calculatePurseState({
      startingPurse: 1000,
      acquiredLots: [],
      bucketRules: defaultBucketRules,
    });

    expect(state.startingPurse).toBe(1000);
    expect(state.totalSpent).toBe(0);
    expect(state.remainingPurse).toBe(1000);
    expect(state.auctionPurchasesCount).toBe(0);
    expect(state.allotmentCount).toBe(0);
    expect(state.scoutingCount).toBe(0);
    expect(state.totalSquadCount).toBe(0);
    expect(state.maxBidResult.maxBid).toBe(720);
  });

  it('distinguishes SOLD, ALLOTTED, and SCOUTED semantics', () => {
    // 1 sold player (price 100) -> counts as auction purchase toward G
    // 1 allotted player (price 20) -> consumes purse, satisfies bucket, NOT an auction purchase
    // 1 scouted player (price 20) -> consumes purse, satisfies bucket, NOT an auction purchase
    const acquiredLots: AcquiredLotSummary[] = [
      {
        lotId: 'l1',
        registrationId: 'r1',
        bucket: 'B1',
        status: 'sold',
        price: 100,
      },
      {
        lotId: 'l2',
        registrationId: 'r2',
        bucket: 'B2',
        status: 'allotted',
        price: 20,
      },
      {
        lotId: 'l3',
        registrationId: 'r3',
        bucket: 'B3',
        status: 'scouted',
        price: 20,
      },
    ];

    const state = calculatePurseState({
      startingPurse: 1000,
      acquiredLots,
      bucketRules: defaultBucketRules,
    });

    expect(state.totalSpent).toBe(140); // 100 + 20 + 20
    expect(state.remainingPurse).toBe(860); // 1000 - 140
    expect(state.auctionPurchasesCount).toBe(1); // Only 1 'sold'
    expect(state.allotmentCount).toBe(1);
    expect(state.scoutingCount).toBe(1);
    expect(state.totalSquadCount).toBe(3);

    // G = 15 - 1 = 14
    // D: B1 has 1 (needed 1), B2 has 1 (needed 1), B3 has 1 (needed 1), B4 has 0 (needed 2), B5 has 0 (needed 2) -> D = 7
    // max(14, 7) = 14 -> reserve_slots = 13 -> reserved = 13 * 20 = 260
    // max_bid = 860 - 260 = 600
    expect(state.maxBidResult.gDeficit).toBe(14);
    expect(state.maxBidResult.dDeficit).toBe(7);
    expect(state.maxBidResult.reserveSlots).toBe(13);
    expect(state.maxBidResult.maxBid).toBe(600);
  });
});

describe('Franchise Squad Domain — Bucket Progress Tracking', () => {
  const bucketRules = [
    { bucket: 'B1', displayName: 'B.Tech Year 1', minPurchases: 2, isMandatory: true },
    { bucket: 'B2', displayName: 'B.Tech Year 2', minPurchases: 2, isMandatory: true },
    { bucket: 'B3', displayName: 'B.Tech Year 3', minPurchases: 2, isMandatory: true },
    { bucket: 'B4', displayName: 'B.Tech Year 4', minPurchases: 2, isMandatory: true },
    { bucket: 'B5', displayName: 'Diploma', minPurchases: 2, isMandatory: true },
    { bucket: 'PG', displayName: 'Post Graduate', minPurchases: 0, isMandatory: false },
  ];

  it('correctly identifies incomplete bucket quotas and computes D', () => {
    const acquiredLots: AcquiredLotSummary[] = [
      { lotId: '1', registrationId: 'r1', bucket: 'B1', status: 'sold', price: 50 },
      { lotId: '2', registrationId: 'r2', bucket: 'B1', status: 'sold', price: 50 },
      { lotId: '3', registrationId: 'r3', bucket: 'B2', status: 'sold', price: 40 },
    ];

    const progress = calculateBucketProgress(bucketRules, acquiredLots);

    expect(progress.allMandatoryFulfilled).toBe(false);
    expect(progress.totalAcquired).toBe(3);

    // B1: 2/2 -> fulfilled (0 needed)
    const b1 = progress.buckets.find((b) => b.bucket === 'B1')!;
    expect(b1.acquiredCount).toBe(2);
    expect(b1.isFulfilled).toBe(true);
    expect(b1.remainingNeeded).toBe(0);

    // B2: 1/2 -> incomplete (1 needed)
    const b2 = progress.buckets.find((b) => b.bucket === 'B2')!;
    expect(b2.acquiredCount).toBe(1);
    expect(b2.isFulfilled).toBe(false);
    expect(b2.remainingNeeded).toBe(1);

    // B3, B4, B5: 0/2 -> 2 needed each = 6
    // Total D = 1 (from B2) + 2 (B3) + 2 (B4) + 2 (B5) = 7
    expect(progress.mandatoryDeficitSum).toBe(7);
  });

  it('recognizes when all mandatory bucket quotas are fulfilled', () => {
    const acquiredLots: AcquiredLotSummary[] = [
      { lotId: '1', registrationId: 'r1', bucket: 'B1', status: 'sold', price: 20 },
      { lotId: '2', registrationId: 'r2', bucket: 'B1', status: 'sold', price: 20 },
      { lotId: '3', registrationId: 'r3', bucket: 'B2', status: 'sold', price: 20 },
      { lotId: '4', registrationId: 'r4', bucket: 'B2', status: 'sold', price: 20 },
      { lotId: '5', registrationId: 'r5', bucket: 'B3', status: 'sold', price: 20 },
      { lotId: '6', registrationId: 'r6', bucket: 'B3', status: 'sold', price: 20 },
      { lotId: '7', registrationId: 'r7', bucket: 'B4', status: 'sold', price: 20 },
      { lotId: '8', registrationId: 'r8', bucket: 'B4', status: 'sold', price: 20 },
      { lotId: '9', registrationId: 'r9', bucket: 'B5', status: 'sold', price: 20 },
      { lotId: '10', registrationId: 'r10', bucket: 'B5', status: 'sold', price: 20 },
    ];

    const progress = calculateBucketProgress(bucketRules, acquiredLots);

    expect(progress.allMandatoryFulfilled).toBe(true);
    expect(progress.mandatoryDeficitSum).toBe(0);
  });
});

describe('Franchise Squad Domain — Squad Size & Completion Constraints', () => {
  it('correctly tracks squad boundaries and vacancies', () => {
    // 10 players acquired
    const status = evaluateSquadConstraints({
      currentSquadSize: 10,
      minSquadSize: 17,
      maxSquadSize: 22,
      allMandatoryBucketsFulfilled: false,
      auctionPurchasesCount: 10,
      minAuctionPurchases: 15,
    });

    expect(status.isBelowMinimum).toBe(true);
    expect(status.isSquadFull).toBe(false);
    expect(status.vacantSlots).toBe(12); // 22 - 10
    expect(status.canAcquireMore).toBe(true);
    expect(status.meetsAuctionCompletionCriteria).toBe(false);
  });

  it('identifies when squad is legally complete', () => {
    // 18 players acquired, 16 auction purchases, all buckets fulfilled
    const status = evaluateSquadConstraints({
      currentSquadSize: 18,
      minSquadSize: 17,
      maxSquadSize: 22,
      allMandatoryBucketsFulfilled: true,
      auctionPurchasesCount: 16,
      minAuctionPurchases: 15,
    });

    expect(status.isBelowMinimum).toBe(false);
    expect(status.isWithinValidRange).toBe(true);
    expect(status.meetsAuctionCompletionCriteria).toBe(true);
  });

  it('detects when squad is at maximum capacity (22)', () => {
    const status = evaluateSquadConstraints({
      currentSquadSize: 22,
      minSquadSize: 17,
      maxSquadSize: 22,
      allMandatoryBucketsFulfilled: true,
      auctionPurchasesCount: 18,
      minAuctionPurchases: 15,
    });

    expect(status.isSquadFull).toBe(true);
    expect(status.vacantSlots).toBe(0);
    expect(status.canAcquireMore).toBe(false);
  });
});
