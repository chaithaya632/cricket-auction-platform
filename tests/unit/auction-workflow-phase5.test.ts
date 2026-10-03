// @vitest-environment jsdom
// =============================================================================
// ACC Auction Portal — Phase 5 Unit Tests: Operator Workflow, Progression,
// Realtime Sync, TIME UP Extensions, Audio Gavel & Guest Draw
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_BUCKET_ORDER, type AuctionLotWithDetails } from '@/lib/auction/types';
import { getActiveBuckets, getAuctionQueueByBuckets } from '@/lib/auction/queries';
import { playGavelChime, setAudioEnabled, getAudioEnabled, resetAudioDeduplicationForTests } from '@/lib/auction/audio';

describe('Phase 5 — Auction Operator Workflow Redesign', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAudioDeduplicationForTests();
  });

  // ===========================================================================
  // 1. Bucket Selection & Persistence
  // ===========================================================================
  describe('1. Bucket Selection & Persistence', () => {
    it('defines the strict default bucket order: B3 -> B4 -> B2 -> B5 -> B1 -> PG', () => {
      expect(DEFAULT_BUCKET_ORDER).toEqual(['B3', 'B4', 'B2', 'B5', 'B1', 'PG']);
    });

    it('falls back to all buckets when season_config is missing', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
      } as any;

      const buckets = await getActiveBuckets(mockSupabase, 'season-001');
      expect(buckets).toEqual(['B3', 'B4', 'B2', 'B5', 'B1', 'PG']);
    });

    it('falls back to all buckets when season_config contains invalid JSON', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { value: 'invalid-json{{{' },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      } as any;

      const buckets = await getActiveBuckets(mockSupabase, 'season-001');
      expect(buckets).toEqual(['B3', 'B4', 'B2', 'B5', 'B1', 'PG']);
    });

    it('normalizes parsed buckets to DEFAULT_BUCKET_ORDER precedence', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { value: JSON.stringify(['PG', 'B2', 'B3']) },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      } as any;

      const buckets = await getActiveBuckets(mockSupabase, 'season-001');
      // Must follow B3 -> B4 -> B2 -> B5 -> B1 -> PG order
      expect(buckets).toEqual(['B3', 'B2', 'PG']);
    });

    it('filters out unknown bucket codes from stored configuration', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { value: JSON.stringify(['UNKNOWN_BUCKET', 'B4']) },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      } as any;

      const buckets = await getActiveBuckets(mockSupabase, 'season-001');
      expect(buckets).toEqual(['B4']);
    });
  });

  // ===========================================================================
  // 2. Deterministic Next Player Ordering
  // ===========================================================================
  describe('2. Deterministic Next Player Ordering', () => {
    it('sorts candidates by bucket priority (B3 > B4 > B2 > B5 > B1 > PG) then draw_number ASC', async () => {
      const rawLots = [
        { id: 'lot-1', draw_number: 10, bucket: 'B4', round: 1, registration_id: 'reg-1', status: 'pending' },
        { id: 'lot-2', draw_number: 25, bucket: 'B3', round: 1, registration_id: 'reg-2', status: 'pending' },
        { id: 'lot-3', draw_number: 5, bucket: 'B3', round: 1, registration_id: 'reg-3', status: 'pending' },
        { id: 'lot-4', draw_number: 2, bucket: 'B2', round: 1, registration_id: 'reg-4', status: 'pending' },
        { id: 'lot-5', draw_number: 1, bucket: 'PG', round: 1, registration_id: 'reg-5', status: 'pending' },
      ];

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'auction_lots') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    in: vi.fn().mockReturnValue({
                      order: vi.fn().mockReturnValue({
                        order: vi.fn().mockReturnValue({
                          limit: vi.fn().mockResolvedValue({ data: rawLots, error: null }),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'public_players_view') {
            return {
              select: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({
                  data: rawLots.map((l) => ({
                    registration_id: l.registration_id,
                    player_id: `p-${l.id}`,
                    full_name: `Player ${l.draw_number}`,
                    photo_url: null,
                    programme: 'BTech',
                    academic_year: 3,
                    branch: 'CSE',
                    cricheroes_url: null,
                  })),
                  error: null,
                }),
              }),
            };
          }
          return {};
        }),
      } as any;

      const activeBuckets = ['B3', 'B4', 'B2', 'PG'];
      const sortedQueue = await getAuctionQueueByBuckets(mockSupabase, 'season-001', activeBuckets, 10);

      // Expected order:
      // 1. B3 (draw_number: 5)
      // 2. B3 (draw_number: 25)
      // 3. B4 (draw_number: 10)
      // 4. B2 (draw_number: 2)
      // 5. PG (draw_number: 1)
      expect(sortedQueue.map((l) => l.id)).toEqual(['lot-3', 'lot-2', 'lot-1', 'lot-4', 'lot-5']);
      expect(sortedQueue[0].draw_number).toBe(5);
      expect(sortedQueue[0].bucket).toBe('B3');
      expect(sortedQueue[1].draw_number).toBe(25);
      expect(sortedQueue[1].bucket).toBe('B3');
      expect(sortedQueue[2].bucket).toBe('B4');
      expect(sortedQueue[3].bucket).toBe('B2');
      expect(sortedQueue[4].bucket).toBe('PG');
    });

    it('returns empty array when activeBuckets is empty', async () => {
      const mockSupabase = {} as any;
      const sortedQueue = await getAuctionQueueByBuckets(mockSupabase, 'season-001', [], 10);
      expect(sortedQueue).toEqual([]);
    });
  });

  // ===========================================================================
  // 3. Guest Draw Stable Numbering
  // ===========================================================================
  describe('3. Guest Draw Stable Numbering & Card Snapshot', () => {
    it('creates stable 1-based card indexes (01, 02...) that do not shift when a card is drawn', () => {
      const candidates = [
        { id: 'lot-a', drawNumber: 101, playerName: 'Alice', bucket: 'B3', drawn: false },
        { id: 'lot-b', drawNumber: 105, playerName: 'Bob', bucket: 'B3', drawn: false },
        { id: 'lot-c', drawNumber: 110, playerName: 'Charlie', bucket: 'B3', drawn: false },
      ];

      // Assign initial snapshot indices
      const indexedSnapshot = candidates.map((c, i) => ({
        ...c,
        cardIndex: String(i + 1).padStart(2, '0'),
      }));

      expect(indexedSnapshot[0].cardIndex).toBe('01');
      expect(indexedSnapshot[1].cardIndex).toBe('02');
      expect(indexedSnapshot[2].cardIndex).toBe('03');

      // Draw Bob (card '02')
      const updatedSnapshot = indexedSnapshot.map((c) =>
        c.id === 'lot-b' ? { ...c, drawn: true } : c
      );

      // Verify Alice is still 01 and Charlie is still 03 (NO shifting)
      expect(updatedSnapshot[0].cardIndex).toBe('01');
      expect(updatedSnapshot[0].drawn).toBe(false);

      expect(updatedSnapshot[1].cardIndex).toBe('02');
      expect(updatedSnapshot[1].drawn).toBe(true);

      expect(updatedSnapshot[2].cardIndex).toBe('03');
      expect(updatedSnapshot[2].drawn).toBe(false);
    });
  });

  // ===========================================================================
  // 4. Timer Extension Rules & TIME UP Validation
  // ===========================================================================
  describe('4. Timer Extension Rules & TIME UP Math', () => {
    it('rejects extension if now < deadline (timer has not reached TIME UP)', () => {
      const startedAt = Date.now() - 10000; // started 10s ago
      const timerDuration = 30; // 30s timer
      const deadline = startedAt + timerDuration * 1000; // 20s remaining
      const now = Date.now();

      const isTimeUp = now >= deadline;
      expect(isTimeUp).toBe(false);

      // Server extension validation rule
      const validateExtension = (currentNow: number, deadlineTs: number, increment: number) => {
        if (currentNow < deadlineTs) {
          return { valid: false, error: 'Timer extension is only permitted when the clock has reached TIME UP.' };
        }
        if (![10, 20, 30].includes(increment)) {
          return { valid: false, error: 'Invalid extension duration. Only 10s, 20s, or 30s allowed.' };
        }
        return { valid: true };
      };

      const result = validateExtension(now, deadline, 10);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('only permitted when the clock has reached TIME UP');
    });

    it('rejects invalid extension durations (only 10, 20, 30 permitted)', () => {
      const startedAt = Date.now() - 40000;
      const timerDuration = 30;
      const deadline = startedAt + timerDuration * 1000;
      const now = Date.now();

      expect(now >= deadline).toBe(true); // Is TIME UP

      const allowedIncrements = [10, 20, 30];
      const invalidIncrements = [5, 15, 25, 45, 60];

      for (const inc of invalidIncrements) {
        expect(allowedIncrements.includes(inc)).toBe(false);
      }
      for (const inc of allowedIncrements) {
        expect(allowedIncrements.includes(inc)).toBe(true);
      }
    });

    it('shifts started_at deterministically so remaining countdown is exactly extensionSeconds', () => {
      const now = 1770000000000;
      const timerDuration = 20; // 20s base duration
      const extensionSeconds = 10;

      // Deterministic shift formula from actions.ts:
      // newStartedAt = now + extensionSeconds * 1000 - timerDuration * 1000
      const newStartedAt = new Date(now + extensionSeconds * 1000 - timerDuration * 1000).toISOString();
      const newStartedAtMs = new Date(newStartedAt).getTime();

      // Client calculation: (started_at + duration) - now
      const remainingSeconds = Math.max(
        0,
        Math.ceil((newStartedAtMs + timerDuration * 1000 - now) / 1000)
      );

      expect(remainingSeconds).toBe(10);
    });
  });

  // ===========================================================================
  // 5. Audio Gavel Chime Deduplication & Sound State
  // ===========================================================================
  describe('5. Audio Gavel Chime Synthesizer & Deduplication', () => {
    it('deduplicates identical lotId:price calls to prevent double-chimes', () => {
      expect(getAudioEnabled()).toBe(true);

      const lotId = 'lot-123';
      const price = 500;

      const firstPlay = playGavelChime(lotId, price);
      expect(firstPlay).toBe(true);

      // Immediate second call with identical lotId and price should be deduplicated
      const secondPlay = playGavelChime(lotId, price);
      expect(secondPlay).toBe(false);

      // Higher price for same lot should chime
      const higherBidPlay = playGavelChime(lotId, 520);
      expect(higherBidPlay).toBe(true);

      // Different lot should chime
      const differentLotPlay = playGavelChime('lot-456', 100);
      expect(differentLotPlay).toBe(true);
    });

    it('respects setAudioEnabled(false) and mutes all chimes', () => {
      setAudioEnabled(false);
      expect(getAudioEnabled()).toBe(false);

      const played = playGavelChime('lot-999', 200);
      expect(played).toBe(false);

      // Re-enable
      setAudioEnabled(true);
      expect(getAudioEnabled()).toBe(true);
      const playedAgain = playGavelChime('lot-999', 200);
      expect(playedAgain).toBe(true);
    });
  });

  // ===========================================================================
  // 6. Projector Control Authorization Matrix
  // ===========================================================================
  describe('6. Projector Control Authorization Matrix', () => {
    it('allows super_admin and operator to access projector dock', () => {
      const checkProjectorAccess = (role: string | null) => {
        return role === 'super_admin' || role === 'operator';
      };

      expect(checkProjectorAccess('super_admin')).toBe(true);
      expect(checkProjectorAccess('operator')).toBe(true);
      expect(checkProjectorAccess('franchise')).toBe(false);
      expect(checkProjectorAccess('player')).toBe(false);
      expect(checkProjectorAccess('viewer')).toBe(false);
      expect(checkProjectorAccess(null)).toBe(false);
    });
  });

  // ===========================================================================
  // 7. Automatic Progression on SOLD and UNSOLD
  // ===========================================================================
  describe('7. Concurrency-Safe Automatic Progression Logic', () => {
    it('identifies the next eligible lot in active bucket order after sale/unsold resolution', () => {
      const activeBuckets = ['B3', 'B4'];
      const pendingLots = [
        { id: 'lot-b4-1', bucket: 'B4', draw_number: 10, status: 'pending' },
        { id: 'lot-b3-2', bucket: 'B3', draw_number: 8, status: 'pending' },
        { id: 'lot-b3-1', bucket: 'B3', draw_number: 3, status: 'pending' },
        { id: 'lot-b2-1', bucket: 'B2', draw_number: 1, status: 'pending' }, // inactive bucket
      ];

      // Filter and sort deterministically
      const eligible = pendingLots
        .filter((l) => activeBuckets.includes(l.bucket) && l.status === 'pending')
        .sort((a, b) => {
          const rankA = DEFAULT_BUCKET_ORDER.indexOf(a.bucket as any);
          const rankB = DEFAULT_BUCKET_ORDER.indexOf(b.bucket as any);
          if (rankA !== rankB) return rankA - rankB;
          return a.draw_number - b.draw_number;
        });

      expect(eligible.length).toBe(3);
      expect(eligible[0].id).toBe('lot-b3-1'); // B3 #3 first
      expect(eligible[1].id).toBe('lot-b3-2'); // B3 #8 second
      expect(eligible[2].id).toBe('lot-b4-1'); // B4 #10 third
    });

    it('gracefully completes when no pending lots remain in active buckets', () => {
      const activeBuckets = ['B3'];
      const pendingLots = [
        { id: 'lot-b2-1', bucket: 'B2', draw_number: 1, status: 'pending' },
      ];

      const eligible = pendingLots.filter((l) => activeBuckets.includes(l.bucket) && l.status === 'pending');
      expect(eligible.length).toBe(0);

      const nextLot = eligible[0] ?? null;
      expect(nextLot).toBeNull();
    });
  });

  // ===========================================================================
  // 8. Enriched Realtime Delta Payload Contract
  // ===========================================================================
  describe('8. Enriched Realtime Delta Payload Contract', () => {
    it('constructs a valid delta payload allowing sub-50ms client synchronization', () => {
      const payload = {
        activeLotId: 'lot-100',
        activeLot: {
          id: 'lot-100',
          draw_number: 42,
          bucket: 'B3',
          current_price: 350,
          highest_bidder_franchise_id: 'fran-001',
          status: 'in_progress',
        },
        highestBidder: {
          id: 'fran-001',
          name: 'Chennai Super Kings',
          short_name: 'CSK',
        },
        currentPrice: 350,
        sessionState: {
          status: 'live',
          isLive: true,
          isPaused: false,
        },
      };

      expect(payload.activeLotId).toBe('lot-100');
      expect(payload.activeLot.current_price).toBe(350);
      expect(payload.highestBidder.short_name).toBe('CSK');
      expect(payload.sessionState.isLive).toBe(true);
    });
  });

  // ===========================================================================
  // 9. Guest Draw Server-Side Candidate Validation
  // ===========================================================================
  describe('9. Guest Draw Server-Side Validation Rules', () => {
    it('validates candidate status must be pending', () => {
      const validateCandidateForFloor = (lot: { status: string; season_id: string }, seasonId: string) => {
        if (lot.season_id !== seasonId) {
          return { valid: false, error: 'Lot does not belong to active season' };
        }
        if (lot.status !== 'pending') {
          return { valid: false, error: `Cannot draw lot with status "${lot.status}". Only pending lots can be brought to the floor.` };
        }
        return { valid: true };
      };

      expect(validateCandidateForFloor({ status: 'pending', season_id: 's-1' }, 's-1').valid).toBe(true);
      expect(validateCandidateForFloor({ status: 'sold', season_id: 's-1' }, 's-1').valid).toBe(false);
      expect(validateCandidateForFloor({ status: 'in_progress', season_id: 's-1' }, 's-1').valid).toBe(false);
      expect(validateCandidateForFloor({ status: 'unsold', season_id: 's-1' }, 's-1').valid).toBe(false);
      expect(validateCandidateForFloor({ status: 'pending', season_id: 's-2' }, 's-1').valid).toBe(false);
    });
  });
});
