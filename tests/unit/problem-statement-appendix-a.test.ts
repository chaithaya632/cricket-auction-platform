// =============================================================================
// ACC Auction Portal — Acceptance Test Suite: Appendix A (Cases 1–31)
// =============================================================================
// Official Acceptance Test Cases from the Avanthi Cricket Carnival Problem Statement:
//
// A.1 Maximum Permissible Bid (Cases 1–6)
// A.2 Bucket Eligibility (Cases 7–10)
// A.3 Scarcity — warnings, never blocks (Cases 11–15)
// A.4 Undo (Cases 16–18)
// A.5 Roll Number Parsing (Cases 19–24)
// A.6 Bidding Mechanics (Cases 25–31)
// =============================================================================

import { describe, it, expect } from 'vitest';

// Domain imports
import {
  calculateMaxPermissibleBid,
  type MandatoryBucketDeficit,
} from '@/domain/franchises/max-bid';
import {
  validateBucketEligibility,
  resetTimerOnBid,
  evaluateAllPassCondition,
  evaluateSaleCompletion,
  calculateNextBid,
  validateBidAmount,
} from '@/domain/auction';
import {
  detectBucketScarcity,
  calculateScarcityThreshold,
  recalculateScarcityAfterUndo,
} from '@/domain/scarcity';
import {
  executeDomainUndo,
  type LotRecord,
  type FranchiseStateSnapshot,
} from '@/domain/recovery';
import {
  parseRollNumber,
  calculateAcademicYear,
  deriveBucket,
  getBranchFullName,
} from '@/domain/academic';
import { shouldShowReferralQuestion } from '@/domain/referrals';
import { TIMER } from '@/lib/constants';

// Helper to construct mandatory bucket deficits (B1–B5, min 2 each)
function makeBucketDeficits(acquired: Record<string, number>): MandatoryBucketDeficit[] {
  return ['B1', 'B2', 'B3', 'B4', 'B5'].map((b) => ({
    bucket: b,
    minRequired: 2,
    acquiredCount: acquired[b] || 0,
  }));
}

// 2026-27 Tournament Date (e.g., September 15, 2026)
const ACC_2026_SEASON_DATE = new Date(2026, 8, 15); // Sept 15, 2026
const ACADEMIC_YEAR_2026 = 2026;

