// =============================================================================
// ACC Auction Portal — Domain: Roll Number Parsing (Spec §9)
// =============================================================================

import { ROLL_PATTERNS, BRANCH_CODES } from '@/lib/constants';

export type AcademicProgramme = 'btech_regular' | 'btech_lateral' | 'diploma' | 'pg';

export interface ParsedRollNumber {
  isValid: boolean;
  rawRollNumber: string;
  programme?: AcademicProgramme;
  admissionYear?: number;
  branchCode?: string;
  branchName?: string;
  sequenceNumber?: string;
  error?: string;
}

/**
 * Parses a student roll number to extract programme, admission year, and branch.
 * Normalizes input by trimming and converting to uppercase.
 */
export function parseRollNumber(rawInput: string): ParsedRollNumber {
  if (!rawInput || typeof rawInput !== 'string') {
    return {
      isValid: false,
      rawRollNumber: '',
      error: 'Roll number is required',
    };
  }

  const roll = rawInput.trim().toUpperCase();

  // 1. Regular B.Tech: YY811Abbnn (e.g. 23811A0501)
  const regularMatch = roll.match(ROLL_PATTERNS.BTECH_REGULAR);
  if (regularMatch) {
    const yy = parseInt(regularMatch[1], 10);
    const branchCode = regularMatch[2];
    const sequenceNumber = regularMatch[3];
    const admissionYear = 2000 + yy;
    const branchName = BRANCH_CODES[branchCode] || branchCode;

    return {
      isValid: true,
      rawRollNumber: roll,
      programme: 'btech_regular',
      admissionYear,
      branchCode,
      branchName,
      sequenceNumber,
    };
  }

  // 2. Lateral Entry B.Tech: YY815Abbnn (e.g. 23815A0501)
  const lateralMatch = roll.match(ROLL_PATTERNS.BTECH_LATERAL);
  if (lateralMatch) {
    const yy = parseInt(lateralMatch[1], 10);
    const branchCode = lateralMatch[2];
    const sequenceNumber = lateralMatch[3];
    const admissionYear = 2000 + yy;
    const branchName = BRANCH_CODES[branchCode] || branchCode;

    return {
      isValid: true,
      rawRollNumber: roll,
      programme: 'btech_lateral',
      admissionYear,
      branchCode,
      branchName,
      sequenceNumber,
    };
  }

  // 3. Diploma: YY597-BB-nnn (e.g. 23597-EC-001)
  const diplomaMatch = roll.match(ROLL_PATTERNS.DIPLOMA);
  if (diplomaMatch) {
    const yy = parseInt(diplomaMatch[1], 10);
    const branchCode = diplomaMatch[2];
    const sequenceNumber = diplomaMatch[3];
    const admissionYear = 2000 + yy;

    return {
      isValid: true,
      rawRollNumber: roll,
      programme: 'diploma',
      admissionYear,
      branchCode,
      branchName: branchCode,
      sequenceNumber,
    };
  }

  return {
    isValid: false,
    rawRollNumber: roll,
    error: 'Invalid roll number format. Expected B.Tech (e.g. 23811A0501) or Diploma (e.g. 23597-EC-001) pattern.',
  };
}
