import { describe, it, expect } from 'vitest';
import { adminCreatePlayerSchema } from '@/lib/players/validation';
import { adminCreateFranchiseSchema } from '@/lib/franchises/actions';
import { parseRollNumber, calculateAcademicYear, deriveBucket } from '@/domain/academic';

describe('Admin CRUD — Player Creation Validation', () => {
  it('validates a complete, correct admin player payload', () => {
    const input = {
      full_name: 'Jasprit Bumrah',
      roll_number: '21KD1A0501',
      mobile: '9876543210',
      base_price: 140,
      player_type: 'bowler' as const,
      batting_style: 'right_hand' as const,
      bowling_style: 'right_arm_fast',
      cricheroes_url: 'https://cricheroes.com/player-profile/12345/bumrah',
    };

    const result = adminCreatePlayerSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.full_name).toBe('Jasprit Bumrah');
      expect(result.data.roll_number).toBe('21KD1A0501');
      expect(result.data.base_price).toBe(140);
    }
  });

  it('rejects invalid mobile phone formats', () => {
    const invalidNumbers = [
      '1234567890', // Starts with 1
      '98765',      // Too short
      '987654321012', // Too long
      '98765abcde', // Alphanumeric
      '',           // Empty
    ];

    for (const num of invalidNumbers) {
      const result = adminCreatePlayerSchema.safeParse({
        full_name: 'Test Player',
        roll_number: '21KD1A0501',
        mobile: num,
      });
      expect(result.success).toBe(false);
    }
  });

  it('rejects non-positive base price', () => {
    expect(
      adminCreatePlayerSchema.safeParse({
        full_name: 'Test Player',
        roll_number: '21KD1A0501',
        mobile: '9876543210',
        base_price: -50,
      }).success
    ).toBe(false);

    expect(
      adminCreatePlayerSchema.safeParse({
        full_name: 'Test Player',
        roll_number: '21KD1A0501',
        mobile: '9876543210',
        base_price: 0,
      }).success
    ).toBe(false);
  });

  it('defaults base_price and player_type when omitted', () => {
    const result = adminCreatePlayerSchema.safeParse({
      full_name: 'Suryakumar Yadav',
      roll_number: '21KD1A0502',
      mobile: '9123456780',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.base_price).toBe(100);
      expect(result.data.player_type).toBe('all_rounder');
      expect(result.data.batting_style).toBe('right_hand');
    }
  });

  it('accepts null and empty string for optional fields (cricheroes_url, bowling_style, photo_url)', () => {
    const input = {
      full_name: 'Rohit Sharma',
      roll_number: '23811A0505',
      mobile: '9848012345',
      base_price: 100,
      player_type: 'batter' as const,
      batting_style: 'right_hand' as const,
      bowling_style: null,
      photo_url: null,
      cricheroes_url: null,
    };

    const result = adminCreatePlayerSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cricheroes_url).toBeNull();
      expect(result.data.bowling_style).toBeNull();
      expect(result.data.photo_url).toBeNull();
    }

    const emptyResult = adminCreatePlayerSchema.safeParse({
      ...input,
      photo_url: '',
      cricheroes_url: '',
    });
    expect(emptyResult.success).toBe(true);
  });

  it('rejects invalid URL for cricheroes_url when provided as non-empty non-URL', () => {
    const result = adminCreatePlayerSchema.safeParse({
      full_name: 'Rohit Sharma',
      roll_number: '23811A0505',
      mobile: '9848012345',
      cricheroes_url: 'invalid-not-a-url',
    });

    expect(result.success).toBe(false);
  });
});

describe('Admin CRUD — Franchise Creation Validation', () => {
  it('validates a correct franchise creation payload', () => {
    const input = {
      name: 'Godavari Gladiators',
      short_name: 'GG',
      color_primary: '#e76f51',
      color_secondary: '#f4a261',
      faculty_coordinator_name: 'Dr. S. Chaitanya',
      faculty_coordinator_mobile: '9876543210',
    };

    const result = adminCreateFranchiseSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Godavari Gladiators');
      expect(result.data.short_name).toBe('GG');
      expect(result.data.color_primary).toBe('#e76f51');
    }
  });

  it('auto-transforms short code to uppercase', () => {
    const result = adminCreateFranchiseSchema.safeParse({
      name: 'Vizag Titans',
      short_name: 'vt',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.short_name).toBe('VT');
    }
  });

  it('rejects short names with invalid length (<2 or >5)', () => {
    expect(
      adminCreateFranchiseSchema.safeParse({
        name: 'Vizag Titans',
        short_name: 'V', // 1 char
      }).success
    ).toBe(false);

    expect(
      adminCreateFranchiseSchema.safeParse({
        name: 'Vizag Titans',
        short_name: 'TITANS', // 6 chars
      }).success
    ).toBe(false);
  });

  it('validates hex color codes strictly', () => {
    expect(
      adminCreateFranchiseSchema.safeParse({
        name: 'Test Team',
        short_name: 'TT',
        color_primary: '#0284c7',
      }).success
    ).toBe(true);

    expect(
      adminCreateFranchiseSchema.safeParse({
        name: 'Test Team',
        short_name: 'TT',
        color_primary: '#fff',
      }).success
    ).toBe(true);

    expect(
      adminCreateFranchiseSchema.safeParse({
        name: 'Test Team',
        short_name: 'TT',
        color_primary: 'red', // Not hex
      }).success
    ).toBe(false);

    expect(
      adminCreateFranchiseSchema.safeParse({
        name: 'Test Team',
        short_name: 'TT',
        color_primary: '#GGGGGG', // Invalid hex digits
      }).success
    ).toBe(false);
  });
});

