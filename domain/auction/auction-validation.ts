// =============================================================================
// ACC Auction Portal — Domain: Auction Bidding Validation
// =============================================================================
// Validates bid eligibility before committing to the database:
//   1. Lot must be currently 'in_progress'.
//   2. Franchise cannot outbid itself.
//   3. Franchise cannot exceed max squad size (22).
//   4. Bid amount must strictly match the next legal increment (no jump bids).
//   5. Bid amount cannot exceed franchise's Max Permissible Bid (Spec §20).
// =============================================================================

import {
  calculateMaxPermissibleBid,
  type MandatoryBucketDeficit,
  type MaxPermissibleBidResult,
} from '@/domain/franchises/max-bid';
import {
  validateBidAmount,
  type BidIncrementRule,
  type BidValidationResult,
} from './bid-increment';
import { validateBucketEligibility } from './bucket-eligibility';

export interface LotForBidValidation {
  id: string;
  status: string;
  current_price: number | null;
  base_price: number;
  highest_bidder_franchise_id: string | null;
  bucket: string;
}

export interface FranchiseForBidValidation {
  id: string;
  remainingPurse: number;
  squadCount: number;
  maxSquadSize?: number;
  auctionPurchasesSoFar: number;
  minAuctionPurchases?: number;
  minBasePrice?: number;
  mandatoryBucketDeficits: MandatoryBucketDeficit[];
}

export interface ValidateBidParams {
  lot: LotForBidValidation;
  franchise: FranchiseForBidValidation;
  proposedBid: number;
  bidIncrementRules?: BidIncrementRule[];
}

export interface BidEligibilityResult {
  eligible: boolean;
  reason?: string;
  expectedBid?: number;
  maxPermissibleBid?: number;
  maxBidDetails?: MaxPermissibleBidResult;
}

/**
 * Full domain validation for a proposed bid.
 */
export function validateBidEligibility(
  params: ValidateBidParams
): BidEligibilityResult {
  const { lot, franchise, proposedBid, bidIncrementRules } = params;

  // 1. Lot status must be 'in_progress'
  if (lot.status !== 'in_progress') {
    return {
      eligible: false,
      reason: `Bidding is not allowed. Lot status is '${lot.status}', expected 'in_progress'.`,
    };
  }

  // 2. Franchise cannot bid against itself
  if (lot.highest_bidder_franchise_id === franchise.id) {
    return {
      eligible: false,
      reason: 'Your franchise already holds the highest bid on this lot.',
    };
  }

  // 3. Squad size limit
  const maxSquad = franchise.maxSquadSize ?? 22;
  if (franchise.squadCount >= maxSquad) {
    return {
      eligible: false,
      reason: `Franchise squad is full (${franchise.squadCount}/${maxSquad} players).`,
    };
  }

  // 4. Increment ladder validation (rejection of jump bids and underbids)
  const incrementCheck: BidValidationResult = validateBidAmount(
    proposedBid,
    lot.current_price,
    lot.base_price,
    bidIncrementRules
  );

  if (!incrementCheck.valid) {
    return {
      eligible: false,
      expectedBid: incrementCheck.expectedBid,
      reason: incrementCheck.reason,
    };
  }

  // 5. Authoritative Max Permissible Bid calculation (Spec §20)
  const maxBidDetails = calculateMaxPermissibleBid({
    remainingPurse: franchise.remainingPurse,
    auctionPurchasesSoFar: franchise.auctionPurchasesSoFar,
    minAuctionPurchases: franchise.minAuctionPurchases ?? 15,
    minBasePrice: franchise.minBasePrice ?? 20,
    mandatoryBucketDeficits: franchise.mandatoryBucketDeficits,
  });

  if (proposedBid > maxBidDetails.maxBid) {
    return {
      eligible: false,
      expectedBid: incrementCheck.expectedBid,
      maxPermissibleBid: maxBidDetails.maxBid,
      maxBidDetails,
      reason: `Bid of ₹${proposedBid} exceeds your maximum permissible bid of ₹${maxBidDetails.maxBid}. ₹${maxBidDetails.reservedPurse} must be reserved for remaining mandatory squad acquisitions.`,
    };
  }

  // 6. Mandatory Bucket Eligibility Check (§12.2, Appendix A Cases 7-10)
  const remainingSlots = (franchise.minAuctionPurchases ?? 15) - franchise.auctionPurchasesSoFar;
  const bucketEligibility = validateBucketEligibility({
    remainingSlots,
    unfilledMandatoryDeficits: franchise.mandatoryBucketDeficits.map((d) => ({
      bucket: d.bucket,
      remainingNeeded: Math.max(0, d.minRequired - d.acquiredCount),
    })),
    targetBucket: lot.bucket,
    remainingPurse: franchise.remainingPurse,
    proposedBid,
    minBasePrice: franchise.minBasePrice ?? 20,
  });

  if (!bucketEligibility.isEligible) {
    return {
      eligible: false,
      expectedBid: incrementCheck.expectedBid,
      maxPermissibleBid: maxBidDetails.maxBid,
      maxBidDetails,
      reason: bucketEligibility.reason || 'Bid rejected: would strand mandatory bucket requirements (§12.2).',
    };
  }

  return {
    eligible: true,
    expectedBid: incrementCheck.expectedBid,
    maxPermissibleBid: maxBidDetails.maxBid,
    maxBidDetails,
  };
}
