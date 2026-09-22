import { describe, it, expect } from 'vitest';
import {
  evaluatePlayerEligibility,
  isPlayerAuctionEligible,
} from '@/domain/players/eligibility';
import { parseRollNumber, calculateAcademicYear, deriveBucket } from '@/domain/academic';
import { BASE_PRICE_LADDER } from '@/lib/constants';

describe('Player Eligibility Pipeline & Workflow (§1, §2, §8, §13)', () => {
  const baseCompleteInput = {
    hasProfile: true,
    fullName: 'Virat Sharma',
    rollNumber: '25811A0403', // B.Tech ECE Regular, 2025 -> Year 2 -> B2
    mobile: '9848012345',
    photoUrl: 'https://example.com/photos/virat.jpg',
    hasRegistration: true,
    programme: 'btech_regular',
    academicYear: 2,
    branch: 'ECE',
    bucket: 'B2',
    hasSkillProfile: true,
    paymentStatus: 'paid' as const,
    cricHeroesStatus: 'verified' as const,
    cricHeroesUrl: 'https://cricheroes.com/player/virat',
    registrationStatus: 'eligible' as const,
    isActive: true,
  };

  it('marks a fully verified player as auction eligible', () => {
    const breakdown = evaluatePlayerEligibility(baseCompleteInput);
    expect(breakdown.isEligible).toBe(true);
    expect(breakdown.profileComplete).toBe(true);
    expect(breakdown.academicVerified).toBe(true);
    expect(breakdown.registrationComplete).toBe(true);
    expect(breakdown.skillProfileComplete).toBe(true);
    expect(breakdown.paymentVerified).toBe(true);
    expect(breakdown.cricHeroesVerified).toBe(true);
    expect(breakdown.notBlocked).toBe(true);
    expect(breakdown.missingRequirements).toHaveLength(0);

    expect(
      isPlayerAuctionEligible({
        registrationStatus: 'eligible',
        paymentStatus: 'paid',
        cricHeroesStatus: 'verified',
        hasSkillProfile: true,
      })
    ).toBe(true);
  });

  it('blocks auction eligibility when personal profile is incomplete (Bug A)', () => {
    const breakdown = evaluatePlayerEligibility({
      ...baseCompleteInput,
      fullName: '',
      rollNumber: 'PENDING',
    });
    expect(breakdown.isEligible).toBe(false);
    expect(breakdown.profileComplete).toBe(false);
    expect(breakdown.missingRequirements.some((r) => r.includes('profile incomplete'))).toBe(true);
  });

  it('blocks auction eligibility when offline tournament fee is unpaid (§12)', () => {
    const breakdown = evaluatePlayerEligibility({
      ...baseCompleteInput,
      paymentStatus: 'unpaid',
    });
    expect(breakdown.isEligible).toBe(false);
    expect(breakdown.paymentVerified).toBe(false);
    expect(breakdown.missingRequirements.some((r) => r.includes('fee payment not verified'))).toBe(true);
  });

  it('blocks auction eligibility when CricHeroes profile is pending creation (§8)', () => {
    const breakdown = evaluatePlayerEligibility({
      ...baseCompleteInput,
      cricHeroesStatus: 'profile_creation_pending',
    });
    expect(breakdown.isEligible).toBe(false);
    expect(breakdown.cricHeroesVerified).toBe(false);
    expect(breakdown.missingRequirements.some((r) => r.includes('creation pending'))).toBe(true);
  });

  it('blocks auction eligibility when cricket skills questionnaire is not submitted (§9)', () => {
    const breakdown = evaluatePlayerEligibility({
      ...baseCompleteInput,
      hasSkillProfile: false,
    });
    expect(breakdown.isEligible).toBe(false);
    expect(breakdown.skillProfileComplete).toBe(false);
    expect(breakdown.missingRequirements.some((r) => r.includes('questionnaire not submitted'))).toBe(true);
  });

  it('blocks auction eligibility when player account is blocked by Super Admin (§13)', () => {
    const breakdown = evaluatePlayerEligibility({
      ...baseCompleteInput,
      isActive: false,
    });
    expect(breakdown.isEligible).toBe(false);
    expect(breakdown.notBlocked).toBe(false);
    expect(breakdown.missingRequirements.some((r) => r.includes('blocked'))).toBe(true);
  });

  it('prevents self-approval: player submitting skills remains in pending_verification until admin verifies payment and credentials', () => {
    const breakdown = evaluatePlayerEligibility({
      ...baseCompleteInput,
      paymentStatus: 'unpaid',
      registrationStatus: 'pending_verification',
    });
    expect(breakdown.isEligible).toBe(false);
    expect(breakdown.paymentVerified).toBe(false);
  });
});

