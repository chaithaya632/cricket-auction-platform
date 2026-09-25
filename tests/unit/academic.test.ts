import { describe, it, expect } from 'vitest';
import {
  parseRollNumber,
  calculateAcademicYear,
  deriveBucket,
  deriveAcademicProfile,
} from '@/domain/academic';

describe('Academic Domain — Roll Number Parser (Spec §9)', () => {
  it('parses valid regular B.Tech roll number correctly', () => {
    const res = parseRollNumber('22811A0501');
    expect(res.isValid).toBe(true);
    expect(res.programme).toBe('btech_regular');
    expect(res.admissionYear).toBe(2022);
    expect(res.branchCode).toBe('05');
    expect(res.branchName).toBe('CSE');
    expect(res.sequenceNumber).toBe('01');
  });

  it('parses another regular B.Tech roll number with CSM branch', () => {
    const res = parseRollNumber('23811A4215');
    expect(res.isValid).toBe(true);
    expect(res.programme).toBe('btech_regular');
    expect(res.admissionYear).toBe(2023);
    expect(res.branchCode).toBe('42');
    expect(res.branchName).toBe('CSM');
    expect(res.sequenceNumber).toBe('15');
  });

  it('handles lowercase input and whitespace cleanly', () => {
    const res = parseRollNumber('  21811a0412  ');
    expect(res.isValid).toBe(true);
    expect(res.programme).toBe('btech_regular');
    expect(res.admissionYear).toBe(2021);
    expect(res.branchCode).toBe('04');
    expect(res.branchName).toBe('ECE');
    expect(res.sequenceNumber).toBe('12');
  });

  it('parses lateral entry B.Tech roll numbers', () => {
    const res = parseRollNumber('23815A0501');
    expect(res.isValid).toBe(true);
    expect(res.programme).toBe('btech_lateral');
    expect(res.admissionYear).toBe(2023);
    expect(res.branchCode).toBe('05');
    expect(res.branchName).toBe('CSE');
    expect(res.sequenceNumber).toBe('01');
  });

  it('parses diploma roll numbers', () => {
    const res = parseRollNumber('23597-EC-001');
    expect(res.isValid).toBe(true);
    expect(res.programme).toBe('diploma');
    expect(res.admissionYear).toBe(2023);
    expect(res.branchCode).toBe('EC');
    expect(res.branchName).toBe('EC');
    expect(res.sequenceNumber).toBe('001');
  });

  it('parses regular B.Tech roll numbers with alphanumeric sequence codes (e.g. 24811A05F2)', () => {
    const res = parseRollNumber('24811A05F2');
    expect(res.isValid).toBe(true);
    expect(res.programme).toBe('btech_regular');
    expect(res.admissionYear).toBe(2024);
    expect(res.branchCode).toBe('05');
    expect(res.branchName).toBe('CSE');
    expect(res.sequenceNumber).toBe('F2');
  });

  it('authoritatively rejects arbitrary non-standard roll numbers per Spec §9', () => {
    const res1 = parseRollNumber('23811B0501');
    expect(res1.isValid).toBe(false);
    expect(res1.error).toContain('Invalid roll number format');

    const res2 = parseRollNumber('CUSTOM-REG-99');
    expect(res2.isValid).toBe(false);

    const res3 = parseRollNumber('12345');
    expect(res3.isValid).toBe(false);
  });

  it('records roll numbers for postgraduate (PG) students with programmeHint', () => {
    const pgRes = parseRollNumber('24811D0501', 'pg');
    expect(pgRes.isValid).toBe(true);
    expect(pgRes.programme).toBe('pg');
    expect(pgRes.branchCode).toBe('PG');
  });

  it('rejects empty or excessively long roll numbers', () => {
    expect(parseRollNumber('').isValid).toBe(false);
    expect(parseRollNumber('   ').isValid).toBe(false);
    expect(parseRollNumber('A'.repeat(51)).isValid).toBe(false);
  });
});

