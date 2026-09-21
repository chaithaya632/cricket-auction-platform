import { describe, it, expect } from 'vitest';
import {
  derivePlayerType,
  validateSkills,
  isPlayerAuctionEligible,
} from '@/domain/players';

describe('Player Domain — Skill Derivation (Spec §12)', () => {
  it('derives fielder when is_fielder_only is true', () => {
    expect(
      derivePlayerType({
        is_batter: false,
        is_bowler: false,
        is_wicket_keeper: false,
        is_fielder_only: true,
      })
    ).toBe('fielder');
  });

  it('derives wicket_keeper_batter when both wicket_keeper and batter are true', () => {
    expect(
      derivePlayerType({
        is_batter: true,
        is_bowler: false,
        is_wicket_keeper: true,
        is_fielder_only: false,
      })
    ).toBe('wicket_keeper_batter');
  });

  it('derives wicket_keeper when only wicket_keeper is true', () => {
    expect(
      derivePlayerType({
        is_batter: false,
        is_bowler: false,
        is_wicket_keeper: true,
        is_fielder_only: false,
      })
    ).toBe('wicket_keeper');
  });

  it('derives all_rounder when both batter and bowler are true', () => {
    expect(
      derivePlayerType({
        is_batter: true,
        is_bowler: true,
        is_wicket_keeper: false,
        is_fielder_only: false,
      })
    ).toBe('all_rounder');
  });

  it('derives batter when only batter is true', () => {
    expect(
      derivePlayerType({
        is_batter: true,
        is_bowler: false,
        is_wicket_keeper: false,
        is_fielder_only: false,
      })
    ).toBe('batter');
  });

  it('derives bowler when only bowler is true', () => {
    expect(
      derivePlayerType({
        is_batter: false,
        is_bowler: true,
        is_wicket_keeper: false,
        is_fielder_only: false,
      })
    ).toBe('bowler');
  });
});

describe('Player Domain — Skill Validation (Constraints)', () => {
  it('accepts valid pure batter', () => {
    const res = validateSkills({
      is_batter: true,
      is_bowler: false,
      is_wicket_keeper: false,
      is_fielder_only: false,
    });
    expect(res.isValid).toBe(true);
    expect(res.derivedPlayerType).toBe('batter');
  });

  it('accepts valid pure fielder_only', () => {
    const res = validateSkills({
      is_batter: false,
      is_bowler: false,
      is_wicket_keeper: false,
      is_fielder_only: true,
    });
    expect(res.isValid).toBe(true);
    expect(res.derivedPlayerType).toBe('fielder');
  });

  it('rejects fielder_only when selected alongside batter/bowler/keeper', () => {
    const resWithBatter = validateSkills({
      is_batter: true,
      is_bowler: false,
      is_wicket_keeper: false,
      is_fielder_only: true,
    });
    expect(resWithBatter.isValid).toBe(false);
    expect(resWithBatter.error).toContain('Fielder-only cannot be selected');

    const resWithBowler = validateSkills({
      is_batter: false,
      is_bowler: true,
      is_wicket_keeper: false,
      is_fielder_only: true,
    });
    expect(resWithBowler.isValid).toBe(false);

    const resWithKeeper = validateSkills({
      is_batter: false,
      is_bowler: false,
      is_wicket_keeper: true,
      is_fielder_only: true,
    });
    expect(resWithKeeper.isValid).toBe(false);
  });

  it('rejects when no skill is selected', () => {
    const res = validateSkills({
      is_batter: false,
      is_bowler: false,
      is_wicket_keeper: false,
      is_fielder_only: false,
    });
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('Please select at least one primary cricket skill');
  });
});

describe('Player Domain — Auction Eligibility (Spec §8, §13)', () => {
  it('returns true when payment is paid, skills submitted, and status is eligible', () => {
    expect(
      isPlayerAuctionEligible({
        registrationStatus: 'eligible',
        paymentStatus: 'paid',
        cricHeroesStatus: 'verified',
        hasSkillProfile: true,
      })
    ).toBe(true);
  });

  it('returns false if skill profile is missing', () => {
    expect(
      isPlayerAuctionEligible({
        registrationStatus: 'eligible',
        paymentStatus: 'paid',
        cricHeroesStatus: 'verified',
        hasSkillProfile: false,
      })
    ).toBe(false);
  });

  it('returns false if registration is unpaid', () => {
    expect(
      isPlayerAuctionEligible({
        registrationStatus: 'eligible',
        paymentStatus: 'unpaid',
        cricHeroesStatus: 'verified',
        hasSkillProfile: true,
      })
    ).toBe(false);
  });

  it('returns false if registration status is draft or under_review or ineligible', () => {
    expect(
      isPlayerAuctionEligible({
        registrationStatus: 'draft',
        paymentStatus: 'paid',
        cricHeroesStatus: 'verified',
        hasSkillProfile: true,
      })
    ).toBe(false);

    expect(
      isPlayerAuctionEligible({
        registrationStatus: 'pending_verification',
        paymentStatus: 'paid',
        cricHeroesStatus: 'verified',
        hasSkillProfile: true,
      })
    ).toBe(false);

    expect(
      isPlayerAuctionEligible({
        registrationStatus: 'ineligible',
        paymentStatus: 'paid',
        cricHeroesStatus: 'verified',
        hasSkillProfile: true,
      })
    ).toBe(false);
  });
});