describe('Authoritative Roll Number Parsing & Academic Derivation (§5 & Appendix A.5)', () => {
  const referenceDate = new Date(2026, 8, 15); // Sept 15, 2026

  it('Case 19: 25811A0403 -> B.Tech ECE Regular -> Year 2 -> B2', () => {
    const parsed = parseRollNumber('25811A0403');
    expect(parsed.isValid).toBe(true);
    expect(parsed.programme).toBe('btech_regular');
    expect(parsed.branchName).toBe('ECE');
    const year = calculateAcademicYear(parsed.admissionYear!, parsed.programme!, referenceDate);
    expect(year).toBe(2);
    expect(deriveBucket(parsed.programme!, year)).toBe('B2');
  });

  it('Case 20: 25815A0403 -> B.Tech ECE Lateral -> Year 3 -> B3', () => {
    const parsed = parseRollNumber('25815A0403');
    expect(parsed.isValid).toBe(true);
    expect(parsed.programme).toBe('btech_lateral');
    const year = calculateAcademicYear(parsed.admissionYear!, parsed.programme!, referenceDate);
    expect(year).toBe(3);
    expect(deriveBucket(parsed.programme!, year)).toBe('B3');
  });

  it('Case 21: 23811A4201 -> B.Tech CSM Regular -> Year 4 -> B4', () => {
    const parsed = parseRollNumber('23811A4201');
    expect(parsed.isValid).toBe(true);
    expect(parsed.branchName).toBe('CSM');
    const year = calculateAcademicYear(parsed.admissionYear!, parsed.programme!, referenceDate);
    expect(year).toBe(4);
    expect(deriveBucket(parsed.programme!, year)).toBe('B4');
  });

  it('Case 22: 24597-CM-015 -> Diploma Computer Engineering -> B5', () => {
    const parsed = parseRollNumber('24597-CM-015');
    expect(parsed.isValid).toBe(true);
    expect(parsed.programme).toBe('diploma');
    const year = calculateAcademicYear(parsed.admissionYear!, parsed.programme!, referenceDate);
    expect(deriveBucket(parsed.programme!, year)).toBe('B5');
  });

  it('Case 23: 26597-M-041 -> Diploma Mechanical -> B5', () => {
    const parsed = parseRollNumber('26597-M-041');
    expect(parsed.isValid).toBe(true);
    expect(parsed.programme).toBe('diploma');
    const year = calculateAcademicYear(parsed.admissionYear!, parsed.programme!, referenceDate);
    expect(deriveBucket(parsed.programme!, year)).toBe('B5');
  });

  it('Case 24: 26811A0501 -> B.Tech CSE Regular -> Year 1 -> B1', () => {
    const parsed = parseRollNumber('26811A0501');
    expect(parsed.isValid).toBe(true);
    expect(parsed.branchName).toBe('CSE');
    const year = calculateAcademicYear(parsed.admissionYear!, parsed.programme!, referenceDate);
    expect(year).toBe(1);
    expect(deriveBucket(parsed.programme!, year)).toBe('B1');
  });

  it('authoritatively rejects invalid branch codes and non-standard strings', () => {
    expect(parseRollNumber('25811A9901').isValid).toBe(false); // 99 is invalid branch
    expect(parseRollNumber('24597-XX-001').isValid).toBe(false); // XX is invalid diploma branch
    expect(parseRollNumber('CUSTOM-REG-123').isValid).toBe(false);
    expect(parseRollNumber('12345').isValid).toBe(false);
  });
});

describe('Base Price Ladder Compliance (§6)', () => {
  it('enforces exact 16-tier ladder values', () => {
    const expectedLadder = [
      20, 30, 40, 50, 60, 70, 80, 90, 100, 120, 140, 160, 180, 200, 230, 250,
    ];
    expect(BASE_PRICE_LADDER).toEqual(expectedLadder);
    expect(BASE_PRICE_LADDER.includes(140 as any)).toBe(true);
    expect(BASE_PRICE_LADDER.includes(150 as any)).toBe(false); // 150 is rejected
    expect(BASE_PRICE_LADDER.includes(210 as any)).toBe(false); // 210 is rejected
  });
});