describe('Academic Domain — Academic Year Calculation (July 1 Rollover)', () => {
  it('calculates academic year before July 1 rollover', () => {
    // March 15, 2026: before July 1, 2026. Academic cycle started July 1, 2025.
    const refDate = new Date(2026, 2, 15); // Month is 0-indexed: 2 = March

    // Admitted in 2025 -> Year 1
    expect(calculateAcademicYear(2025, 'btech_regular', refDate)).toBe(1);

    // Admitted in 2024 -> Year 2
    expect(calculateAcademicYear(2024, 'btech_regular', refDate)).toBe(2);

    // Admitted in 2023 -> Year 3
    expect(calculateAcademicYear(2023, 'btech_regular', refDate)).toBe(3);

    // Admitted in 2022 -> Year 4
    expect(calculateAcademicYear(2022, 'btech_regular', refDate)).toBe(4);
  });

  it('calculates academic year on or after July 1 rollover', () => {
    // July 2, 2026: new academic cycle started July 1, 2026.
    const refDate = new Date(2026, 6, 2); // Month is 0-indexed: 6 = July

    // Admitted in 2026 -> Year 1
    expect(calculateAcademicYear(2026, 'btech_regular', refDate)).toBe(1);

    // Admitted in 2025 -> Year 2
    expect(calculateAcademicYear(2025, 'btech_regular', refDate)).toBe(2);

    // Admitted in 2024 -> Year 3
    expect(calculateAcademicYear(2024, 'btech_regular', refDate)).toBe(3);
  });

  it('properly offsets lateral entry students by +2', () => {
    // In March 2026, a lateral student admitted in 2024 entered directly into Year 2 in 2024-2025
    // In 2025-2026 they are in Year 3
    const refDate = new Date(2026, 2, 15);
    expect(calculateAcademicYear(2024, 'btech_lateral', refDate)).toBe(3);

    // Admitted in 2025 (entered Year 2) -> in March 2026 they are still in Year 2
    expect(calculateAcademicYear(2025, 'btech_lateral', refDate)).toBe(2);
  });

  it('clamps academic years between 1 and 6', () => {
    const refDate = new Date(2026, 2, 15);
    expect(calculateAcademicYear(2030, 'btech_regular', refDate)).toBe(1);
    expect(calculateAcademicYear(2010, 'btech_regular', refDate)).toBe(6);
  });
});

describe('Academic Domain — Bucket Derivation (Spec §10)', () => {
  it('maps diploma students always to B5 regardless of year', () => {
    expect(deriveBucket('diploma', 1)).toBe('B5');
    expect(deriveBucket('diploma', 2)).toBe('B5');
    expect(deriveBucket('diploma', 3)).toBe('B5');
  });

  it('maps PG students always to PG', () => {
    expect(deriveBucket('pg', 1)).toBe('PG');
    expect(deriveBucket('pg', 2)).toBe('PG');
  });

  it('maps B.Tech regular and lateral years to B1 through B4', () => {
    expect(deriveBucket('btech_regular', 1)).toBe('B1');
    expect(deriveBucket('btech_regular', 2)).toBe('B2');
    expect(deriveBucket('btech_regular', 3)).toBe('B3');
    expect(deriveBucket('btech_regular', 4)).toBe('B4');

    expect(deriveBucket('btech_lateral', 2)).toBe('B2');
    expect(deriveBucket('btech_lateral', 3)).toBe('B3');
    expect(deriveBucket('btech_lateral', 4)).toBe('B4');
  });
});

