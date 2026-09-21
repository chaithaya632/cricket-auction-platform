// =============================================================================
// ACC Auction Portal — Domain: Registration Eligibility (Spec §8, §13)
// =============================================================================

import type { RegistrationStatus, CricHeroesStatus } from '@/lib/constants';

export interface EligibilityInputs {
  registrationStatus: RegistrationStatus;
  paymentStatus: 'unpaid' | 'paid';
  cricHeroesStatus: CricHeroesStatus;
  hasSkillProfile: boolean;
}

/**
 * Determines whether a registered player is eligible to enter the live auction pool.
 * A player is eligible when their payment is completed, skills submitted, and registration verified.
 */
export function isPlayerAuctionEligible(inputs: EligibilityInputs): boolean {
  const { registrationStatus, paymentStatus, hasSkillProfile } = inputs;

  if (!hasSkillProfile) {
    return false;
  }

  if (paymentStatus !== 'paid') {
    return false;
  }

  if (registrationStatus === 'ineligible') {
    return false;
  }

  return registrationStatus === 'eligible';
}
