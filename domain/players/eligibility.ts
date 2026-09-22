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

export interface DetailedEligibilityInputs {
  hasProfile: boolean;
  fullName?: string | null;
  rollNumber?: string | null;
  mobile?: string | null;
  photoUrl?: string | null;
  hasRegistration: boolean;
  programme?: string | null;
  academicYear?: number | null;
  branch?: string | null;
  bucket?: string | null;
  hasSkillProfile: boolean;
  paymentStatus: 'unpaid' | 'paid';
  cricHeroesStatus: CricHeroesStatus;
  cricHeroesUrl?: string | null;
  registrationStatus: RegistrationStatus;
  isActive: boolean; // false if blocked by admin
}

export interface PlayerEligibilityBreakdown {
  isEligible: boolean;
  profileComplete: boolean;
  academicVerified: boolean;
  registrationComplete: boolean;
  skillProfileComplete: boolean;
  paymentVerified: boolean;
  cricHeroesVerified: boolean;
  adminApproved: boolean;
  notBlocked: boolean;
  missingRequirements: string[];
}

/**
 * Computes the authoritative step-by-step eligibility breakdown for a player.
 * Explains exactly why a player is or is not auction eligible.
 */
export function evaluatePlayerEligibility(
  inputs: DetailedEligibilityInputs
): PlayerEligibilityBreakdown {
  const missingRequirements: string[] = [];

  const profileComplete = Boolean(
    inputs.hasProfile &&
    inputs.fullName &&
    inputs.fullName.trim().length >= 2 &&
    inputs.rollNumber &&
    inputs.rollNumber !== 'PENDING' &&
    inputs.mobile
  );
  if (!profileComplete) {
    missingRequirements.push('Player personal profile incomplete (name, roll number, or contact mobile missing)');
  }

  const academicVerified = Boolean(
    inputs.programme &&
    inputs.academicYear &&
    inputs.bucket
  );
  if (!academicVerified) {
    missingRequirements.push('Academic classification pending or unverified');
  }

  const registrationComplete = Boolean(
    inputs.hasRegistration &&
    inputs.bucket &&
    inputs.registrationStatus !== 'draft'
  );
  if (!registrationComplete) {
    missingRequirements.push('Season tournament registration not submitted');
  }

  const skillProfileComplete = Boolean(inputs.hasSkillProfile);
  if (!skillProfileComplete) {
    missingRequirements.push('Cricket skill questionnaire not submitted');
  }

  const paymentVerified = inputs.paymentStatus === 'paid';
  if (!paymentVerified) {
    missingRequirements.push('Tournament entry fee payment not verified (offline fee pending)');
  }

  const cricHeroesVerified = inputs.cricHeroesStatus === 'verified';
  if (!cricHeroesVerified) {
    if (inputs.cricHeroesStatus === 'profile_creation_pending') {
      missingRequirements.push('CricHeroes profile creation pending by student');
    } else if (inputs.cricHeroesStatus === 'rejected') {
      missingRequirements.push('CricHeroes profile was rejected by tournament coordinators');
    } else {
      missingRequirements.push('CricHeroes profile verification pending');
    }
  }

  const notBlocked = inputs.isActive !== false;
  if (!notBlocked) {
    missingRequirements.push('Player account is currently blocked from participation by Super Admin');
  }

  const adminApproved =
    inputs.registrationStatus === 'eligible' ||
    (inputs.registrationStatus === 'pending_verification' && missingRequirements.length === 0);

  if (inputs.registrationStatus === 'ineligible') {
    missingRequirements.push('Registration marked as ineligible by administrator');
  }

  const isEligible =
    profileComplete &&
    academicVerified &&
    registrationComplete &&
    skillProfileComplete &&
    paymentVerified &&
    cricHeroesVerified &&
    notBlocked &&
    inputs.registrationStatus === 'eligible';

  return {
    isEligible,
    profileComplete,
    academicVerified,
    registrationComplete,
    skillProfileComplete,
    paymentVerified,
    cricHeroesVerified,
    adminApproved,
    notBlocked,
    missingRequirements,
  };
}

/**
 * Determines whether a registered player is eligible to enter the live auction pool.
 * A player is eligible when their payment is completed, skills submitted, and registration verified.
 */
export function isPlayerAuctionEligible(inputs: EligibilityInputs): boolean {
  const { registrationStatus, paymentStatus, hasSkillProfile, cricHeroesStatus } = inputs;

  if (!hasSkillProfile) {
    return false;
  }

  if (paymentStatus !== 'paid') {
    return false;
  }

  if (registrationStatus === 'ineligible') {
    return false;
  }

  if (cricHeroesStatus && cricHeroesStatus !== 'verified') {
    return false;
  }

  return registrationStatus === 'eligible';
}
