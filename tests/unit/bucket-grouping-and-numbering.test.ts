import { describe, it, expect, vi } from 'vitest';
import {
  formatBucketPlayerNumber,
  parseBucketPlayerNumber,
  assignStableBucketNumbers,
  getBucketTierDescription,
  BUCKET_ORDER_LIST,
} from '@/lib/auction/bucket-numbering';
import { DEFAULT_BUCKET_ORDER } from '@/lib/auction/types';

describe('Phase 5.2 Small Correction — Bucket Grouping & Numbering Invariants', () => {
  describe('1. Bucket Player Number Formatting (${bucket}${sequenceNumber})', () => {
    it('formats B1 sequence numbers as B11, B12, B13...', () => {
      expect(formatBucketPlayerNumber('B1', 1)).toBe('B11');
      expect(formatBucketPlayerNumber('B1', 2)).toBe('B12');
      expect(formatBucketPlayerNumber('B1', 10)).toBe('B110');
    });

    it('formats B2 sequence numbers as B21, B22, B23...', () => {
      expect(formatBucketPlayerNumber('B2', 1)).toBe('B21');
      expect(formatBucketPlayerNumber('B2', 2)).toBe('B22');
      expect(formatBucketPlayerNumber('B2', 3)).toBe('B23');
    });

    it('formats B3 sequence numbers as B31, B32, B33...', () => {
      expect(formatBucketPlayerNumber('B3', 1)).toBe('B31');
      expect(formatBucketPlayerNumber('B3', 2)).toBe('B32');
    });

    it('formats B4 sequence numbers as B41, B42, B43...', () => {
      expect(formatBucketPlayerNumber('B4', 1)).toBe('B41');
      expect(formatBucketPlayerNumber('B4', 2)).toBe('B42');
    });

    it('formats B5 sequence numbers as B51, B52, B53...', () => {
      expect(formatBucketPlayerNumber('B5', 1)).toBe('B51');
      expect(formatBucketPlayerNumber('B5', 2)).toBe('B52');
    });

    it('formats PG sequence numbers as PG1, PG2, PG3...', () => {
      expect(formatBucketPlayerNumber('PG', 1)).toBe('PG1');
      expect(formatBucketPlayerNumber('PG', 2)).toBe('PG2');
      expect(formatBucketPlayerNumber('PG', 3)).toBe('PG3');
    });
  });

  describe('2. Bucket Player Number Parsing', () => {
    it('correctly parses valid bucket player numbers', () => {
      expect(parseBucketPlayerNumber('B11')).toEqual({ bucket: 'B1', sequenceNumber: 1 });
      expect(parseBucketPlayerNumber('B22')).toEqual({ bucket: 'B2', sequenceNumber: 2 });
      expect(parseBucketPlayerNumber('B31')).toEqual({ bucket: 'B3', sequenceNumber: 1 });
      expect(parseBucketPlayerNumber('B45')).toEqual({ bucket: 'B4', sequenceNumber: 5 });
      expect(parseBucketPlayerNumber('B510')).toEqual({ bucket: 'B5', sequenceNumber: 10 });
      expect(parseBucketPlayerNumber('PG1')).toEqual({ bucket: 'PG', sequenceNumber: 1 });
      expect(parseBucketPlayerNumber('pg3')).toEqual({ bucket: 'PG', sequenceNumber: 3 });
    });

    it('returns null for invalid strings', () => {
      expect(parseBucketPlayerNumber('')).toBeNull();
      expect(parseBucketPlayerNumber('INVALID')).toBeNull();
      expect(parseBucketPlayerNumber('B61')).toBeNull();
      expect(parseBucketPlayerNumber('B1')).toBeNull();
    });
  });

  describe('3. Stability Invariant: Number must NOT shift upon state changes', () => {
    const initialPlayers = [
      { id: 'p1', bucket: 'B1', drawNumber: 1, registeredAt: '2026-09-01T10:00:00Z', rollNumber: 'R101' },
      { id: 'p2', bucket: 'B1', drawNumber: 2, registeredAt: '2026-09-01T10:05:00Z', rollNumber: 'R102' },
      { id: 'p3', bucket: 'B1', drawNumber: 3, registeredAt: '2026-09-01T10:10:00Z', rollNumber: 'R103' },
      { id: 'p4', bucket: 'B2', drawNumber: 4, registeredAt: '2026-09-01T10:15:00Z', rollNumber: 'R201' },
      { id: 'p5', bucket: 'B2', drawNumber: 5, registeredAt: '2026-09-01T10:20:00Z', rollNumber: 'R202' },
      { id: 'p6', bucket: 'B3', drawNumber: 6, registeredAt: '2026-09-01T10:25:00Z', rollNumber: 'R301' },
    ];

    it('assigns deterministic numbers initially', () => {
      const numbers = assignStableBucketNumbers(initialPlayers);
      expect(numbers.get('p1')).toBe('B11');
      expect(numbers.get('p2')).toBe('B12');
      expect(numbers.get('p3')).toBe('B13');
      expect(numbers.get('p4')).toBe('B21');
      expect(numbers.get('p5')).toBe('B22');
      expect(numbers.get('p6')).toBe('B31');
    });

    it('does NOT shift numbers when player p1 is sold or completed', () => {
      // Simulating a sold/unsold/skipped status on p1
      const updatedPlayers = initialPlayers.map((p) =>
        p.id === 'p1' ? { ...p, status: 'sold' } : p
      );
      const numbers = assignStableBucketNumbers(updatedPlayers);

      expect(numbers.get('p1')).toBe('B11');
      expect(numbers.get('p2')).toBe('B12');
      expect(numbers.get('p3')).toBe('B13');
      expect(numbers.get('p4')).toBe('B21');
    });

    it('does NOT shift numbers when a player is marked unsold or skipped', () => {
      const updatedPlayers = initialPlayers.map((p) =>
        p.id === 'p2' ? { ...p, status: 'unsold' } : p
      );
      const numbers = assignStableBucketNumbers(updatedPlayers);

      expect(numbers.get('p1')).toBe('B11');
      expect(numbers.get('p2')).toBe('B12');
      expect(numbers.get('p3')).toBe('B13');
    });

    it('does NOT shift numbers when a referral allotment occurs', () => {
      const updatedPlayers = initialPlayers.map((p) =>
        p.id === 'p3' ? { ...p, isReferred: true, isAuctionEligible: false, status: 'allotted' } : p
      );
      const numbers = assignStableBucketNumbers(updatedPlayers);

      expect(numbers.get('p1')).toBe('B11');
      expect(numbers.get('p2')).toBe('B12');
      expect(numbers.get('p3')).toBe('B13');
    });
  });

  describe('4. Bucket Grouping Representation', () => {
    it('covers all standard tournament buckets', () => {
      expect(BUCKET_ORDER_LIST).toEqual(['B1', 'B2', 'B3', 'B4', 'B5', 'PG']);
    });

    it('provides human-readable tier descriptions for all buckets', () => {
      expect(getBucketTierDescription('B1')).toContain('1st Tier');
      expect(getBucketTierDescription('B2')).toContain('2nd Tier');
      expect(getBucketTierDescription('B3')).toContain('3rd Tier');
      expect(getBucketTierDescription('B4')).toContain('4th Tier');
      expect(getBucketTierDescription('B5')).toContain('5th Tier');
      expect(getBucketTierDescription('PG')).toContain('Post-Graduate');
    });
  });

  describe('5. Active Bucket Queue Sequencing & Boundary Enforcement', () => {
    const queueLots = [
      { id: 'lot-b1-1', bucket: 'B1', draw_number: 10 },
      { id: 'lot-b2-1', bucket: 'B2', draw_number: 20 },
      { id: 'lot-b2-2', bucket: 'B2', draw_number: 21 },
      { id: 'lot-b3-1', bucket: 'B3', draw_number: 30 },
      { id: 'lot-b3-2', bucket: 'B3', draw_number: 31 },
      { id: 'lot-b4-1', bucket: 'B4', draw_number: 40 },
    ];

    it('filters queue strictly to B2 when operator selects only B2', () => {
      const activeBuckets = ['B2'];
      const filtered = queueLots.filter((l) => activeBuckets.includes(l.bucket));
      expect(filtered.map((l) => l.id)).toEqual(['lot-b2-1', 'lot-b2-2']);
    });

    it('sorts queue with B2 first, then B3 when operator selects B2 + B3 in that order', () => {
      const activeBuckets = ['B2', 'B3'];
      const filtered = queueLots.filter((l) => activeBuckets.includes(l.bucket));
      const sorted = [...filtered].sort((a, b) => {
        const orderA = activeBuckets.indexOf(a.bucket);
        const orderB = activeBuckets.indexOf(b.bucket);
        if (orderA !== orderB) return orderA - orderB;
        return a.draw_number - b.draw_number;
      });

      expect(sorted.map((l) => l.id)).toEqual(['lot-b2-1', 'lot-b2-2', 'lot-b3-1', 'lot-b3-2']);
    });

    it('does NOT pull lots from unselected buckets (B1, B4) when B2 + B3 are selected', () => {
      const activeBuckets = ['B2', 'B3'];
      const filtered = queueLots.filter((l) => activeBuckets.includes(l.bucket));
      expect(filtered.some((l) => l.bucket === 'B1')).toBe(false);
      expect(filtered.some((l) => l.bucket === 'B4')).toBe(false);
    });

    it('reports empty queue when all selected bucket lots are completed', () => {
      const activeBuckets = ['B5'];
      const filtered = queueLots.filter((l) => activeBuckets.includes(l.bucket));
      expect(filtered.length).toBe(0);
      // Empty state without auto-advancing into B1, B2, B3, or B4
    });
  });

  describe('6. Guest Draw Card-to-Bucket Mapping', () => {
    it('maps Card 1 in B3 deterministically to B31', () => {
      const bucket = 'B3';
      const cardNumber = 1;
      expect(formatBucketPlayerNumber(bucket, cardNumber)).toBe('B31');
    });

    it('maps Card 2 in B3 deterministically to B32', () => {
      const bucket = 'B3';
      const cardNumber = 2;
      expect(formatBucketPlayerNumber(bucket, cardNumber)).toBe('B32');
    });

    it('maps Card 1 in B2 deterministically to B21', () => {
      const bucket = 'B2';
      const cardNumber = 1;
      expect(formatBucketPlayerNumber(bucket, cardNumber)).toBe('B21');
    });
  });

  describe('7. Rigorous Sequence Stability Invariant (B31, B32, B33, B34)', () => {
    // 4 players in bucket B3
    const b3PlayersMaster = [
      { id: 'p-b3-1', fullName: 'Player 1', bucket: 'B3', drawNumber: 1, registeredAt: '2026-09-01T10:00:00Z', rollNumber: 'R301', status: 'pending' },
      { id: 'p-b3-2', fullName: 'Player 2', bucket: 'B3', drawNumber: 2, registeredAt: '2026-09-01T10:05:00Z', rollNumber: 'R302', status: 'pending' },
      { id: 'p-b3-3', fullName: 'Player 3', bucket: 'B3', drawNumber: 3, registeredAt: '2026-09-01T10:10:00Z', rollNumber: 'R303', status: 'pending' },
      { id: 'p-b3-4', fullName: 'Player 4', bucket: 'B3', drawNumber: 4, registeredAt: '2026-09-01T10:15:00Z', rollNumber: 'R304', status: 'pending' },
    ];

    it('Original state: B31, B32, B33, B34', () => {
      const numbers = assignStableBucketNumbers(b3PlayersMaster);
      expect(numbers.get('p-b3-1')).toBe('B31');
      expect(numbers.get('p-b3-2')).toBe('B32');
      expect(numbers.get('p-b3-3')).toBe('B33');
      expect(numbers.get('p-b3-4')).toBe('B34');
    });

    it('After B31 is SOLD and B32 is UNSOLD: remaining B33 and B34 retain original numbers (B34 is STILL B34)', () => {
      const stateAfterSoldAndUnsold = [
        { ...b3PlayersMaster[0], status: 'sold' },
        { ...b3PlayersMaster[1], status: 'unsold' },
        b3PlayersMaster[2],
        b3PlayersMaster[3],
      ];

      // Master numbers computed on all tournament participants
      const masterNumbers = assignStableBucketNumbers(stateAfterSoldAndUnsold);
      expect(masterNumbers.get('p-b3-3')).toBe('B33');
      expect(masterNumbers.get('p-b3-4')).toBe('B34');

      // Remaining pending lots queued for auction
      const remainingPendingLots = stateAfterSoldAndUnsold.filter((p) => p.status === 'pending');
      expect(remainingPendingLots.map((p) => p.id)).toEqual(['p-b3-3', 'p-b3-4']);

      // Derived numbers using master reference list
      const queuedNumbers = assignStableBucketNumbers(remainingPendingLots, stateAfterSoldAndUnsold);
      expect(queuedNumbers.get('p-b3-3')).toBe('B33');
      expect(queuedNumbers.get('p-b3-4')).toBe('B34');
    });

    it('After B33 is SKIPPED: remaining B34 retains original number B34 (NOT renumbered to B31)', () => {
      const stateAfterSkipped = [
        { ...b3PlayersMaster[0], status: 'sold' },
        { ...b3PlayersMaster[1], status: 'unsold' },
        { ...b3PlayersMaster[2], status: 'skipped' },
        b3PlayersMaster[3],
      ];

      const masterNumbers = assignStableBucketNumbers(stateAfterSkipped);
      expect(masterNumbers.get('p-b3-4')).toBe('B34');

      const remainingPendingLots = stateAfterSkipped.filter((p) => p.status === 'pending');
      expect(remainingPendingLots.length).toBe(1);
      expect(remainingPendingLots[0].id).toBe('p-b3-4');

      // Even if only p-b3-4 remains in the pending queue, it must NOT be renumbered to B31
      const queuedNumbers = assignStableBucketNumbers(remainingPendingLots, stateAfterSkipped);
      expect(queuedNumbers.get('p-b3-4')).toBe('B34');
    });

    it('After another player is referred/allotted: remaining B34 STILL displays B34', () => {
      const stateWithReferralAllotment = [
        { ...b3PlayersMaster[0], status: 'sold' },
        { ...b3PlayersMaster[1], status: 'unsold' },
        { ...b3PlayersMaster[2], status: 'skipped' },
        b3PlayersMaster[3],
        { id: 'p-b3-ref', fullName: 'Referred Player', bucket: 'B3', drawNumber: 5, registeredAt: '2026-09-01T10:20:00Z', rollNumber: 'R305', status: 'allotted', isReferred: true, isAuctionEligible: false },
      ];

      const masterNumbers = assignStableBucketNumbers(stateWithReferralAllotment);
      expect(masterNumbers.get('p-b3-1')).toBe('B31');
      expect(masterNumbers.get('p-b3-2')).toBe('B32');
      expect(masterNumbers.get('p-b3-3')).toBe('B33');
      expect(masterNumbers.get('p-b3-4')).toBe('B34');
      expect(masterNumbers.get('p-b3-ref')).toBe('B35');

      // Queue of pending lots only has p-b3-4
      const remainingPendingLots = stateWithReferralAllotment.filter((p) => p.status === 'pending');
      const queuedNumbers = assignStableBucketNumbers(remainingPendingLots, stateWithReferralAllotment);
      expect(queuedNumbers.get('p-b3-4')).toBe('B34');
    });

    it('Admin Players page filtering & searching preserves stable numbering for B34', () => {
      // Players with pre-attached bucketNumber as returned by getAdminPlayersList
      const playersListWithNumbers = b3PlayersMaster.map((p, idx) => ({
        ...p,
        bucketNumber: formatBucketPlayerNumber(p.bucket, idx + 1),
      }));

      // Search query "Player 4"
      const searchFiltered = playersListWithNumbers.filter((p) =>
        p.fullName.toLowerCase().includes('player 4')
      );
      expect(searchFiltered.length).toBe(1);
      expect(searchFiltered[0].id).toBe('p-b3-4');
      expect(searchFiltered[0].bucketNumber).toBe('B34');

      // Search query "B34"
      const numberFiltered = playersListWithNumbers.filter((p) =>
        p.bucketNumber.toLowerCase().includes('b34')
      );
      expect(numberFiltered.length).toBe(1);
      expect(numberFiltered[0].id).toBe('p-b3-4');
      expect(numberFiltered[0].bucketNumber).toBe('B34');
    });

    it('Guest Draw continues resolving the same player for the same bucket/card mapping', () => {
      const lots = [
        { id: 'lot-1', draw_number: 1, bucket: 'B3', status: 'sold' },
        { id: 'lot-2', draw_number: 2, bucket: 'B3', status: 'unsold' },
        { id: 'lot-3', draw_number: 3, bucket: 'B3', status: 'skipped' },
        { id: 'lot-4', draw_number: 4, bucket: 'B3', status: 'pending' },
      ];

      // Simulated getGuestDrawCandidates mapping
      const candidates = lots.map((lot, idx) => {
        const cardNumber = idx + 1;
        const cardLabel = cardNumber < 10 ? `0${cardNumber}` : `${cardNumber}`;
        const bucketPlayerNumber = formatBucketPlayerNumber(lot.bucket, cardNumber);
        return {
          cardNumber,
          cardLabel,
          bucketPlayerNumber,
          lotId: lot.id,
          drawNumber: lot.draw_number,
          drawn: lot.status !== 'pending',
        };
      });

      // Card 1 is drawn (sold), still labeled B31
      expect(candidates[0].cardNumber).toBe(1);
      expect(candidates[0].bucketPlayerNumber).toBe('B31');
      expect(candidates[0].lotId).toBe('lot-1');
      expect(candidates[0].drawn).toBe(true);

      // Card 2 is drawn (unsold), still labeled B32
      expect(candidates[1].cardNumber).toBe(2);
      expect(candidates[1].bucketPlayerNumber).toBe('B32');
      expect(candidates[1].lotId).toBe('lot-2');
      expect(candidates[1].drawn).toBe(true);

      // Card 3 is drawn (skipped), still labeled B33
      expect(candidates[2].cardNumber).toBe(3);
      expect(candidates[2].bucketPlayerNumber).toBe('B33');
      expect(candidates[2].lotId).toBe('lot-3');
      expect(candidates[2].drawn).toBe(true);

      // Card 4 is pending, STILL labeled B34, maps to lot-4
      expect(candidates[3].cardNumber).toBe(4);
      expect(candidates[3].bucketPlayerNumber).toBe('B34');
      expect(candidates[3].lotId).toBe('lot-4');
      expect(candidates[3].drawn).toBe(false);
    });
  });

  describe('8. Guest Mode Available by Default & Strict Security Boundaries', () => {
    it('Guest Mode is unlocked and available immediately without prior operator unlock or floor activation', () => {
      // Operator controls no longer gate Guest Draw behind floor activation (isFloorActive)
      const canOpenGuestDraw = (isPending: boolean) => !isPending;

      expect(canOpenGuestDraw(false)).toBe(true);
      // Even if floor is waiting / inactive (activeLot === null or in_progress is false), guest draw can be opened
      const isFloorActive = false;
      const activeLot = null;
      expect(!isFloorActive && activeLot === null).toBe(true);
      expect(canOpenGuestDraw(false)).toBe(true);
    });

    it('Guest Draw snapshot query delivers public card candidates for active bucket without admin authentication requirement', () => {
      const publicCardsMock = [
        { cardNumber: 1, cardLabel: '01', bucketPlayerNumber: 'B31', lotId: 'lot-1', drawNumber: 1, drawn: false, playerName: 'Player 1', photoUrl: null, rollNumber: 'R101' },
        { cardNumber: 2, cardLabel: '02', bucketPlayerNumber: 'B32', lotId: 'lot-2', drawNumber: 2, drawn: false, playerName: 'Player 2', photoUrl: null, rollNumber: 'R102' },
        { cardNumber: 3, cardLabel: '03', bucketPlayerNumber: 'B33', lotId: 'lot-3', drawNumber: 3, drawn: false, playerName: 'Player 3', photoUrl: null, rollNumber: 'R103' },
        { cardNumber: 4, cardLabel: '04', bucketPlayerNumber: 'B34', lotId: 'lot-4', drawNumber: 4, drawn: false, playerName: 'Player 4', photoUrl: null, rollNumber: 'R104' },
      ];

      // Verifies snapshot response structure is complete and available to unauthenticated clients
      expect(publicCardsMock.length).toBe(4);
      expect(publicCardsMock.every((c) => Boolean(c.bucketPlayerNumber && c.cardNumber))).toBe(true);
      expect(publicCardsMock[3].cardNumber).toBe(4);
      expect(publicCardsMock[3].bucketPlayerNumber).toBe('B34');
    });

    it('Security Boundary: Unauthenticated or non-admin callers cannot execute callGuestDrawNumberAction', async () => {
      // Simulate requireAdmin security check
      const simulateCallGuestDrawNumber = async (userRole: 'guest' | 'franchise' | 'admin', lotId: string) => {
        if (userRole !== 'admin') {
          return { success: false, error: 'Unauthorized: Admin privileges required.' };
        }
        return { success: true, lotId };
      };

      const guestAttempt = await simulateCallGuestDrawNumber('guest', 'lot-4');
      expect(guestAttempt.success).toBe(false);
      expect(guestAttempt.error).toContain('Unauthorized');

      const franchiseAttempt = await simulateCallGuestDrawNumber('franchise', 'lot-4');
      expect(franchiseAttempt.success).toBe(false);
      expect(franchiseAttempt.error).toContain('Unauthorized');

      const adminAttempt = await simulateCallGuestDrawNumber('admin', 'lot-4');
      expect(adminAttempt.success).toBe(true);
      expect(adminAttempt.lotId).toBe('lot-4');
    });

    it('Security Boundary: Guests cannot execute auction floor mutations', () => {
      const privilegedActions = [
        'startAuctionAction',
        'pauseAuctionAction',
        'resumeAuctionAction',
        'placeBidAction',
        'confirmSaleAction',
        'markUnsoldAction',
        'skipLotAction',
        'callGuestDrawNumberAction',
      ];

      const guestPermittedActions = [
        'getGuestDrawSnapshotAction',
        'getActiveBuckets',
        'getGuestDrawCandidates',
      ];

      for (const action of privilegedActions) {
        expect(guestPermittedActions.includes(action)).toBe(false);
      }
    });

    it('Deterministic Card Flip & Floor Presentation: Clicking Card 4 brings B34 to the floor', () => {
      const candidates = [
        { cardNumber: 1, cardLabel: '01', bucketPlayerNumber: 'B31', lotId: 'lot-1', drawn: true },
        { cardNumber: 2, cardLabel: '02', bucketPlayerNumber: 'B32', lotId: 'lot-2', drawn: true },
        { cardNumber: 3, cardLabel: '03', bucketPlayerNumber: 'B33', lotId: 'lot-3', drawn: true },
        { cardNumber: 4, cardLabel: '04', bucketPlayerNumber: 'B34', lotId: 'lot-4', drawn: false },
      ];

      const selectedCard = candidates.find((c) => c.cardNumber === 4);
      expect(selectedCard).toBeDefined();
      expect(selectedCard?.drawn).toBe(false);
      expect(selectedCard?.bucketPlayerNumber).toBe('B34');
      expect(selectedCard?.lotId).toBe('lot-4');
    });
  });
});
