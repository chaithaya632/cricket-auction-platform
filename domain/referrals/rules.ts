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
