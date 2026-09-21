import { describe, it, expect } from 'vitest';
import {
  playerProfileSchema,
  playerRegistrationSchema,
  playerSkillSchema,
} from '@/lib/players/validation';
import { BASE_PRICE_LADDER } from '@/lib/constants';

describe('Player Application — Profile Validation Schema', () => {
  it('validates correct profile data', () => {
    const valid = {
      full_name: 'Rohit Sharma',
      roll_number: '22811A0501',
      mobile: '9876543210',
      photo_url: 'https://example.com/photo.jpg',
    };
    const result = playerProfileSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('accepts optional or empty photo_url', () => {
    const validNoPhoto = {
      full_name: 'Rohit Sharma',
      roll_number: '22811A0501',
      mobile: '9876543210',
      photo_url: '',
    };
    expect(playerProfileSchema.safeParse(validNoPhoto).success).toBe(true);
  });

  it('rejects short full_name', () => {
    const invalid = {
      full_name: 'R',
      roll_number: '22811A0501',
      mobile: '9876543210',
    };
    const result = playerProfileSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects invalid mobile numbers', () => {
    // Starts with 5 (invalid Indian mobile)
    expect(
      playerProfileSchema.safeParse({
        full_name: 'Test Player',
        roll_number: '22811A0501',
        mobile: '5123456789',
      }).success
    ).toBe(false);

    // 9 digits
    expect(
      playerProfileSchema.safeParse({
        full_name: 'Test Player',
        roll_number: '22811A0501',
        mobile: '987654321',
      }).success
    ).toBe(false);

    // Non-numeric
    expect(
      playerProfileSchema.safeParse({
        full_name: 'Test Player',
        roll_number: '22811A0501',
        mobile: '987654321a',
      }).success
    ).toBe(false);
  });
});

describe('Player Application — Registration Validation Schema', () => {
  it('accepts base prices from the official 16-tier ladder', () => {
    for (const price of BASE_PRICE_LADDER) {
      const result = playerRegistrationSchema.safeParse({
        roll_number: '22811A0501',
        base_price: price,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects arbitrary base prices outside the ladder', () => {
    const invalidPrices = [0, 10, 25, 45, 99, 300, -20];
    for (const price of invalidPrices) {
      const result = playerRegistrationSchema.safeParse({
        roll_number: '22811A0501',
        base_price: price,
      });
      expect(result.success).toBe(false);
    }
  });

  it('validates optional CricHeroes profile url and mobile', () => {
    const valid = {
      roll_number: '22811A0501',
      base_price: 20,
      cricheroes_url: 'https://cricheroes.com/player-profile/12345/player-name',
      cricheroes_registered_mobile: '9876543210',
    };
    expect(playerRegistrationSchema.safeParse(valid).success).toBe(true);

    const invalidUrl = {
      roll_number: '22811A0501',
      base_price: 20,
      cricheroes_url: 'not-a-valid-url',
    };
    expect(playerRegistrationSchema.safeParse(invalidUrl).success).toBe(false);
  });
});

describe('Player Application — Skill Profile Schema', () => {
  it('validates skill choices and styles', () => {
    const valid = {
      is_batter: true,
      batting_style: 'right_hand' as const,
      batting_order: 'top_order' as const,
      is_bowler: true,
      bowling_style: 'right_arm_medium' as const,
      is_wicket_keeper: false,
      is_fielder_only: false,
      fielding_position: 'Mid-wicket',
      experience_years: 4,
      experience_description: 'College team vice-captain',
    };
    expect(playerSkillSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects invalid bowling or batting styles', () => {
    const invalid = {
      is_batter: true,
      batting_style: 'ambidextrous', // Not in enum
      is_bowler: false,
      is_wicket_keeper: false,
      is_fielder_only: false,
    };
    expect(playerSkillSchema.safeParse(invalid).success).toBe(false);
  });
});