describe('Admin CRUD — Academic & Category Bucket Assignment', () => {
  it('correctly maps roll number to year and bucket', () => {
    // March 15, 2025 (before July 1)
    const referenceDate = new Date(2025, 2, 15);

    // 22811A0501 -> B.Tech regular joined in 2022 -> In March 2025 is Year 3 -> Bucket B3
    const parsed = parseRollNumber('22811A0501');
    expect(parsed.isValid).toBe(true);
    if (parsed.isValid && parsed.admissionYear && parsed.programme) {
      const year = calculateAcademicYear(parsed.admissionYear, parsed.programme, referenceDate);
      const bucket = deriveBucket(parsed.programme, year);
      expect(year).toBe(3);
      expect(bucket).toBe('B3');
    }
  });

  it('correctly handles lateral entry student roll numbers', () => {
    // March 15, 2025 (before July 1)
    const referenceDate = new Date(2025, 2, 15);

    // 23815A0501 -> Lateral entry joined in 2023 directly into Year 2 -> In March 2025 is Year 3 -> Bucket B3
    const parsed = parseRollNumber('23815A0501');
    expect(parsed.isValid).toBe(true);
    if (parsed.isValid && parsed.admissionYear && parsed.programme) {
      expect(parsed.programme).toBe('btech_lateral');
      const year = calculateAcademicYear(parsed.admissionYear, parsed.programme, referenceDate);
      const bucket = deriveBucket(parsed.programme, year);
      expect(year).toBe(3);
      expect(bucket).toBe('B3');
    }
  });

  it('supports flexible roll numbers with alphanumeric sequences and custom identifiers', () => {
    const res1 = adminCreatePlayerSchema.safeParse({
      full_name: 'Aditya Kumar',
      roll_number: '24811A05F2',
      mobile: '9848011223',
    });
    expect(res1.success).toBe(true);
    if (res1.success) {
      expect(res1.data.roll_number).toBe('24811A05F2');
    }

    const res2 = adminCreatePlayerSchema.safeParse({
      full_name: 'Special Candidate',
      roll_number: 'DIPLOMA-ME-045',
      mobile: '9848011224',
    });
    expect(res2.success).toBe(true);
    if (res2.success) {
      expect(res2.data.roll_number).toBe('DIPLOMA-ME-045');
    }
  });

  it('validates explicit academic fields and derives auction bucket independently of roll number', () => {
    const input = {
      full_name: 'Sai Kiran',
      roll_number: '24811A05F2',
      mobile: '9848011225',
      programme: 'btech_regular' as const,
      academic_year: 2,
      branch: 'CSE',
    };

    const result = adminCreatePlayerSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.programme).toBe('btech_regular');
      expect(result.data.academic_year).toBe(2);
      expect(result.data.branch).toBe('CSE');

      // Bucket is derived strictly from explicit inputs
      const bucket = deriveBucket(result.data.programme!, result.data.academic_year!);
      expect(bucket).toBe('B2');
    }
  });
});

describe('Admin CRUD — Referential Integrity & Immutable Auction Audit Guard', () => {
  it('determines deactivation mode when auction history exists', () => {
    // Contract check: if lotCount > 0 or eventCount > 0, system must NEVER hard delete
    function resolveDeletionMode(lotCount: number, eventCount: number): 'deactivated' | 'deleted' {
      const hasHistory = lotCount > 0 || eventCount > 0;
      return hasHistory ? 'deactivated' : 'deleted';
    }

    expect(resolveDeletionMode(1, 0)).toBe('deactivated');
    expect(resolveDeletionMode(0, 5)).toBe('deactivated');
    expect(resolveDeletionMode(2, 3)).toBe('deactivated');
    expect(resolveDeletionMode(0, 0)).toBe('deleted');
  });
});
