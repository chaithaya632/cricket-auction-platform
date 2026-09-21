// =============================================================================
// ACC Auction Portal — Domain: Max Permissible Bid Formula (Spec §20)
// =============================================================================
// CRITICAL SPEC FORMULA:
//   G = minAuctionPurchases - auctionPurchasesSoFar
//   D = sum over mandatory buckets: max(0, bucketRule.min_purchases - boughtInBucket)
//   reserveSlots = max(0, max(G, D) - 1)
//   reservedPurse = minBasePrice * reserveSlots
//   maxBid = max(0, remainingPurse - reservedPurse)
//
// For ACC 2026:
//   minAuctionPurchases = 15
//   minBasePrice = 20
//   B1–B5 minimum = 2 each
//   PG minimum = 0 (optional)
// =============================================================================

export interface MandatoryBucketDeficit {
  bucket: string;
  minRequired: number;
  acquiredCount: number;
}

export interface MaxPermissibleBidParams {
  remainingPurse: number;
  auctionPurchasesSoFar: number;
  minAuctionPurchases?: number; // default 15
  minBasePrice?: number; // default 20
  mandatoryBucketDeficits: MandatoryBucketDeficit[];
}

export interface MaxPermissibleBidResult {
  maxBid: number;
  gDeficit: number; // G
  dDeficit: number; // D
  reserveSlots: number;
  reservedPurse: number;
  limitingConstraint: 'total_purchases' | 'bucket_requirements' | 'equal' | 'none';
  remainingPurse: number;
}

/**
 * Authoritative implementation of the ACC Max Permissible Bid formula.
 * Enforces that a franchise retains sufficient funds at minBasePrice (₹20)
 * to satisfy both overall auction purchase requirements and individual bucket quotas.
 */
export function calculateMaxPermissibleBid(
  params: MaxPermissibleBidParams
): MaxPermissibleBidResult {
  const {
    remainingPurse,
    auctionPurchasesSoFar,
    minAuctionPurchases = 15,
    minBasePrice = 20,
    mandatoryBucketDeficits,
  } = params;

  // G: Deficit of overall mandatory auction purchases
  const gDeficit = Math.max(0, minAuctionPurchases - auctionPurchasesSoFar);

  // D: Sum of deficits over mandatory buckets
  let dDeficit = 0;
  for (const bucket of mandatoryBucketDeficits) {
    const deficit = Math.max(0, bucket.minRequired - bucket.acquiredCount);
    dDeficit += deficit;
  }

  // Maximum constraint between overall purchases and bucket quotas
  const maxConstraint = Math.max(gDeficit, dDeficit);

  // Slots to reserve (excluding the active lot currently being bid on)
  const reserveSlots = Math.max(0, maxConstraint - 1);

  // Funds locked for future mandatory purchases
  const reservedPurse = minBasePrice * reserveSlots;

  // Maximum allowable bid on the current lot
  const maxBid = Math.max(0, remainingPurse - reservedPurse);

  // Determine limiting constraint for audit/reporting
  let limitingConstraint: 'total_purchases' | 'bucket_requirements' | 'equal' | 'none';
  if (maxConstraint === 0) {
    limitingConstraint = 'none';
  } else if (gDeficit > dDeficit) {
    limitingConstraint = 'total_purchases';
  } else if (dDeficit > gDeficit) {
    limitingConstraint = 'bucket_requirements';
  } else {
    limitingConstraint = 'equal';
  }

  return {
    maxBid,
    gDeficit,
    dDeficit,
    reserveSlots,
    reservedPurse,
    limitingConstraint,
    remainingPurse,
  };
}
