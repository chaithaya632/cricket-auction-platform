// =============================================================================
// ACC Auction Portal — Domain: Bucket Progress Tracking
// =============================================================================

import type { AcquiredLotSummary, BucketRuleSummary } from './purse';

export interface BucketProgress {
  bucket: string;
  displayName: string;
  minPurchases: number;
  acquiredCount: number;
  isMandatory: boolean;
  isFulfilled: boolean;
  remainingNeeded: number;
}

export interface BucketProgressSummary {
  buckets: BucketProgress[];
  allMandatoryFulfilled: boolean;
  totalAcquired: number;
  mandatoryDeficitSum: number; // D
}

/**
 * Evaluates a franchise's acquired squad against the season's bucket quotas.
 */
export function calculateBucketProgress(
  bucketRules: (BucketRuleSummary & { displayName?: string })[],
  acquiredLots: AcquiredLotSummary[]
): BucketProgressSummary {
  const countMap: Record<string, number> = {};
  for (const rule of bucketRules) {
    countMap[rule.bucket] = 0;
  }

  for (const lot of acquiredLots) {
    countMap[lot.bucket] = (countMap[lot.bucket] || 0) + 1;
  }

  let allMandatoryFulfilled = true;
  let mandatoryDeficitSum = 0;

  const buckets: BucketProgress[] = bucketRules.map((rule) => {
    const acquiredCount = countMap[rule.bucket] || 0;
    const remainingNeeded = Math.max(0, rule.minPurchases - acquiredCount);
    const isFulfilled = remainingNeeded === 0;

    if (rule.isMandatory && !isFulfilled) {
      allMandatoryFulfilled = false;
      mandatoryDeficitSum += remainingNeeded;
    }

    return {
      bucket: rule.bucket,
      displayName: rule.displayName || rule.bucket,
      minPurchases: rule.minPurchases,
      acquiredCount,
      isMandatory: rule.isMandatory,
      isFulfilled,
      remainingNeeded,
    };
  });

  return {
    buckets,
    allMandatoryFulfilled,
    totalAcquired: acquiredLots.length,
    mandatoryDeficitSum,
  };
}
