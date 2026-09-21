// =============================================================================
// ACC Auction Portal — Domain: Squad Rule Boundaries (Spec §15)
// =============================================================================

export interface SquadConstraintParams {
  currentSquadSize: number;
  minSquadSize?: number; // default 17
  maxSquadSize?: number; // default 22
  allMandatoryBucketsFulfilled: boolean;
  auctionPurchasesCount: number;
  minAuctionPurchases?: number; // default 15
}

export interface SquadConstraintStatus {
  isBelowMinimum: boolean;
  isWithinValidRange: boolean;
  isSquadFull: boolean;
  vacantSlots: number;
  canAcquireMore: boolean;
  meetsAuctionCompletionCriteria: boolean;
}

/**
 * Pure evaluation of franchise squad size boundaries and completion status.
 */
export function evaluateSquadConstraints(
  params: SquadConstraintParams
): SquadConstraintStatus {
  const {
    currentSquadSize,
    minSquadSize = 17,
    maxSquadSize = 22,
    allMandatoryBucketsFulfilled,
    auctionPurchasesCount,
    minAuctionPurchases = 15,
  } = params;

  const isBelowMinimum = currentSquadSize < minSquadSize;
  const isSquadFull = currentSquadSize >= maxSquadSize;
  const isWithinValidRange = currentSquadSize >= minSquadSize && currentSquadSize <= maxSquadSize;
  const vacantSlots = Math.max(0, maxSquadSize - currentSquadSize);
  const canAcquireMore = currentSquadSize < maxSquadSize;

  const meetsAuctionCompletionCriteria =
    currentSquadSize >= minSquadSize &&
    auctionPurchasesCount >= minAuctionPurchases &&
    allMandatoryBucketsFulfilled;

  return {
    isBelowMinimum,
    isWithinValidRange,
    isSquadFull,
    vacantSlots,
    canAcquireMore,
    meetsAuctionCompletionCriteria,
  };
}