describe('Academic Domain — deriveAcademicProfile (Spec §4.1, §4.2, §5 & Appendix A.5)', () => {
  const ACC_2026_SEASON = new Date(2026, 8, 15); // Sept 15, 2026 (Academic Year 2026-27)

  it('Case 19: 25811A0403 -> B.Tech, ECE, regular, 2nd year -> B2', () => {
    const p = deriveAcademicProfile('25811A0403', undefined, ACC_2026_SEASON);
    expect(p.isValid).toBe(true);
    expect(p.group).toBe('B.Tech');
    expect(p.programme).toBe('btech_regular');
    expect(p.isLateral).toBe(false);
    expect(p.branchName).toBe('ECE');
    expect(p.academicYear).toBe(2);
    expect(p.bucket).toBe('B2');
  });

  it('Case 20: 25815A0403 -> B.Tech, ECE, lateral entry, 3rd year -> B3', () => {
    const p = deriveAcademicProfile('25815A0403', undefined, ACC_2026_SEASON);
    expect(p.isValid).toBe(true);
    expect(p.group).toBe('B.Tech');
    expect(p.programme).toBe('btech_lateral');
    expect(p.isLateral).toBe(true);
    expect(p.branchName).toBe('ECE');
    expect(p.academicYear).toBe(3);
    expect(p.bucket).toBe('B3');
  });

  it('Case 21: 23811A4201 -> B.Tech, CSM, regular, 4th year -> B4', () => {
    const p = deriveAcademicProfile('23811A4201', undefined, ACC_2026_SEASON);
    expect(p.isValid).toBe(true);
    expect(p.group).toBe('B.Tech');
    expect(p.programme).toBe('btech_regular');
    expect(p.isLateral).toBe(false);
    expect(p.branchName).toBe('CSM');
    expect(p.academicYear).toBe(4);
    expect(p.bucket).toBe('B4');
  });

  it('Case 22: 24597-CM-015 -> Diploma, Computer Engineering, 3rd year -> B5', () => {
    const p = deriveAcademicProfile('24597-CM-015', undefined, ACC_2026_SEASON);
    expect(p.isValid).toBe(true);
    expect(p.group).toBe('Diploma');
    expect(p.programme).toBe('diploma');
    expect(p.isLateral).toBe(false);
    expect(p.branchCode).toBe('CM');
    expect(p.branchFullName).toBe('Computer Engineering');
    expect(p.academicYear).toBe(3);
    expect(p.bucket).toBe('B5');
  });

  it('Case 23: 26597-M-041 -> Diploma, Mechanical, 1st year -> B5', () => {
    const p = deriveAcademicProfile('26597-M-041', undefined, ACC_2026_SEASON);
    expect(p.isValid).toBe(true);
    expect(p.group).toBe('Diploma');
    expect(p.programme).toBe('diploma');
    expect(p.isLateral).toBe(false);
    expect(p.branchCode).toBe('M');
    expect(p.branchFullName).toBe('Mechanical');
    expect(p.academicYear).toBe(1);
    expect(p.bucket).toBe('B5');
  });

  it('Case 24: 26811A0501 -> B.Tech, CSE, regular, 1st year -> B1', () => {
    const p = deriveAcademicProfile('26811A0501', undefined, ACC_2026_SEASON);
    expect(p.isValid).toBe(true);
    expect(p.group).toBe('B.Tech');
    expect(p.programme).toBe('btech_regular');
    expect(p.isLateral).toBe(false);
    expect(p.branchName).toBe('CSE');
    expect(p.academicYear).toBe(1);
    expect(p.bucket).toBe('B1');
  });

  it('handles PG roll number with pg hint', () => {
    const p = deriveAcademicProfile('25811D0501', 'pg', ACC_2026_SEASON);
    expect(p.isValid).toBe(true);
    expect(p.group).toBe('PG');
    expect(p.programme).toBe('pg');
    expect(p.bucket).toBe('PG');
  });

  it('gracefully returns invalid for malformed roll numbers and blocks derivation', () => {
    const p = deriveAcademicProfile('INVALID-ROLL');
    expect(p.isValid).toBe(false);
    expect(p.error).toBeDefined();
    expect(p.programme).toBeUndefined();
    expect(p.academicYear).toBeUndefined();
    expect(p.branchName).toBeUndefined();
    expect(p.bucket).toBeUndefined();
  });

  it('guarantees that invalid roll numbers make registration impossible with no manual override bypass', () => {
    const invalidInputs = [
      '23811B0501',       // Invalid college degree indicator 'B'
      'CUSTOM-ROLL-123',  // Custom arbitrary roll string
      '25811A9999',       // Invalid branch code '99'
      '99999',            // Arbitrary number
      '25597-XX-001',     // Invalid diploma branch 'XX'
      '   ',              // Empty
    ];

    for (const roll of invalidInputs) {
      const parsed = parseRollNumber(roll);
      expect(parsed.isValid).toBe(false);
      expect(parsed.error).toBeDefined();

      const profile = deriveAcademicProfile(roll);
      expect(profile.isValid).toBe(false);
      expect(profile.programme).toBeUndefined();
      expect(profile.academicYear).toBeUndefined();
      expect(profile.branchName).toBeUndefined();
      expect(profile.bucket).toBeUndefined();
    }
  });

  it('proves lateral entry offset is +2 while regular entry is +1 for the same admission year', () => {
    // 25811A0403 (Regular, ECE, admitted 2025) -> Year 2 -> Bucket B2
    const regular = deriveAcademicProfile('25811A0403', undefined, ACC_2026_SEASON);
    expect(regular.isLateral).toBe(false);
    expect(regular.academicYear).toBe(2);
    expect(regular.bucket).toBe('B2');

    // 25815A0403 (Lateral, ECE, admitted 2025) -> Year 3 -> Bucket B3
    const lateral = deriveAcademicProfile('25815A0403', undefined, ACC_2026_SEASON);
    expect(lateral.isLateral).toBe(true);
    expect(lateral.academicYear).toBe(3);
    expect(lateral.bucket).toBe('B3');
  });

  it('verifies all specification branch codes in B.Tech regular and lateral', () => {
    const btechBranches: Record<string, string> = {
      '02': 'EEE',
      '03': 'ME',
      '04': 'ECE',
      '05': 'CSE',
      '42': 'CSM',
      '44': 'CSD',
    };

    for (const [code, expectedName] of Object.entries(btechBranches)) {
      const reg = deriveAcademicProfile(`24811A${code}01`, undefined, ACC_2026_SEASON);
      expect(reg.isValid).toBe(true);
      expect(reg.branchName).toBe(expectedName);

      const lat = deriveAcademicProfile(`24815A${code}01`, undefined, ACC_2026_SEASON);
      expect(lat.isValid).toBe(true);
      expect(lat.branchName).toBe(expectedName);
    }
  });
});