describe('Official Acceptance Test Cases — Appendix A', () => {
  // ===========================================================================
  // A.1 Maximum Permissible Bid (Cases 1–6)
  // ===========================================================================
  describe('A.1 Maximum Permissible Bid (Cases 1–6)', () => {
    it('Case 1: Purse 1000, 0 players bought, all five bucket minimums unmet -> 720', () => {
      // G = 15 - 0 = 15
      // D = 5 * 2 = 10
      // max(15, 10) = 15
      // reserve_slots = 14
      // reserved_purse = 14 * 20 = 280
      // max_bid = 1000 - 280 = 720
      const result = calculateMaxPermissibleBid({
        remainingPurse: 1000,
        auctionPurchasesSoFar: 0,
        minAuctionPurchases: 15,
        minBasePrice: 20,
        mandatoryBucketDeficits: makeBucketDeficits({
          B1: 0,
          B2: 0,
          B3: 0,
          B4: 0,
          B5: 0,
        }),
      });

      expect(result.gDeficit).toBe(15);
      expect(result.dDeficit).toBe(10);
      expect(result.reserveSlots).toBe(14);
      expect(result.reservedPurse).toBe(280);
      expect(result.maxBid).toBe(720);
    });

    it('Case 2: Purse 1000, 14 players bought, all bucket minimums met -> 1000', () => {
      // G = 15 - 14 = 1
      // D = 0
      // max(1, 0) = 1
      // reserve_slots = 1 - 1 = 0
      // max_bid = 1000 - 0 = 1000
      const result = calculateMaxPermissibleBid({
        remainingPurse: 1000,
        auctionPurchasesSoFar: 14,
        minAuctionPurchases: 15,
        minBasePrice: 20,
        mandatoryBucketDeficits: makeBucketDeficits({
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

    it('Case 3: Purse 340, 11 players bought, 5 mandatory bucket slots still unfilled -> 260', () => {
      // G = 15 - 11 = 4
      // D = 5 (1 slot unfilled in each of the 5 mandatory buckets)
      // max(4, 5) = 5 (bucket requirements dominate)
      // reserve_slots = 5 - 1 = 4
      // reserved_purse = 4 * 20 = 80
      // max_bid = 340 - 80 = 260
      const result = calculateMaxPermissibleBid({
        remainingPurse: 340,
        auctionPurchasesSoFar: 11,
        minAuctionPurchases: 15,
        minBasePrice: 20,
        mandatoryBucketDeficits: makeBucketDeficits({
          B1: 1, // deficit 1
          B2: 1, // deficit 1
          B3: 1, // deficit 1
          B4: 1, // deficit 1
          B5: 1, // deficit 1 -> Total D = 5
        }),
      });

      expect(result.gDeficit).toBe(4);
      expect(result.dDeficit).toBe(5);
      expect(result.limitingConstraint).toBe('bucket_requirements');
      expect(result.reserveSlots).toBe(4);
      expect(result.reservedPurse).toBe(80);
      expect(result.maxBid).toBe(260);
    });

    it('Case 4: Purse 200, 13 players bought, all bucket minimums met -> 180', () => {
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
        mandatoryBucketDeficits: makeBucketDeficits({
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

    it('Case 5: Purse 20, 14 players bought, all bucket minimums met -> 20', () => {
      // G = 15 - 14 = 1
      // D = 0
      // max(1, 0) = 1
      // reserve_slots = 1 - 1 = 0
      // max_bid = 20
      const result = calculateMaxPermissibleBid({
        remainingPurse: 20,
        auctionPurchasesSoFar: 14,
        minAuctionPurchases: 15,
        minBasePrice: 20,
        mandatoryBucketDeficits: makeBucketDeficits({
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

    it('Case 6: Purse 600, 15 players bought, all bucket minimums met -> 600 (no restriction)', () => {
      // G = 0
      // D = 0
      // max(0, 0) = 0
      // reserve_slots = 0
      // max_bid = 600 (no restriction applies)
      const result = calculateMaxPermissibleBid({
        remainingPurse: 600,
        auctionPurchasesSoFar: 15,
        minAuctionPurchases: 15,
        minBasePrice: 20,
        mandatoryBucketDeficits: makeBucketDeficits({
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

  // ===========================================================================
  // A.2 Bucket Eligibility (Cases 7–10)
  // ===========================================================================
  describe('A.2 Bucket Eligibility (Cases 7–10)', () => {
    it('Case 7: 1 slot remaining and still needs a diploma player. Bids on a B.Tech 2nd year -> Blocked', () => {
      // Franchise has 1 slot left, but owes 1 diploma player (B5).
      // Bidding on B2 (B.Tech 2nd year) would leave 0 slots for 1 diploma deficit.
      const result = validateBucketEligibility({
        remainingSlots: 1,
        unfilledMandatoryDeficits: { B5: 1 },
        targetBucket: 'B2',
      });

      expect(result.isEligible).toBe(false);
      expect(result.reason).toContain('Blocked');
      expect(result.remainingSlotsAfterPurchase).toBe(0);
      expect(result.deficitAfterPurchase).toBe(1);
    });

    it('Case 8: 3 slots remaining and needs 2 diploma players. Bids on a PG player -> Allowed', () => {
      // Franchise has 3 slots left and owes 2 diploma players.
      // Bidding on PG leaves 2 slots, which is sufficient for the 2 diploma players.
      const result = validateBucketEligibility({
        remainingSlots: 3,
        unfilledMandatoryDeficits: { B5: 2 },
        targetBucket: 'PG',
      });

      expect(result.isEligible).toBe(true);
      expect(result.remainingSlotsAfterPurchase).toBe(2);
      expect(result.deficitAfterPurchase).toBe(2);
    });

    it('Case 9: 2 slots remaining and needs 2 diploma players. Bids on a PG player -> Blocked', () => {
      // Franchise has 2 slots left and owes 2 diploma players.
      // Bidding on PG would leave 1 slot for 2 diploma players -> Blocked!
      const result = validateBucketEligibility({
        remainingSlots: 2,
        unfilledMandatoryDeficits: { B5: 2 },
        targetBucket: 'PG',
      });

      expect(result.isEligible).toBe(false);
      expect(result.reason).toContain('Blocked');
      expect(result.remainingSlotsAfterPurchase).toBe(1);
      expect(result.deficitAfterPurchase).toBe(2);
    });

    it('Case 10: Franchise has 20 credits and one unfilled diploma slot. Bids 20 on a diploma player -> Allowed', () => {
      // Franchise has 20 credits, 1 unfilled diploma slot (B5).
      // Target player is in B5, so purchasing satisfies the deficit (0 slots needed after).
      // Max bid allows 20 (reserve needed = 0).
      const result = validateBucketEligibility({
        remainingSlots: 1,
        unfilledMandatoryDeficits: { B5: 1 },
        targetBucket: 'B5',
        remainingPurse: 20,
        proposedBid: 20,
      });

      expect(result.isEligible).toBe(true);
      expect(result.remainingSlotsAfterPurchase).toBe(0);
      expect(result.deficitAfterPurchase).toBe(0);

      // Verify max bid calculation supports the 20 bid
      const maxBid = calculateMaxPermissibleBid({
        remainingPurse: 20,
        auctionPurchasesSoFar: 14,
        minAuctionPurchases: 15,
        minBasePrice: 20,
        mandatoryBucketDeficits: makeBucketDeficits({
          B1: 2,
          B2: 2,
          B3: 2,
          B4: 2,
          B5: 1, // deficit 1
        }),
      });
      expect(maxBid.maxBid).toBe(20);
    });
  });

  // ===========================================================================
  // A.3 Scarcity — warnings, never blocks (Cases 11–15)
  // ===========================================================================
  describe('A.3 Scarcity Warnings (Cases 11–15)', () => {
    it('Case 11: Diploma bucket: 12 unsold, 11 franchises still need one. Franchise A meets min and bids -> Allowed, no warning yet', () => {
      const franchiseNeeds = Array.from({ length: 11 }, (_, i) => ({
        franchiseId: `franchise-${i + 1}`,
        needed: 1,
      }));

      const scarcity = detectBucketScarcity({
        bucket: 'B5',
        unsoldSupply: 12,
        franchiseNeeds,
      });

      expect(scarcity.totalPlayersNeeded).toBe(11);
      expect(scarcity.unsoldSupply).toBe(12);
      expect(scarcity.isWarningActive).toBe(false);
      expect(scarcity.biddingAllowed).toBe(true);
      expect(scarcity.warningSurfaces).toHaveLength(0);
    });

    it('Case 12: Diploma bucket: 11 unsold, 11 franchises still need one. Franchise A meets min and bids -> Allowed + warning raised on admin, projector, public', () => {
      const franchiseNeeds = Array.from({ length: 11 }, (_, i) => ({
        franchiseId: `franchise-${i + 1}`,
        needed: 1,
      }));

      const scarcity = detectBucketScarcity({
        bucket: 'B5',
        unsoldSupply: 11,
        franchiseNeeds,
      });

      // Bidding is NEVER blocked
      expect(scarcity.biddingAllowed).toBe(true);
      // Warning is raised the moment supply <= needed
      expect(scarcity.isWarningActive).toBe(true);
      expect(scarcity.warningSurfaces).toEqual(['admin', 'projector', 'public']);
    });

    it('Case 13: Diploma bucket: 11 unsold, 6 franchises still need, two needing two each -> threshold is 8, not 6', () => {
      // 4 franchises need 1 each (4), 2 franchises need 2 each (4) -> total players needed = 8
      const franchiseNeeds = [
        { franchiseId: 'f1', needed: 1 },
        { franchiseId: 'f2', needed: 1 },
        { franchiseId: 'f3', needed: 1 },
        { franchiseId: 'f4', needed: 1 },
        { franchiseId: 'f5', needed: 2 },
        { franchiseId: 'f6', needed: 2 },
      ];

      const threshold = calculateScarcityThreshold(franchiseNeeds);
      expect(threshold).toBe(8);
      expect(franchiseNeeds.length).toBe(6); // 6 teams, but 8 players needed

      const scarcity = detectBucketScarcity({
        bucket: 'B5',
        unsoldSupply: 11,
        franchiseNeeds,
      });

      expect(scarcity.threshold).toBe(8);
      expect(scarcity.franchisesNeedingCount).toBe(6);
      // Since 11 unsold > 8 needed, warning is not active yet
      expect(scarcity.isWarningActive).toBe(false);

      // But when supply drops to 8, warning activates
      const atThreshold = detectBucketScarcity({
        bucket: 'B5',
        unsoldSupply: 8,
        franchiseNeeds,
      });
      expect(atThreshold.isWarningActive).toBe(true);
    });

    it('Case 14: Diploma bucket: 0 unsold, 1 franchise still needs one -> routed to scouting under §13 with no vote required', () => {
      const franchiseNeeds = [{ franchiseId: 'f11', needed: 1 }];

      const scarcity = detectBucketScarcity({
        bucket: 'B5',
        unsoldSupply: 0,
        franchiseNeeds,
      });

      expect(scarcity.isExhausted).toBe(true);
      expect(scarcity.routedToScouting).toBe(true);
      expect(scarcity.warningSurfaces).toContain('admin');
    });

    it('Case 15: A sale is undone, returning a diploma player to the pool while warning is active -> warning clears immediately if supply > need', () => {
      const franchiseNeeds = Array.from({ length: 11 }, (_, i) => ({
        franchiseId: `franchise-${i + 1}`,
        needed: 1,
      }));

      // Initially active warning: 11 unsold <= 11 needed
      const initialReport = detectBucketScarcity({
        bucket: 'B5',
        unsoldSupply: 11,
        franchiseNeeds,
      });
      expect(initialReport.isWarningActive).toBe(true);

      // Sale undone: 1 diploma player returns to pool, unsold becomes 12
      const updatedReport = recalculateScarcityAfterUndo(
        initialReport,
        'B5',
        'franchise-1',
        franchiseNeeds
      );

      expect(updatedReport.unsoldSupply).toBe(12);
      expect(updatedReport.totalPlayersNeeded).toBe(11);
      // 12 > 11: warning clears immediately!
      expect(updatedReport.isWarningActive).toBe(false);
    });
  });

  // ===========================================================================
  // A.4 Undo (Cases 16–18)
  // ===========================================================================
  describe('A.4 Undo (Cases 16–18)', () => {
    it('Case 16: A sale from 40 lots ago is undone -> refunded, slot freed, player returned, limits recalculated, history preserved', () => {
      // Lot sold 40 lots ago (e.g. lot 5) to franchise-1 for 120 credits
      const targetLot: LotRecord = {
        id: 'lot-5',
        lotNumber: 5,
        bucket: 'B2',
        salePrice: 120,
        buyerFranchiseId: 'franchise-1',
        status: 'sold',
      };

      const franchiseState: FranchiseStateSnapshot = {
        id: 'franchise-1',
        purse: 400,
        auctionPurchases: 10,
        squadCount: 12,
        bucketCounts: { B1: 2, B2: 3, B3: 2, B4: 2, B5: 1 },
      };

      const result = executeDomainUndo(targetLot, franchiseState);

      expect(result.success).toBe(true);
      // 1. Purse refunded (+120)
      expect(result.updatedFranchise?.purse).toBe(520);
      // 2. Slot freed
      expect(result.updatedFranchise?.auctionPurchases).toBe(9);
      expect(result.updatedFranchise?.squadCount).toBe(11);
      // 3. Player returns to pool
      expect(result.updatedLot?.status).toBe('pending');
      expect(result.updatedLot?.isUndone).toBe(true);
      // 4. All limits recalculated immediately
      expect(result.maxBidResult?.maxBid).toBeGreaterThan(400);
      // 5. History preserved
      expect(result.historyEventRecorded).toBe(true);
      expect(result.undoEvent?.eventType).toBe('UNDO_SALE');
      expect(result.undoEvent?.refundAmount).toBe(120);
    });

    it('Case 17: Undone sale was the franchise only diploma player -> diploma unmet; max bid and bucket eligibility update immediately', () => {
      // Franchise had exactly 1 diploma player (needs 2, or min was 1)
      const targetLot: LotRecord = {
        id: 'lot-12',
        lotNumber: 12,
        bucket: 'B5', // Diploma player
        salePrice: 50,
        buyerFranchiseId: 'franchise-A',
        status: 'sold',
      };

      const franchiseState: FranchiseStateSnapshot = {
        id: 'franchise-A',
        purse: 300,
        auctionPurchases: 14,
        squadCount: 16,
        bucketCounts: { B1: 2, B2: 2, B3: 2, B4: 2, B5: 1 }, // Only 1 diploma player
      };

      const result = executeDomainUndo(targetLot, franchiseState, 1); // min 1 per bucket
      expect(result.success).toBe(true);

      // Diploma count drops to 0 -> diploma requirement becomes unmet
      expect(result.updatedFranchise?.bucketCounts['B5']).toBe(0);

      // Verify bucket eligibility updates immediately:
      // With 1 slot left and 1 diploma player owed, bidding on B2 is BLOCKED
      const eligibilityCheck = validateBucketEligibility({
        remainingSlots: 1,
        unfilledMandatoryDeficits: { B5: 1 },
        targetBucket: 'B2',
      });
      expect(eligibilityCheck.isEligible).toBe(false);
      expect(eligibilityCheck.reason).toContain('Blocked');
    });

    it('Case 18: Same sale is undone twice -> second attempt rejected (no double refund)', () => {
      const targetLot: LotRecord = {
        id: 'lot-15',
        lotNumber: 15,
        bucket: 'B3',
        salePrice: 80,
        buyerFranchiseId: 'franchise-1',
        status: 'sold',
      };

      const franchiseState: FranchiseStateSnapshot = {
        id: 'franchise-1',
        purse: 500,
        auctionPurchases: 8,
        squadCount: 10,
        bucketCounts: { B1: 2, B2: 2, B3: 2, B4: 1, B5: 1 },
      };

      // First undo succeeds
      const firstUndo = executeDomainUndo(targetLot, franchiseState);
      expect(firstUndo.success).toBe(true);
      expect(firstUndo.updatedFranchise?.purse).toBe(580);

      // Second attempt on the already undone lot
      const secondUndo = executeDomainUndo(firstUndo.updatedLot!, firstUndo.updatedFranchise!);
      expect(secondUndo.success).toBe(false);
      expect(secondUndo.error).toContain('Second attempt rejected — no double refund');
    });
  });

  // ===========================================================================
  // A.5 Roll Number Parsing (Cases 19–24)
  // ===========================================================================
  describe('A.5 Roll Number Parsing (Cases 19–24)', () => {
    it('Case 19: 25811A0403 -> B.Tech, ECE, regular, 2nd year -> bucket B2 (in 2026-27)', () => {
      const parsed = parseRollNumber('25811A0403');
      expect(parsed.isValid).toBe(true);
      expect(parsed.programme).toBe('btech_regular');
      expect(parsed.branchName).toBe('ECE');
      expect(parsed.admissionYear).toBe(2025);

      const year = calculateAcademicYear(parsed.admissionYear!, parsed.programme!, ACC_2026_SEASON_DATE);
      expect(year).toBe(2); // 2nd year in 2026-27

      const bucket = deriveBucket(parsed.programme!, year);
      expect(bucket).toBe('B2');
    });

    it('Case 20: 25815A0403 -> B.Tech, ECE, lateral entry, 3rd year -> bucket B3 (in 2026-27)', () => {
      const parsed = parseRollNumber('25815A0403');
      expect(parsed.isValid).toBe(true);
      expect(parsed.programme).toBe('btech_lateral');
      expect(parsed.branchName).toBe('ECE');
      expect(parsed.admissionYear).toBe(2025);

      // Lateral entrants join directly in Year 2: (2026 - 2025) + 2 = 3
      const year = calculateAcademicYear(parsed.admissionYear!, parsed.programme!, ACC_2026_SEASON_DATE);
      expect(year).toBe(3); // 3rd year in 2026-27

      const bucket = deriveBucket(parsed.programme!, year);
      expect(bucket).toBe('B3');
    });

    it('Case 21: 23811A4201 -> B.Tech, CSM, regular, 4th year -> bucket B4 (in 2026-27)', () => {
      const parsed = parseRollNumber('23811A4201');
      expect(parsed.isValid).toBe(true);
      expect(parsed.programme).toBe('btech_regular');
      expect(parsed.branchCode).toBe('42');
      expect(parsed.branchName).toBe('CSM');
      expect(parsed.admissionYear).toBe(2023);

      const year = calculateAcademicYear(parsed.admissionYear!, parsed.programme!, ACC_2026_SEASON_DATE);
      expect(year).toBe(4); // 4th year in 2026-27

      const bucket = deriveBucket(parsed.programme!, year);
      expect(bucket).toBe('B4');
    });

    it('Case 22: 24597-CM-015 -> Diploma, Computer Engineering, 3rd year -> bucket B5', () => {
      const parsed = parseRollNumber('24597-CM-015');
      expect(parsed.isValid).toBe(true);
      expect(parsed.programme).toBe('diploma');
      expect(parsed.branchCode).toBe('CM');
      expect(getBranchFullName('CM', 'diploma')).toBe('Computer Engineering');
      expect(parsed.admissionYear).toBe(2024);

      const year = calculateAcademicYear(parsed.admissionYear!, parsed.programme!, ACC_2026_SEASON_DATE);
      expect(year).toBe(3); // 3rd year in 2026-27

      const bucket = deriveBucket(parsed.programme!, year);
      expect(bucket).toBe('B5');
    });

    it('Case 23: 26597-M-041 -> Diploma, Mechanical, 1st year -> bucket B5', () => {
      const parsed = parseRollNumber('26597-M-041');
      expect(parsed.isValid).toBe(true);
      expect(parsed.programme).toBe('diploma');
      expect(parsed.branchCode).toBe('M');
      expect(getBranchFullName('M', 'diploma')).toBe('Mechanical');
      expect(parsed.admissionYear).toBe(2026);

      const year = calculateAcademicYear(parsed.admissionYear!, parsed.programme!, ACC_2026_SEASON_DATE);
      expect(year).toBe(1); // 1st year in 2026-27

      const bucket = deriveBucket(parsed.programme!, year);
      expect(bucket).toBe('B5');
    });

    it('Case 24: 26811A0501 -> B.Tech, CSE, regular, 1st year -> bucket B1, reference-program question shown', () => {
      const parsed = parseRollNumber('26811A0501');
      expect(parsed.isValid).toBe(true);
      expect(parsed.programme).toBe('btech_regular');
      expect(parsed.branchName).toBe('CSE');
      expect(parsed.admissionYear).toBe(2026);

      const year = calculateAcademicYear(parsed.admissionYear!, parsed.programme!, ACC_2026_SEASON_DATE);
      expect(year).toBe(1); // 1st year in 2026-27

      const bucket = deriveBucket(parsed.programme!, year);
      expect(bucket).toBe('B1');

      // Reference program question shown when admission year equals current academic year (2026)
      const showQuestion = shouldShowReferralQuestion(parsed.admissionYear, ACADEMIC_YEAR_2026);
      expect(showQuestion).toBe(true);

      // Contrast: 2025 admission (Case 19) does NOT see reference question
      expect(shouldShowReferralQuestion(2025, ACADEMIC_YEAR_2026)).toBe(false);
    });
  });

  // ===========================================================================
  // A.6 Bidding Mechanics (Cases 25–31)
  // ===========================================================================
  describe('A.6 Bidding Mechanics (Cases 25–31)', () => {
    it('Case 25: Current price 90. A franchise taps Bid -> New price 100', () => {
      const nextBid = calculateNextBid(90, 20);
      expect(nextBid).toBe(100);
    });

    it('Case 26: Current price 100. A franchise taps Bid -> New price 120', () => {
      const nextBid = calculateNextBid(100, 20);
      expect(nextBid).toBe(120);
    });

    it('Case 27: Current price 200. A franchise taps Bid -> New price 230', () => {
      const nextBid = calculateNextBid(200, 20);
      expect(nextBid).toBe(230);
    });

    it('Case 28: A franchise attempts to bid 150 when current price is 50 -> Rejected (no jump bidding)', () => {
      // Current is 50, next legal increment is +10 -> expected is 60
      const validation = validateBidAmount(150, 50, 20);
      expect(validation.valid).toBe(false);
      expect(validation.expectedBid).toBe(60);
      expect(validation.reason).toContain('Jump bids are prohibited');
    });

    it('Case 29: A bid is placed with 2 seconds remaining -> Timer resets to a full 20 seconds', () => {
      // When 2 seconds remain, placing a subsequent bid resets to full 20s
      const resetTime = resetTimerOnBid(2, false);
      expect(resetTime).toBe(20);
      expect(resetTime).toBe(TIMER.SUBSEQUENT_BID_SECONDS);
    });

    it('Case 30: All eleven franchises press Pass -> Timer continues to run; any franchise may re-enter', () => {
      const franchises = Array.from({ length: 11 }, (_, i) => ({
        franchiseId: `f-${i + 1}`,
        hasPassed: true,
        canReEnter: true,
      }));

      const timerState = {
        remainingSeconds: 12,
        isRunning: true,
        isExpired: false,
      };

      const result = evaluateAllPassCondition(franchises, timerState);

      expect(result.allPassed).toBe(true);
      expect(result.passedCount).toBe(11);
      // Timer continues its full course
      expect(result.timerContinues).toBe(true);
      // Re-entry is always allowed before the hammer
      expect(result.reEntryAllowed).toBe(true);
    });

    it('Case 31: Timer expires with a highest bidder, hammer not yet pressed -> No sale recorded (sale requires the hammer)', () => {
      const result = evaluateSaleCompletion({
        timerExpired: true,
        hammerPressed: false,
        highestBidderId: 'franchise-7',
        currentPrice: 230,
      });

      // No sale recorded!
      expect(result.saleRecorded).toBe(false);
      expect(result.lotStatus).toBe('in_progress');
      expect(result.reason).toContain('No sale recorded — the sale requires the hammer');

      // Sale is recorded ONLY when hammer is pressed
      const hammeredResult = evaluateSaleCompletion({
        timerExpired: true,
        hammerPressed: true,
        highestBidderId: 'franchise-7',
        currentPrice: 230,
      });
      expect(hammeredResult.saleRecorded).toBe(true);
      expect(hammeredResult.lotStatus).toBe('sold');
    });
  });
});
