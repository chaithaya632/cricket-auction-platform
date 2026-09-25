// =============================================================================
// ACC Auction Portal — Domain: Academic Year Calculation (Spec §9)
// =============================================================================

import { ACADEMIC_ROLLOVER_MONTH, ACADEMIC_ROLLOVER_DAY, ACC_REFERENCE_DATE } from '@/lib/constants';
import type { AcademicProgramme } from './parser';

/**
 * Calculates the current academic year (1..6) based on admission year, programme,
 * and the reference date (with the July 1 academic rollover rule).
 *
 * An academic cycle runs from July 1 of Year Y to June 30 of Year Y+1.
 * For the ACC 2026 season (referenceDate = October 1, 2026 per Spec §5):
 * - Regular B.Tech:  Year = (2026 - YY) + 1  (e.g., 25811A0403 -> Year 2)
 * - Lateral B.Tech:  Year = (2026 - YY) + 2  (e.g., 25815A0403 -> Year 3)
 * - Diploma:         Year = (2026 - YY) + 1  (e.g., 24597-CM-015 -> Year 3)
 */
export function calculateAcademicYear(
  admissionYear: number,
  programme: AcademicProgramme,
  referenceDate: Date = ACC_REFERENCE_DATE
): number {
  const currentYear = referenceDate.getFullYear();
  const currentMonth = referenceDate.getMonth() + 1; // 1-indexed (1-12)
  const currentDay = referenceDate.getDate();

  // Determine if the current date is before the July 1 rollover
  const isBeforeRollover =
    currentMonth < ACADEMIC_ROLLOVER_MONTH ||
    (currentMonth === ACADEMIC_ROLLOVER_MONTH && currentDay < ACADEMIC_ROLLOVER_DAY);

  const effectiveAcademicStartYear = isBeforeRollover ? currentYear - 1 : currentYear;

  // Base years completed since admission
  const yearsSinceAdmission = effectiveAcademicStartYear - admissionYear;

  let calculatedYear = yearsSinceAdmission + 1;

  // Lateral entry students start directly in Year 2
  if (programme === 'btech_lateral') {
    calculatedYear = yearsSinceAdmission + 2;
  }

  // Ensure year stays within valid bounds (1 to 6)
  if (calculatedYear < 1) return 1;
  if (calculatedYear > 6) return 6;

  return calculatedYear;
}
