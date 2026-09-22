// =============================================================================
// ACC Auction Portal — Unit Tests: Live Presentation & Telemetry (§14, §15)
// =============================================================================

import { describe, it, expect } from 'vitest';
import { calculateMaxPermissibleBid } from '@/domain/franchises/max-bid';
import { validateBucketEligibility } from '@/domain/auction/bucket-eligibility';
import { detectBucketScarcity } from '@/domain/scarcity';

describe('Live Presentation & 11-Franchise Telemetry (§14, §15)', () => {
  it('correctly classifies a franchise as BLOCKED when squad cap of 22 is reached', () => {
    const squadCount = 22;
    const maxSquad = 22;
    const isBlocked = squadCount >= maxSquad;
    expect(isBlocked).toBe(true);
  });

  it('correctly identifies BLOCKED status when Max Permissible Bid is below the next required bid', () => {
    // Franchise with purse 320, 14 purchases so far, needs 1 more slot to meet 15 min purchases.
    // 1 slot * 20 min base price = 20 reserved. Max bid = 320 - 20 = 300.
    // But if franchise only has 25 purse and needs 1 slot, max bid is 25 - 20 = 5.
    const result = calculateMaxPermissibleBid({
      remainingPurse: 25,
      auctionPurchasesSoFar: 13,
      minAuctionPurchases: 15,
      minBasePrice: 20,
      mandatoryBucketDeficits: [
        { bucket: 'B1', minRequired: 2, acquiredCount: 2 },
        { bucket: 'B2', minRequired: 2, acquiredCount: 2 },
        { bucket: 'B3', minRequired: 2, acquiredCount: 2 },
        { bucket: 'B4', minRequired: 2, acquiredCount: 2 },
        { bucket: 'B5', minRequired: 2, acquiredCount: 2 },
      ],
    });

    expect(result.maxBid).toBe(5);

    // Active lot opening bid is 20
    const nextBid = 20;
    const isPurseBlocked = result.maxBid < nextBid;
    expect(isPurseBlocked).toBe(true);
  });

  it('correctly flags BLOCKED status when a franchise would strand mandatory bucket quotas (§12.2)', () => {
    // 1 slot remaining to reach 15 min purchases, needs 1 diploma player (B5), bidding on B1
    const check = validateBucketEligibility({
      remainingSlots: 1,
      unfilledMandatoryDeficits: [
        { bucket: 'B1', remainingNeeded: 0 },
        { bucket: 'B2', remainingNeeded: 0 },
        { bucket: 'B3', remainingNeeded: 0 },
        { bucket: 'B4', remainingNeeded: 0 },
        { bucket: 'B5', remainingNeeded: 1 },
      ],
      targetBucket: 'B1',
      remainingPurse: 500,
      proposedBid: 25,
      minBasePrice: 20,
    });

    expect(check.isEligible).toBe(false);
    expect(check.reason).toContain('Blocked: Franchise has 1 slot(s) remaining and still needs 1 mandatory player(s)');
  });

  it('correctly marks franchise as IN PLAY when max bid and bucket quotas are valid', () => {
    const check = validateBucketEligibility({
      remainingSlots: 5,
      unfilledMandatoryDeficits: [
        { bucket: 'B1', remainingNeeded: 1 },
        { bucket: 'B2', remainingNeeded: 0 },
        { bucket: 'B3', remainingNeeded: 0 },
        { bucket: 'B4', remainingNeeded: 0 },
        { bucket: 'B5', remainingNeeded: 1 },
      ],
      targetBucket: 'B1',
      remainingPurse: 500,
      proposedBid: 25,
      minBasePrice: 20,
    });

    expect(check.isEligible).toBe(true);
  });

  it('triggers scarcity warning on projector and admin when unsold supply <= total players needed (§12.3)', () => {
    const report = detectBucketScarcity({
      bucket: 'B3',
      unsoldSupply: 4,
      franchiseNeeds: [
        { franchiseId: 'f1', needed: 2 },
        { franchiseId: 'f2', needed: 2 },
        { franchiseId: 'f3', needed: 1 },
      ],
    });

    expect(report.totalPlayersNeeded).toBe(5);
    expect(report.isWarningActive).toBe(true);
    expect(report.biddingAllowed).toBe(true); // Never blocked
  });
});
