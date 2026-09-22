// =============================================================================
// ACC Auction Portal — Domain: Scarcity Detection (Spec §12.3, §13 & Appendix A.3)
// =============================================================================
// Rules:
// - Track continuously: unsold players in bucket vs total players needed across all franchises.
// - Supply counted against players needed, not number of teams (Case 13: 6 franchises
//   where 2 need 2 each -> threshold is 8, not 6).
// - Scarcity warning raised the moment remaining supply drops to or below total needed
//   (unsoldSupply <= totalPlayersNeeded).
// - Surfaces: admin, projector, public views.
// - Bidding is NEVER blocked by scarcity (free market; teams with min met may still bid).
// - Genuine exhaustion (0 unsold, needed > 0) routes affected franchises to scouting
//   under §13 with no vote required.
// - If an undone sale returns a player to the pool and supply > need, warning clears immediately.
// =============================================================================

export interface FranchiseBucketNeed {
  franchiseId: string;
  franchiseName?: string;
  needed: number;
}

export interface BucketScarcityParams {
  bucket: string;
  unsoldSupply: number;
  franchiseNeeds: FranchiseBucketNeed[];
}

export interface BucketScarcityReport {
  bucket: string;
  unsoldSupply: number;
  totalPlayersNeeded: number;
  franchisesNeedingCount: number;
  threshold: number;
  isWarningActive: boolean;
  isExhausted: boolean;
  routedToScouting: boolean;
  warningSurfaces: ('admin' | 'projector' | 'public')[];
  biddingAllowed: boolean;
}

/**
 * Calculates the exact scarcity threshold for a bucket.
 * Spec §12.3 & Case 13: "supply counted against players needed, not teams"
 */
export function calculateScarcityThreshold(
  franchiseNeeds: FranchiseBucketNeed[]
): number {
  return franchiseNeeds.reduce((sum, item) => sum + Math.max(0, item.needed), 0);
}

/**
 * Evaluates bucket scarcity state based on unsold supply and franchise requirements.
 */
export function detectBucketScarcity(
  params: BucketScarcityParams
): BucketScarcityReport {
  const { bucket, unsoldSupply, franchiseNeeds } = params;

  const totalPlayersNeeded = calculateScarcityThreshold(franchiseNeeds);
  const franchisesNeedingCount = franchiseNeeds.filter((f) => f.needed > 0).length;

  const threshold = totalPlayersNeeded;
  const isExhausted = unsoldSupply === 0 && totalPlayersNeeded > 0;
  const isWarningActive = unsoldSupply > 0 && unsoldSupply <= threshold;
  const routedToScouting = isExhausted;

  const warningSurfaces: ('admin' | 'projector' | 'public')[] =
    isWarningActive || isExhausted ? ['admin', 'projector', 'public'] : [];

  return {
    bucket,
    unsoldSupply,
    totalPlayersNeeded,
    franchisesNeedingCount,
    threshold,
    isWarningActive,
    isExhausted,
    routedToScouting,
    warningSurfaces,
    // Spec §12.3: "No franchise is ever restricted from bidding on a player it can legally afford."
    biddingAllowed: true,
  };
}

/**
 * Recalculates scarcity after an undone sale returns a player to the pool.
 * Case 15: "Warning clears immediately if supply again exceeds need."
 */
export function recalculateScarcityAfterUndo(
  currentReport: BucketScarcityReport,
  restoredPlayerBucket: string,
  buyerFranchiseId: string,
  franchiseNeeds: FranchiseBucketNeed[]
): BucketScarcityReport {
  if (restoredPlayerBucket !== currentReport.bucket) {
    return currentReport;
  }

  const newSupply = currentReport.unsoldSupply + 1;
  return detectBucketScarcity({
    bucket: currentReport.bucket,
    unsoldSupply: newSupply,
    franchiseNeeds,
  });
}
