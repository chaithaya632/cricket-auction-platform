// =============================================================================
// ACC Auction Portal — Domain: Academic Profile & Roll Auto-Derivation (Spec §4.1, §4.2, §5)
// =============================================================================

import { parseRollNumber, type AcademicProgramme, type ParsedRollNumber } from './parser';
import { calculateAcademicYear } from './year-calculator';
import { deriveBucket, type PlayerBucket } from './bucket-derivation';

export type AcademicGroup = 'B.Tech' | 'Diploma' | 'PG';

export interface DerivedAcademicProfile {
  isValid: boolean;
  rawRollNumber: string;
  programme?: AcademicProgramme;
  group?: AcademicGroup;
  admissionYear?: number;
  academicYear?: number;
  branchCode?: string;
  branchName?: string;
  branchFullName?: string;
  bucket?: PlayerBucket;
  isLateral: boolean;
  sequenceNumber?: string;
  error?: string;
}

/**
 * Authoritatively derives academic Year, Branch, Group, and Auction Bucket
 * directly from the student roll number per ACC Problem Statement §4.1, §4.2, §5.
 *
 * Regular B.Tech:  YY811Abbnn   -> Year = (currentYear - YY) + 1, Group = 'B.Tech', Bucket = B1..B4
 * Lateral B.Tech:  YY815Abbnn   -> Year = (currentYear - YY) + 2, Group = 'B.Tech', Bucket = B2..B4
 * Diploma:         YY597-BB-nnn -> Year = (currentYear - YY) + 1, Group = 'Diploma', Bucket = B5
 * PG:              Recorded, Group = 'PG', Bucket = 'PG'
 */
export function deriveAcademicProfile(
  rawRoll: string,
  programmeHint?: AcademicProgramme,
  referenceDate: Date = new Date()
): DerivedAcademicProfile {
  const parsed = parseRollNumber(rawRoll, programmeHint);
  if (!parsed.isValid || !parsed.programme) {
    return {
      isValid: false,
      rawRollNumber: parsed.rawRollNumber,
      isLateral: false,
      error: parsed.error,
    };
  }

  const {
    programme,
    admissionYear,
    branchCode,
    branchName,
    branchFullName,
    sequenceNumber,
    rawRollNumber,
  } = parsed;

  let group: AcademicGroup = 'B.Tech';
  let isLateral = false;
  let academicYear = 1;
  let bucket: PlayerBucket = 'B1';

  if (programme === 'btech_regular') {
    group = 'B.Tech';
    isLateral = false;
    academicYear = calculateAcademicYear(admissionYear!, 'btech_regular', referenceDate);
    bucket = deriveBucket('btech_regular', academicYear);
  } else if (programme === 'btech_lateral') {
    group = 'B.Tech';
    isLateral = true;
    academicYear = calculateAcademicYear(admissionYear!, 'btech_lateral', referenceDate);
    bucket = deriveBucket('btech_lateral', academicYear);
  } else if (programme === 'diploma') {
    group = 'Diploma';
    isLateral = false;
    academicYear = calculateAcademicYear(admissionYear!, 'diploma', referenceDate);
    bucket = deriveBucket('diploma', academicYear); // Always B5
  } else if (programme === 'pg') {
    group = 'PG';
    isLateral = false;
    academicYear = 1;
    bucket = 'PG';
  }

  return {
    isValid: true,
    rawRollNumber,
    programme,
    group,
    admissionYear,
    academicYear,
    branchCode,
    branchName,
    branchFullName,
    bucket,
    isLateral,
    sequenceNumber,
  };
}
