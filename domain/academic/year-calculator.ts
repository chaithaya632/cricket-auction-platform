// =============================================================================
// ACC Auction Portal — Domain: Academic Year Calculation (Spec §9)
// =============================================================================

import { ACADEMIC_ROLLOVER_MONTH, ACADEMIC_ROLLOVER_DAY } from '@/lib/constants';
import type { AcademicProgramme } from './parser';

/**
 * Calculates the current academic year (1..6) based on admission year, programme,
 * and the reference date (with the July 1 academic rollover rule).
 *
 * An academic cycle runs from July 1 of Year Y to June 30 of Year Y+1.
 * For example, in March 2026 (ACC 2026):
 * - A regular B.Tech student admitted in 2023 is in Year 3.
 * - A regular B.Tech student admitted in 2025 is in Year 1.
 * - A lateral entry student admitted in 2024 entered directly into Year 2, so in March 2026 they are in Year 3.
 */
export function calculateAcademicYear(
  admissionYear: number,
  programme: AcademicProgramme,
  referenceDate: Date = new Date()
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
