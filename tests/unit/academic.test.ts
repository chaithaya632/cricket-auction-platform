import { describe, it, expect } from 'vitest';
import {
  parseRollNumber,
  calculateAcademicYear,
  deriveBucket,
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

  it('rejects invalid roll numbers', () => {
    expect(parseRollNumber('').isValid).toBe(false);
    expect(parseRollNumber('INVALID123').isValid).toBe(false);
    expect(parseRollNumber('23811B0501').isValid).toBe(false);
    expect(parseRollNumber('12345').isValid).toBe(false);
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
