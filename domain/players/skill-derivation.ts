// =============================================================================
// ACC Auction Portal — Domain: Player Skill Derivation (Spec §12)
// =============================================================================

import type { PlayerType } from '@/lib/constants';

export interface SkillSelection {
  is_batter: boolean;
  is_bowler: boolean;
  is_wicket_keeper: boolean;
  is_fielder_only: boolean;
}

export interface SkillValidationResult {
  isValid: boolean;
  error?: string;
  derivedPlayerType?: PlayerType;
}

/**
 * Validates skill questionnaire selections and enforces database constraints:
 * - is_fielder_only must only be true when is_batter, is_bowler, and is_wicket_keeper are all false.
 * - At least one skill or fielder_only must be chosen.
 */
export function validateSkills(skills: SkillSelection): SkillValidationResult {
  const { is_batter, is_bowler, is_wicket_keeper, is_fielder_only } = skills;

  if (is_fielder_only && (is_batter || is_bowler || is_wicket_keeper)) {
    return {
      isValid: false,
      error: 'Fielder-only cannot be selected alongside batting, bowling, or wicket-keeping skills.',
    };
  }

  if (!is_fielder_only && !is_batter && !is_bowler && !is_wicket_keeper) {
    return {
      isValid: false,
      error: 'Please select at least one primary cricket skill or confirm fielder-only participation.',
    };
  }

  const derivedPlayerType = derivePlayerType(skills);
  return {
    isValid: true,
    derivedPlayerType,
  };
}

/**
 * Pure function that computes the authoritative derived player type from questionnaire answers.
 *
 * Precedence:
 * 1. Fielder Only -> 'fielder'
 * 2. Wicket Keeper + Batter -> 'wicket_keeper_batter'
 * 3. Wicket Keeper -> 'wicket_keeper'
 * 4. Batter + Bowler -> 'all_rounder'
 * 5. Batter -> 'batter'
 * 6. Bowler -> 'bowler'
 */
export function derivePlayerType(skills: SkillSelection): PlayerType {
  const { is_batter, is_bowler, is_wicket_keeper, is_fielder_only } = skills;

  if (is_fielder_only) {
    return 'fielder';
  }

  if (is_wicket_keeper && is_batter) {
    return 'wicket_keeper_batter';
  }

  if (is_wicket_keeper) {
    return 'wicket_keeper';
  }

  if (is_batter && is_bowler) {
    return 'all_rounder';
  }

  if (is_batter) {
    return 'batter';
  }

  if (is_bowler) {
    return 'bowler';
  }

  return 'fielder';
}
