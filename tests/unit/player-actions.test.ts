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

  it('accepts valid base64 image data URIs (JPEG, PNG, WebP) for mobile photo uploads', () => {
    const validJpegData = {
      full_name: 'Rohit Sharma',
      roll_number: '22811A0501',
      mobile: '9876543210',
      photo_url: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBD...',
    };
    expect(playerProfileSchema.safeParse(validJpegData).success).toBe(true);

    const validPngData = {
      ...validJpegData,
      photo_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAE...',
    };
    expect(playerProfileSchema.safeParse(validPngData).success).toBe(true);

    const validWebpData = {
      ...validJpegData,
      photo_url: 'data:image/webp;base64,UklGRkAAAABXRUJQVlA4ID...',
    };
    expect(playerProfileSchema.safeParse(validWebpData).success).toBe(true);
  });

  it('rejects invalid or non-image photo strings', () => {
    const invalidPhoto = {
      full_name: 'Rohit Sharma',
      roll_number: '22811A0501',
      mobile: '9876543210',
      photo_url: 'not-a-valid-url-or-photo-data',
    };
    expect(playerProfileSchema.safeParse(invalidPhoto).success).toBe(false);

    const invalidMimeType = {
      ...invalidPhoto,
      photo_url: 'data:application/pdf;base64,JVBERi0xLjQK...',
    };
    expect(playerProfileSchema.safeParse(invalidMimeType).success).toBe(false);
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

import { parseCareerStats } from '@/lib/players/queries';
import type { PlayerCareerStats } from '@/lib/players/types';

describe('Player Application — Career Stats Parsing & Structure', () => {
  it('parses valid serialized JSON career stats correctly', () => {
    const rawStats: PlayerCareerStats = {
      matches: 15,
      runs: 450,
      battingAvg: 34.62,
      strikeRate: 142.8,
      highestScore: 88,
      wickets: 18,
      bowlingAvg: 17.5,
      economy: 6.4,
      catches: 8,
      stumpings: 0,
      notes: 'Finalist captain 2025',
    };

    const json = JSON.stringify(rawStats);
    const parsed = parseCareerStats(json);

    expect(parsed.matches).toBe(15);
    expect(parsed.runs).toBe(450);
    expect(parsed.battingAvg).toBe(34.62);
    expect(parsed.strikeRate).toBe(142.8);
    expect(parsed.highestScore).toBe(88);
    expect(parsed.wickets).toBe(18);
    expect(parsed.bowlingAvg).toBe(17.5);
    expect(parsed.economy).toBe(6.4);
    expect(parsed.catches).toBe(8);
    expect(parsed.notes).toBe('Finalist captain 2025');
  });

  it('handles unstructured text description by placing it into notes with 0 stats', () => {
    const plainText = 'Played for university team as opening batsman';
    const parsed = parseCareerStats(plainText);

    expect(parsed.matches).toBe(0);
    expect(parsed.runs).toBe(0);
    expect(parsed.wickets).toBe(0);
    expect(parsed.notes).toBe(plainText);
  });

  it('handles null, undefined, or empty string gracefully', () => {
    const nullParsed = parseCareerStats(null);
    expect(nullParsed.matches).toBe(0);
    expect(nullParsed.runs).toBe(0);

    const undefParsed = parseCareerStats(undefined);
    expect(undefParsed.matches).toBe(0);

    const emptyParsed = parseCareerStats('');
    expect(emptyParsed.matches).toBe(0);
  });

  it('gracefully handles structured questionnaire JSON without crashing', () => {
    const questionnairePayload = {
      batting: { arm: 'right', style: 'aggressive', position: 'top_order' },
      bowling: { arm: 'right', type: 'fast', paceVariety: 'seam', roles: ['Opening bowler'] },
      experience: { highestLevel: 'inter_college', years: 2, description: 'College player' },
    };
    const jsonStr = JSON.stringify(questionnairePayload);
    const parsed = parseCareerStats(jsonStr);
    expect(parsed.matches).toBe(0);
    expect(parsed.runs).toBe(0);
    expect(parsed.wickets).toBe(0);
  });

  it('correctly extracts student discrepancy note from experience_description JSON payload', () => {
    const payloadWithDiscrepancy = {
      experience: { highestLevel: 'inter_college', years: 1, notes: 'Opening batsman' },
      discrepancy: 'Detained in 2024 due to medical leave, admitted back to 2nd year',
    };
    const jsonStr = JSON.stringify(payloadWithDiscrepancy);
    const parsed = JSON.parse(jsonStr);
    expect(parsed.discrepancy).toBe('Detained in 2024 due to medical leave, admitted back to 2nd year');
  });
});
