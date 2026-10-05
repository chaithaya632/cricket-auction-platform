// =============================================================================
// ACC Auction Portal — Domain / Utility: Bucket-Specific Numbering
// =============================================================================
// Formats and resolves deterministic, immutable bucket-specific player numbers:
// B1: B11, B12, B13...
// B2: B21, B22, B23...
// B3: B31, B32, B33...
// B4: B41, B42, B43...
// B5: B51, B52, B53...
// PG: PG1, PG2, PG3...
// Numbers remain stable across sales, unsolds, skips, referrals, and filters.
// =============================================================================

export const BUCKET_ORDER_LIST = ['B1', 'B2', 'B3', 'B4', 'B5', 'PG'] as const;
export type ValidBucket = (typeof BUCKET_ORDER_LIST)[number];

/**
 * Formats a bucket and a 1-based sequence index into the visible player number.
 * Example: formatBucketPlayerNumber('B1', 1) -> 'B11'
 * Example: formatBucketPlayerNumber('B2', 2) -> 'B22'
 * Example: formatBucketPlayerNumber('PG', 1) -> 'PG1'
 */
export function formatBucketPlayerNumber(bucket: string, sequenceNumber: number): string {
  const cleanBucket = (bucket || 'B1').trim().toUpperCase();
  const safeNum = Math.max(1, Math.floor(sequenceNumber || 1));
  return `${cleanBucket}${safeNum}`;
}

/**
 * Parses a visible bucket player number string into its bucket and sequence number.
 * Example: parseBucketPlayerNumber('B11') -> { bucket: 'B1', sequenceNumber: 1 }
 * Example: parseBucketPlayerNumber('B22') -> { bucket: 'B2', sequenceNumber: 2 }
 * Example: parseBucketPlayerNumber('PG3') -> { bucket: 'PG', sequenceNumber: 3 }
 */
export function parseBucketPlayerNumber(
  val: string
): { bucket: string; sequenceNumber: number } | null {
  if (!val || typeof val !== 'string') return null;
  const trimmed = val.trim().toUpperCase();

  // Pattern: (B1|B2|B3|B4|B5|PG)(\d+)
  const match = trimmed.match(/^(B[1-5]|PG)(\d+)$/);
  if (!match) return null;

  return {
    bucket: match[1],
    sequenceNumber: parseInt(match[2], 10),
  };
}

/**
 * Assigns stable, deterministic bucket-specific numbers to a collection of players or lots.
 * Stability Invariant:
 * Sorting within each bucket uses draw_number (if available), then registeredAt / rollNumber / id.
 * Because all records in the bucket are ranked together, subsequent changes in status
 * (e.g. sold, unsold, skipped, referred) or client-side filtering NEVER alter a player's number.
 */
export function assignStableBucketNumbers<
  T extends {
    id: string;
    bucket: string;
    bucketNumber?: string;
    bucket_player_number?: string;
    drawNumber?: number;
    draw_number?: number;
    registeredAt?: string;
    rollNumber?: string;
    roll_number?: string;
  }
>(items: T[], masterItems?: T[]): Map<string, string> {
  const map = new Map<string, string>();

  // 1. If any items already carry an authoritative bucket number, preserve it
  for (const item of items) {
    const existing = item.bucketNumber || item.bucket_player_number;
    if (existing) {
      map.set(item.id, existing);
    }
  }

  // 2. The reference list for computing sequence ranks is masterItems if provided, otherwise items
  const referenceList = masterItems && masterItems.length > 0 ? masterItems : items;

  // Group reference items by bucket
  const bucketsMap = new Map<string, T[]>();
  for (const item of referenceList) {
    const b = (item.bucket || 'B1').trim().toUpperCase();
    if (!bucketsMap.has(b)) {
      bucketsMap.set(b, []);
    }
    bucketsMap.get(b)!.push(item);
  }

  // Deterministically sort and number items within each bucket
  for (const [bucket, bucketItems] of bucketsMap.entries()) {
    const sorted = [...bucketItems].sort((a, b) => {
      const drawA = a.drawNumber ?? a.draw_number ?? 999999;
      const drawB = b.drawNumber ?? b.draw_number ?? 999999;
      if (drawA !== drawB) return drawA - drawB;

      const regA = a.registeredAt || '';
      const regB = b.registeredAt || '';
      if (regA !== regB) return regA.localeCompare(regB);

      const rollA = a.rollNumber || a.roll_number || '';
      const rollB = b.rollNumber || b.roll_number || '';
      if (rollA !== rollB) return rollA.localeCompare(rollB);

      return a.id.localeCompare(b.id);
    });

    sorted.forEach((item, idx) => {
      const num = formatBucketPlayerNumber(bucket, idx + 1);
      // Only set if not already set by authoritative item property
      if (!map.has(item.id)) {
        map.set(item.id, num);
      }
    });
  }

  return map;
}

/**
 * Returns human-readable tier summary for a bucket.
 */
export function getBucketTierDescription(bucket: string): string {
  switch (bucket?.toUpperCase()) {
    case 'B1':
      return 'Premium Star Players (1st Tier)';
    case 'B2':
      return 'Core Competitive Tier (2nd Tier)';
    case 'B3':
      return 'Balanced All-Rounders & Batters (3rd Tier)';
    case 'B4':
      return 'Emerging Bowlers & Specialists (4th Tier)';
    case 'B5':
      return 'Developing & Supplementary Talent (5th Tier)';
    case 'PG':
      return 'Post-Graduate Senior Players';
    default:
      return 'Auction Tier';
  }
}
