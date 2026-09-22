// =============================================================================
// ACC Auction Portal — Domain: Bucket Eligibility (Spec §12.2 & Appendix A.2)
// =============================================================================
// "A franchise that has one slot left and still needs a diploma player must not
// be allowed to spend that slot on anyone else. Work out what conditions make
// a bid illegal, and block it at the point of bidding."
//
// Rules:
// - If a franchise has remainingSlots available before reaching squad cap/target.
// - Each unfilled mandatory bucket requires at least 1 remaining slot.
// - Bidding on a player whose bucket does NOT satisfy an unfilled deficit will
//   consume a slot without reducing the deficit.
// - If (remainingSlots - 1) < remainingDeficit, the bid MUST BE BLOCKED.
// =============================================================================

export interface CheckBucketEligibilityParams {
  remainingSlots: number;
  unfilledMandatoryDeficits: Record<string, number> | Array<{ bucket: string; remainingNeeded: number }>;
  targetBucket: string;
  remainingPurse?: number;
  proposedBid?: number;
  minBasePrice?: number;
}

export interface BucketEligibilityResult {
  isEligible: boolean;
  reason?: string;
  totalDeficit: number;
  remainingSlotsAfterPurchase: number;
  deficitAfterPurchase: number;
}

/**
 * Normalizes deficits into a Record<string, number> mapping bucket name to remaining needed.
 */
function normalizeDeficits(
  deficits: Record<string, number> | Array<{ bucket: string; remainingNeeded: number }>
): Record<string, number> {
  if (Array.isArray(deficits)) {
    const map: Record<string, number> = {};
    for (const item of deficits) {
      map[item.bucket] = item.remainingNeeded;
    }
    return map;
  }
  return { ...deficits };
}

/**
 * Pure evaluation of bucket eligibility for a proposed bid.
 * Enforces that a franchise never consumes a slot needed for a mandatory bucket deficit.
 */
export function validateBucketEligibility(
  params: CheckBucketEligibilityParams
): BucketEligibilityResult {
  const {
    remainingSlots,
    unfilledMandatoryDeficits,
    targetBucket,
    remainingPurse,
    proposedBid,
  } = params;

  const deficitMap = normalizeDeficits(unfilledMandatoryDeficits);

  // Total mandatory slots still needed across all mandatory buckets (B1..B5)
  let totalDeficit = 0;
  for (const count of Object.values(deficitMap)) {
    totalDeficit += Math.max(0, count);
  }

  // Check if target player reduces deficit for targetBucket
  const currentBucketDeficit = Math.max(0, deficitMap[targetBucket] ?? 0);
  const satisfiesDeficit = currentBucketDeficit > 0;

  const deficitAfterPurchase = satisfiesDeficit ? totalDeficit - 1 : totalDeficit;
  const remainingSlotsAfterPurchase = remainingSlots - 1;

  // 1. Slot deficit check: must have enough slots left for remaining mandatory quotas
  if (remainingSlotsAfterPurchase < deficitAfterPurchase) {
    return {
      isEligible: false,
      reason: `Blocked: Franchise has ${remainingSlots} slot(s) remaining and still needs ${totalDeficit} mandatory player(s). Acquiring a ${targetBucket} player would leave ${remainingSlotsAfterPurchase} slot(s) for ${deficitAfterPurchase} unfilled mandatory requirement(s).`,
      totalDeficit,
      remainingSlotsAfterPurchase,
      deficitAfterPurchase,
    };
  }

  // 2. Purse check if proposedBid and remainingPurse are provided
  if (remainingPurse !== undefined && proposedBid !== undefined) {
    if (proposedBid > remainingPurse) {
      return {
        isEligible: false,
        reason: `Blocked: Proposed bid of ₹${proposedBid} exceeds available purse of ₹${remainingPurse}.`,
        totalDeficit,
        remainingSlotsAfterPurchase,
        deficitAfterPurchase,
      };
    }
  }

  return {
    isEligible: true,
    totalDeficit,
    remainingSlotsAfterPurchase,
    deficitAfterPurchase,
  };
}
