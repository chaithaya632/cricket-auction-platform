// =============================================================================
// ACC Auction Portal — Domain: Referral Program Rules (Spec §5, §6 & Appendix A.5)
// =============================================================================
// Rules:
// - Referred players are restricted to students admitted in the current academic year
//   (e.g., 2026 for 2026-27).
// - This includes regular first-years, new lateral entrants (in 2nd year), or new diploma/PG admissions.
// - Lateral entrants admitted in earlier years (e.g. 2025) are NOT new admissions and must not see the question.
// - Up to 5 referred players per franchise.
// - Referred players cost nothing, sit outside the 15 auction purchases, and occupy no auction slot.
// =============================================================================

import { SQUAD_RULES } from '@/lib/constants';

/**
 * Checks if the reference-program question should be shown to a student during registration.
 * Spec §5 & Case 24:
 * The question appears when admission year equals current academic year.
 */
export function shouldShowReferralQuestion(
  admissionYear: number | undefined,
  currentAcademicYear: number = 2026
): boolean {
  if (!admissionYear) {
    return false;
  }
  return admissionYear === currentAcademicYear;
}

export interface FranchiseReferralState {
  franchiseId: string;
  referralCount: number;
  maxReferrals?: number;
}

/**
 * Checks if a franchise has capacity for an additional referred player.
 */
export function canAddReferral(state: FranchiseReferralState): boolean {
  const max = state.maxReferrals ?? SQUAD_RULES.MAX_REFERRALS;
  return state.referralCount < max;
}

export interface ReferralConflictCheckParams {
  claimingFranchiseId: string;
  playerDeclaredFranchiseId?: string | null;
  existingReferrals: Array<{
    franchiseId: string;
    status: 'pending' | 'approved' | 'rejected' | 'conflict';
  }>;
}

export interface ReferralConflictResult {
  hasConflict: boolean;
  status: 'pending' | 'conflict';
  reason?: string;
}

/**
 * Evaluates whether a referral claim has conflicts (§6).
 * Surfacing conflicts:
 * - Two franchises claim the same player
 * - Player self-declaration disagrees with franchise claim
 */
export function evaluateReferralConflict(params: ReferralConflictCheckParams): ReferralConflictResult {
  const { claimingFranchiseId, playerDeclaredFranchiseId, existingReferrals } = params;

  // 1. Check if another franchise has an active claim (pending or approved) on this player
  const competingClaims = existingReferrals.filter(
    (r) => r.franchiseId !== claimingFranchiseId && (r.status === 'pending' || r.status === 'approved')
  );

  if (competingClaims.length > 0) {
    return {
      hasConflict: true,
      status: 'conflict',
      reason: 'Conflict detected: Multiple franchises have claimed this player as a referral (§6).',
    };
  }

  // 2. Check if player self-declared a different franchise
  if (playerDeclaredFranchiseId && playerDeclaredFranchiseId !== claimingFranchiseId) {
    return {
      hasConflict: true,
      status: 'conflict',
      reason: 'Conflict detected: Player declared a different referring franchise during registration (§6).',
    };
  }

  return {
    hasConflict: false,
    status: 'pending',
  };
}
