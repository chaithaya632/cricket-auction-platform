// =============================================================================
// ACC Auction Portal — Domain: Multi-Lot Safe Undo & State Recalculation (Spec §12.4 & Appendix A.4)
// =============================================================================
// Rules:
// - Case 16: A sale from 40 lots ago is undone.
//   -> Purse refunded, slot freed, player returned to pool, all limits recalculated, history preserved.
// - Case 17: Undone sale was franchise's only diploma player.
//   -> Diploma minimum becomes unmet again; max bid & bucket eligibility update immediately.
// - Case 18: Same sale is undone twice.
//   -> Second attempt rejected — no double refund.
// =============================================================================

import {
  calculateMaxPermissibleBid,
  type MandatoryBucketDeficit,
  type MaxPermissibleBidResult,
} from '@/domain/franchises/max-bid';
import {
  validateBucketEligibility,
  type BucketEligibilityResult,
} from '@/domain/auction/bucket-eligibility';

export interface LotRecord {
  id: string;
  lotNumber: number;
  bucket: string;
  salePrice: number;
  buyerFranchiseId: string;
  status: 'sold' | 'pending' | 'in_progress' | 'unsold';
  isUndone?: boolean;
}

export interface FranchiseStateSnapshot {
  id: string;
  purse: number;
  auctionPurchases: number;
  squadCount: number;
  bucketCounts: Record<string, number>;
  maxSquadSize?: number;
  minAuctionPurchases?: number;
  minBasePrice?: number;
}

export interface UndoExecutionResult {
  success: boolean;
  error?: string;
  updatedLot?: LotRecord;
  updatedFranchise?: FranchiseStateSnapshot;
  maxBidResult?: MaxPermissibleBidResult;
  historyEventRecorded?: boolean;
  undoEvent?: {
    eventType: 'UNDO_SALE';
    lotId: string;
    franchiseId: string;
    refundAmount: number;
    timestamp: string;
  };
}

/**
 * Pure domain executor for undoing a sale safely, whether from the previous lot or 40 lots ago.
 */
export function executeDomainUndo(
  targetLot: LotRecord,
  franchiseState: FranchiseStateSnapshot,
  mandatoryMinPerBucket: number = 2
): UndoExecutionResult {
  // Case 18: Reject double undo — lot must be currently 'sold' and not already undone
  if (targetLot.status !== 'sold' || targetLot.isUndone) {
    return {
      success: false,
      error: `Second attempt rejected — no double refund. Lot ${targetLot.id} status is '${targetLot.status}', isUndone: ${targetLot.isUndone}.`,
    };
  }

  // 1. Refund purse and free slot
  const newPurse = franchiseState.purse + targetLot.salePrice;
  const newAuctionPurchases = Math.max(0, franchiseState.auctionPurchases - 1);
  const newSquadCount = Math.max(0, franchiseState.squadCount - 1);

  // 2. Decrement bucket count
  const newBucketCounts = { ...franchiseState.bucketCounts };
  if (newBucketCounts[targetLot.bucket] !== undefined) {
    newBucketCounts[targetLot.bucket] = Math.max(0, newBucketCounts[targetLot.bucket] - 1);
  }

  // 3. Mark lot as undone and return player to pool
  const updatedLot: LotRecord = {
    ...targetLot,
    status: 'pending',
    isUndone: true,
  };

  // 4. Update franchise state
  const updatedFranchise: FranchiseStateSnapshot = {
    ...franchiseState,
    purse: newPurse,
    auctionPurchases: newAuctionPurchases,
    squadCount: newSquadCount,
    bucketCounts: newBucketCounts,
  };

  // 5. Recalculate mandatory deficits
  const mandatoryBuckets = ['B1', 'B2', 'B3', 'B4', 'B5'];
  const mandatoryBucketDeficits: MandatoryBucketDeficit[] = mandatoryBuckets.map((b) => ({
    bucket: b,
    minRequired: mandatoryMinPerBucket,
    acquiredCount: newBucketCounts[b] || 0,
  }));

  // 6. Recalculate max permissible bid immediately
  const maxBidResult = calculateMaxPermissibleBid({
    remainingPurse: newPurse,
    auctionPurchasesSoFar: newAuctionPurchases,
    minAuctionPurchases: franchiseState.minAuctionPurchases ?? 15,
    minBasePrice: franchiseState.minBasePrice ?? 20,
    mandatoryBucketDeficits,
  });

  // 7. Audit log event for history preservation
  const undoEvent = {
    eventType: 'UNDO_SALE' as const,
    lotId: targetLot.id,
    franchiseId: franchiseState.id,
    refundAmount: targetLot.salePrice,
    timestamp: new Date().toISOString(),
  };

  return {
    success: true,
    updatedLot,
    updatedFranchise,
    maxBidResult,
    historyEventRecorded: true,
    undoEvent,
  };
}
