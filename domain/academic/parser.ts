// =============================================================================
// ACC Auction Portal — Domain: Roll Number Parsing (Spec §9)
// =============================================================================

import { ROLL_PATTERNS, BRANCH_CODES } from '@/lib/constants';

export type AcademicProgramme = 'btech_regular' | 'btech_lateral' | 'diploma' | 'pg';

export const DIPLOMA_BRANCH_NAMES: Record<string, string> = {
  CM: 'Computer Engineering',
  EC: 'Electronics & Communication',
  EE: 'Electrical & Electronics',
  M: 'Mechanical',
};

export function getBranchFullName(branchCode: string, programme?: AcademicProgramme): string {
  if (programme === 'diploma' && DIPLOMA_BRANCH_NAMES[branchCode]) {
    return DIPLOMA_BRANCH_NAMES[branchCode];
  }
  return BRANCH_CODES[branchCode] || DIPLOMA_BRANCH_NAMES[branchCode] || branchCode;
}

export interface ParsedRollNumber {
  isValid: boolean;
  rawRollNumber: string;
  programme?: AcademicProgramme;
  admissionYear?: number;
  branchCode?: string;
  branchName?: string;
  branchFullName?: string;
  sequenceNumber?: string;
  error?: string;
}

/**
 * Parses a student roll number to extract programme, admission year, and branch.
 * Normalizes input by trimming and converting to uppercase.
 */
export function parseRollNumber(
  rawInput: string,
  programmeHint?: AcademicProgramme
): ParsedRollNumber {
  if (!rawInput || typeof rawInput !== 'string') {
    return {
      isValid: false,
      rawRollNumber: '',
      error: 'Roll number is required',
    };
  }

  const roll = rawInput.trim().toUpperCase();

  if (!roll) {
    return {
      isValid: false,
      rawRollNumber: '',
      error: 'Roll number is required',
    };
  }

  if (roll.length > 50) {
    return {
      isValid: false,
      rawRollNumber: roll,
      error: 'Roll number exceeds maximum length of 50 characters',
    };
  }

  // 1. Regular B.Tech: YY811Abbnn (e.g. 23811A0501 or 24811A05F2)
  const regularMatch = roll.match(ROLL_PATTERNS.BTECH_REGULAR);
  if (regularMatch) {
    const yy = parseInt(regularMatch[1], 10);
    const branchCode = regularMatch[2];
    const sequenceNumber = regularMatch[3];
    const admissionYear = 2000 + yy;

    if (!BRANCH_CODES[branchCode]) {
      return {
        isValid: false,
        rawRollNumber: roll,
        error: `Invalid B.Tech branch code: ${branchCode}. Permitted codes are: 02 (EEE), 03 (ME), 04 (ECE), 05 (CSE), 42 (CSM), 44 (CSD).`,
      };
    }

    const branchName = BRANCH_CODES[branchCode];

    return {
      isValid: true,
      rawRollNumber: roll,
      programme: 'btech_regular',
      admissionYear,
      branchCode,
      branchName,
      branchFullName: branchName,
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

    if (!BRANCH_CODES[branchCode]) {
      return {
        isValid: false,
        rawRollNumber: roll,
        error: `Invalid B.Tech lateral branch code: ${branchCode}. Permitted codes are: 02 (EEE), 03 (ME), 04 (ECE), 05 (CSE), 42 (CSM), 44 (CSD).`,
      };
    }

    const branchName = BRANCH_CODES[branchCode];

    return {
      isValid: true,
      rawRollNumber: roll,
      programme: 'btech_lateral',
      admissionYear,
      branchCode,
      branchName,
      branchFullName: branchName,
      sequenceNumber,
    };
  }

  // 3. Diploma: YY597-BB-nnn (e.g. 24597-CM-015, 26597-M-041)
  const diplomaMatch = roll.match(ROLL_PATTERNS.DIPLOMA);
  if (diplomaMatch) {
    const yy = parseInt(diplomaMatch[1], 10);
    const branchCode = diplomaMatch[2];
    const sequenceNumber = diplomaMatch[3];
    const admissionYear = 2000 + yy;

    if (!DIPLOMA_BRANCH_NAMES[branchCode]) {
      return {
        isValid: false,
        rawRollNumber: roll,
        error: `Invalid Diploma branch code: ${branchCode}. Permitted branches are: CM, EC, EE, M.`,
      };
    }

    return {
      isValid: true,
      rawRollNumber: roll,
      programme: 'diploma',
      admissionYear,
      branchCode,
      branchName: branchCode,
      branchFullName: DIPLOMA_BRANCH_NAMES[branchCode],
      sequenceNumber,
    };
  }

  // 4. Postgraduate (PG): Roll number recorded, student selects programme/specialisation, Super Admin manually verifies, PG belongs to no bucket
  if (programmeHint === 'pg') {
    return {
      isValid: true,
      rawRollNumber: roll,
      programme: 'pg',
      branchCode: 'PG',
      branchName: 'Postgraduate',
      branchFullName: 'Postgraduate Programme',
    };
  }

  // 5. Authoritative rejection: No arbitrary flexible formats permitted (Spec §9)
  return {
    isValid: false,
    rawRollNumber: roll,
    error: 'Invalid roll number format. Must match B.Tech regular (YY811Abbnn), B.Tech lateral (YY815Abbnn), or Diploma (YY597-BB-nnn).',
  };
}
