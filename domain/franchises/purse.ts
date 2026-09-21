// =============================================================================
// ACC Auction Portal — Domain: Franchise Purse State & Acquisition Semantics
// =============================================================================

import {
  calculateMaxPermissibleBid,
  type MandatoryBucketDeficit,
  type MaxPermissibleBidResult,
} from './max-bid';

export type AcquisitionType = 'sold' | 'allotted' | 'scouted';

export interface AcquiredLotSummary {
  lotId: string;
  registrationId: string;
  bucket: string;
  status: AcquisitionType;
  price: number;
}

export interface BucketRuleSummary {
  bucket: string;
  minPurchases: number;
  isMandatory: boolean;
}

export interface CalculatePurseStateParams {
  startingPurse: number;
  acquiredLots: AcquiredLotSummary[];
  bucketRules: BucketRuleSummary[];
  minAuctionPurchases?: number;
  minBasePrice?: number;
}

export interface PurseState {
  startingPurse: number;
  totalSpent: number;
  remainingPurse: number;
  auctionPurchasesCount: number; // Only 'sold' lots (G)
  allotmentCount: number; // 'allotted' lots
  scoutingCount: number; // 'scouted' lots
  totalSquadCount: number; // all acquired lots
  maxBidResult: MaxPermissibleBidResult;
}

/**
 * Computes financial purse state, total expenditure, and max permissible bid
 * strictly honoring the distinct acquisition semantics of SOLD, ALLOTTED, and SCOUTED.
 */
export function calculatePurseState(params: CalculatePurseStateParams): PurseState {
  const {
    startingPurse,
    acquiredLots,
    bucketRules,
    minAuctionPurchases = 15,
    minBasePrice = 20,
  } = params;

  let totalSpent = 0;
  let auctionPurchasesCount = 0;
  let allotmentCount = 0;
  let scoutingCount = 0;

  // Track acquired players per bucket for bucket quota calculation
  const bucketAcquiredMap: Record<string, number> = {};
  for (const rule of bucketRules) {
    bucketAcquiredMap[rule.bucket] = 0;
  }

  for (const lot of acquiredLots) {
    // 1. Total spent: each acquisition type consumes purse
    totalSpent += lot.price;

    // 2. Count per bucket: all valid squad acquisitions satisfy bucket quotas
    if (bucketAcquiredMap[lot.bucket] !== undefined) {
      bucketAcquiredMap[lot.bucket] += 1;
    } else {
      bucketAcquiredMap[lot.bucket] = 1;
    }

    // 3. Purchase classification:
    // Only 'sold' (competitive auction purchase) counts toward G (min_auction_purchases)
    if (lot.status === 'sold') {
      auctionPurchasesCount += 1;
    } else if (lot.status === 'allotted') {
      allotmentCount += 1;
    } else if (lot.status === 'scouted') {
      scoutingCount += 1;
    }
  }

  const remainingPurse = Math.max(0, startingPurse - totalSpent);

  // Construct mandatory bucket deficits for max-bid calculation
  const mandatoryBucketDeficits: MandatoryBucketDeficit[] = bucketRules
    .filter((r) => r.isMandatory)
    .map((r) => ({
      bucket: r.bucket,
      minRequired: r.minPurchases,
      acquiredCount: bucketAcquiredMap[r.bucket] || 0,
    }));

  const maxBidResult = calculateMaxPermissibleBid({
    remainingPurse,
    auctionPurchasesSoFar: auctionPurchasesCount,
    minAuctionPurchases,
    minBasePrice,
    mandatoryBucketDeficits,
  });

  return {
    startingPurse,
    totalSpent,
    remainingPurse,
    auctionPurchasesCount,
    allotmentCount,
    scoutingCount,
    totalSquadCount: acquiredLots.length,
    maxBidResult,
  };
}
