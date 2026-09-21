// =============================================================================
// ACC Auction Portal — Domain: Auction Bucket Derivation (Spec §10)
// =============================================================================

import type { Bucket } from '@/lib/constants';
import type { AcademicProgramme } from './parser';

export type PlayerBucket = Bucket | 'PG';

/**
 * Derives the auction bucket strictly from the student's programme and academic year.
 *
 * Rules:
 * - Diploma: Always bucket B5 regardless of year.
 * - PG: Always category PG.
 * - B.Tech (Regular & Lateral):
 *   - Year 1 -> B1
 *   - Year 2 -> B2
 *   - Year 3 -> B3
 *   - Year 4+ -> B4
 */
export function deriveBucket(
  programme: AcademicProgramme,
  academicYear: number
): PlayerBucket {
  if (programme === 'diploma') {
    return 'B5';
  }

  if (programme === 'pg') {
    return 'PG';
  }

  // B.Tech (Regular or Lateral)
  switch (academicYear) {
    case 1:
      return 'B1';
    case 2:
      return 'B2';
    case 3:
      return 'B3';
    case 4:
    default:
      return 'B4';
  }
}
