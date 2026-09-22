// =============================================================================
// ACC Auction Portal — Domain: Bidding Mechanics & Timer (Spec §11 & Appendix A.6)
// =============================================================================
// Rules:
// - Case 25: Current 90 -> tap Bid -> New 100 (+10)
// - Case 26: Current 100 -> tap Bid -> New 120 (+20)
// - Case 27: Current 200 -> tap Bid -> New 230 (+30)
// - Case 28: Current 50 -> attempted 150 -> rejected (no jump bidding)
// - Case 29: Bid placed with 2s remaining -> timer resets to full 20 seconds
// - Case 30: All 11 franchises press Pass -> timer continues to run; re-entry allowed
// - Case 31: Timer expires with highest bidder + no hammer -> no sale recorded (requires hammer)
// =============================================================================

import { TIMER } from '@/lib/constants';

export interface LotTimerState {
  remainingSeconds: number;
  isRunning: boolean;
  isExpired: boolean;
}

/**
 * Calculates the reset timer duration when a bid is placed.
 * Spec §11: "Timer: 30 seconds for the first bid, then 20 seconds after each bid,
 * resetting in full every time regardless of how little time remained."
 */
export function resetTimerOnBid(
  currentRemainingSeconds: number,
  isFirstBid: boolean = false
): number {
  return isFirstBid ? TIMER.FIRST_BID_SECONDS : TIMER.SUBSEQUENT_BID_SECONDS;
}

export interface FranchisePassState {
  franchiseId: string;
  hasPassed: boolean;
  canReEnter: boolean;
}

export interface AllPassEvaluationResult {
  allPassed: boolean;
  passedCount: number;
  totalFranchises: number;
  timerContinues: boolean;
  reEntryAllowed: boolean;
}

/**
 * Evaluates the condition where all franchises press Pass.
 * Spec §11: "The timer always runs its full course, even if all eleven franchises
 * have passed — the auctioneer uses that time to talk the room into re-entering.
 * Pass is reversible at any time before the hammer."
 */
export function evaluateAllPassCondition(
  franchises: FranchisePassState[],
  currentTimer: LotTimerState
): AllPassEvaluationResult {
  const totalFranchises = franchises.length;
  const passedCount = franchises.filter((f) => f.hasPassed).length;
  const allPassed = totalFranchises > 0 && passedCount === totalFranchises;

  return {
    allPassed,
    passedCount,
    totalFranchises,
    // Timer always continues to run; passing does NOT stop or expire the clock
    timerContinues: currentTimer.isRunning && !currentTimer.isExpired,
    // Re-entry is always allowed before the hammer is struck
    reEntryAllowed: true,
  };
}

export interface SaleCompletionParams {
  timerExpired: boolean;
  hammerPressed: boolean;
  highestBidderId: string | null;
  currentPrice: number | null;
}

export interface SaleCompletionResult {
  saleRecorded: boolean;
  lotStatus: 'in_progress' | 'sold' | 'unsold';
  reason?: string;
}

/**
 * Evaluates whether a sale can be recorded when timer expires or hammer is pressed.
 * Spec §11: "The sale completes only when the Super Admin presses the hammer.
 * A timer expiring does not itself sell the player. With no bids, the hammer marks
 * the player unsold."
 */
export function evaluateSaleCompletion(
  params: SaleCompletionParams
): SaleCompletionResult {
  const { timerExpired, hammerPressed, highestBidderId, currentPrice } = params;

  // The sale strictly requires the hammer
  if (hammerPressed) {
    if (highestBidderId && currentPrice !== null && currentPrice > 0) {
      return {
        saleRecorded: true,
        lotStatus: 'sold',
      };
    }
    return {
      saleRecorded: false,
      lotStatus: 'unsold',
      reason: 'Hammer pressed with no bids: player is marked unsold.',
    };
  }

  // If timer expired but hammer has not been pressed, NO sale is recorded
  if (timerExpired && !hammerPressed) {
    return {
      saleRecorded: false,
      lotStatus: 'in_progress',
      reason: 'Timer expired with highest bidder, hammer not yet pressed. No sale recorded — the sale requires the hammer.',
    };
  }

  return {
    saleRecorded: false,
    lotStatus: 'in_progress',
  };
}
