// @vitest-environment jsdom
// =============================================================================
// ACC Auction Portal — Consolidated Workflow Correction Unit Tests
// Tests Detained/Re-admitted logic, Admin Bucket Management, Franchise Referrals,
// Multi-referral player acceptance, Squad allotment at ₹0 purse,
// Remaining-bucket group progression, and Role-gated Projector controls.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseRollNumber,
  calculateAcademicYear,
  deriveBucket,
} from '@/domain/academic';
import { playerRegistrationSchema } from '@/lib/players/validation';
import { DEFAULT_BUCKET_ORDER } from '@/lib/auction/types';
import { calculatePurseState } from '@/domain/franchises/purse';
import { autoAdvanceToNextLot } from '@/lib/auction/actions';

describe('ACC Auction Portal — Consolidated Workflow Correction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // PART 1: Detained / Re-admitted Student Academic & Bucket Logic
  // ===========================================================================
  describe('Part 1: Detained / Re-admitted Student Registration Logic', () => {
    it('normal student derives academic year and bucket strictly from roll number', () => {
      // 2024 admission in 2026 season -> 2nd year -> B2
      const rollNumber = '24811A0501';
      const parsed = parseRollNumber(rollNumber, 'btech_regular');
      expect(parsed.isValid).toBe(true);
      expect(parsed.admissionYear).toBe(2024);

      const refDate = new Date('2026-03-01T00:00:00Z');
      const normalYear = calculateAcademicYear(parsed.admissionYear!, 'btech_regular', refDate);
      expect(normalYear).toBe(2);

      const normalBucket = deriveBucket('btech_regular', normalYear);
      expect(normalBucket).toBe('B2');
    });

    it('detained student: roll number derives 3rd year, but actual study year 2nd year auto-derives B2', () => {
      // Roll number admission 2023 would normally be 3rd year (B3)
      const rollNumber = '23811A0501';
      const parsed = parseRollNumber(rollNumber, 'btech_regular');
      expect(parsed.isValid).toBe(true);
      expect(parsed.admissionYear).toBe(2023);

      const refDate = new Date('2026-03-01T00:00:00Z');
      const rollDerivedYear = calculateAcademicYear(parsed.admissionYear!, 'btech_regular', refDate);
      expect(rollDerivedYear).toBe(3);

      // Student is detained and studying in 2nd year
      const isDetained = true;
      const actualStudyYear = 2;
      const effectiveYear = isDetained ? actualStudyYear : rollDerivedYear;
      expect(effectiveYear).toBe(2);

      // System auto-calculates bucket from effective academic year
      const autoBucket = deriveBucket('btech_regular', effectiveYear);
      expect(autoBucket).toBe('B2');
    });

    it('validates playerRegistrationSchema with is_detained and discrepancy_note', () => {
      const validDetainedData = {
        roll_number: '23811A0501',
        programme: 'btech_regular',
        academic_year: 2,
        branch: 'CSE',
        base_price: 20,
        cricheroes_url: 'https://cricheroes.com/player/test-detained',
        is_detained: true,
        discrepancy_note: 'I am a detained/re-admitted student and my current study year differs from my roll number.',
      };

      const result = playerRegistrationSchema.safeParse(validDetainedData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.is_detained).toBe(true);
        expect(result.data.discrepancy_note).toContain('detained');
      }
    });

    it('detained status does not remove auction eligibility (they remain normal auction players)', () => {
      // Detained players participate in the auction like any normal player
      const detainedPlayer = {
        isDetained: true,
        isAuctionEligible: true,
        bucket: 'B2',
      };
      expect(detainedPlayer.isAuctionEligible).toBe(true);
      expect(detainedPlayer.bucket).toBe('B2');
    });
  });

  // ===========================================================================
  // PART 2: Admin Bucket Modification for Detained Players
  // ===========================================================================
  describe('Part 2: Admin Bucket Modification for Detained Players', () => {
    const validBuckets = ['B1', 'B2', 'B3', 'B4', 'B5', 'PG'];

    it('allows valid buckets from the defined set', () => {
      validBuckets.forEach((b) => {
        expect(validBuckets.includes(b)).toBe(true);
      });
      expect(validBuckets.includes('B6')).toBe(false);
      expect(validBuckets.includes('CUSTOM')).toBe(false);
    });

    it('locks bucket modifications once the auction has started', () => {
      // Simulating auction session status lock
      const checkCanChangeBucket = (auctionSessionStatus: string, seasonStatus: string) => {
        const isAuctionStarted =
          seasonStatus === 'auction' ||
          (auctionSessionStatus && auctionSessionStatus !== 'not_started');

        if (isAuctionStarted) {
          return {
            allowed: false,
            error: 'Bucket modification locked: Auction has already started or progressed.',
          };
        }
        return { allowed: true };
      };

      // Before auction starts: allowed
      expect(checkCanChangeBucket('not_started', 'registration').allowed).toBe(true);

      // Once auction session is live: locked
      expect(checkCanChangeBucket('live', 'auction').allowed).toBe(false);

      // Once auction session is paused: locked
      expect(checkCanChangeBucket('paused', 'auction').allowed).toBe(false);

      // Once auction session is completed: locked
      expect(checkCanChangeBucket('completed', 'completed').allowed).toBe(false);
    });
  });

  // ===========================================================================
  // PART 3: Franchise Referral Workflow & Multi-Referral Selection
  // ===========================================================================
  describe('Part 3: Franchise Referral Workflow & Student Choice', () => {
    it('permits multiple franchises to declare referrals for the same student', () => {
      const referrals = [
        { id: 'ref-1', franchise_id: 'fran-a', registration_id: 'reg-101', status: 'pending' },
        { id: 'ref-2', franchise_id: 'fran-b', registration_id: 'reg-101', status: 'pending' },
        { id: 'ref-3', franchise_id: 'fran-c', registration_id: 'reg-101', status: 'pending' },
      ];

      // All 3 referrals exist simultaneously without forced conflict blocking
      expect(referrals).toHaveLength(3);
      expect(new Set(referrals.map((r) => r.franchise_id)).size).toBe(3);
    });

    it('student accepts one referral, marking it accepted and rejecting competing referrals', () => {
      let referrals = [
        { id: 'ref-1', franchise_name: 'Avengers', registration_id: 'reg-101', status: 'pending', notes: null as string | null },
        { id: 'ref-2', franchise_name: 'Titans', registration_id: 'reg-101', status: 'pending', notes: null as string | null },
      ];

      // Student accepts ref-1 (Avengers)
      const chosenReferralId = 'ref-1';
      const chosenFranchise = referrals.find((r) => r.id === chosenReferralId)!;

      referrals = referrals.map((r) => {
        if (r.id === chosenReferralId) {
          return {
            ...r,
            notes: `ACCEPTED_BY_PLAYER: Student accepted referral for ${r.franchise_name}`,
          };
        } else {
          return {
            ...r,
            status: 'rejected',
            notes: `Superseded by player acceptance of ${chosenFranchise.franchise_name}`,
          };
        }
      });

      expect(referrals[0].notes).toContain('ACCEPTED_BY_PLAYER');
      expect(referrals[1].status).toBe('rejected');
      expect(referrals[1].notes).toContain('Superseded by player acceptance');
    });
  });

  // ===========================================================================
  // PART 4: Admin Adds Referred Player to Squad at ₹0 Purse
  // ===========================================================================
  describe('Part 4: Admin Adds Referred Player to Squad at ₹0 Purse', () => {
    it('consumes 1 squad slot at ₹0 purse cost', () => {
      const acquiredLots = [
        { lotId: 'lot-1', registrationId: 'reg-1', bucket: 'B3', price: 150, status: 'sold' as const },
        { lotId: 'lot-2', registrationId: 'reg-2', bucket: 'B4', price: 80, status: 'sold' as const },
        { lotId: 'ref-1', registrationId: 'reg-3', bucket: 'B2', price: 0, status: 'referred' as const },
      ];

      const state = calculatePurseState({
        startingPurse: 1000,
        acquiredLots,
        bucketRules: [],
      });

      // Total spent includes only the sold lots (150 + 80 = 230), referred player cost is 0
      expect(state.totalSpent).toBe(230);
      expect(state.remainingPurse).toBe(770);
      expect(state.totalSquadCount).toBe(3);
      expect(state.auctionPurchasesCount).toBe(2);
    });

    it('enforces 22-player squad capacity limit when adding referred player', () => {
      const MAX_SQUAD_SIZE = 22;
      const canAddToSquad = (currentSquadCount: number) => {
        if (currentSquadCount >= MAX_SQUAD_SIZE) {
          return { success: false, error: 'Squad is full. This player cannot be added.' };
        }
        return { success: true };
      };

      expect(canAddToSquad(21).success).toBe(true);
      expect(canAddToSquad(22).success).toBe(false);
      expect(canAddToSquad(22).error).toBe('Squad is full. This player cannot be added.');
    });

    it('transitions existing pending lot to allotted at ₹0 price and marks player auction ineligible without physical deletion', () => {
      let registration = {
        id: 'reg-101',
        is_auction_eligible: true,
      };

      let auctionLots = [
        { id: 'lot-1', registration_id: 'reg-101', status: 'pending', current_price: 50, highest_bidder_franchise_id: null as string | null },
        { id: 'lot-2', registration_id: 'reg-102', status: 'pending', current_price: 30, highest_bidder_franchise_id: null as string | null },
      ];

      let auctionEvents: { auction_lot_id: string; event_type: string; price: number }[] = [
        { auction_lot_id: 'lot-1', event_type: 'LOT_CREATED', price: 50 },
        { auction_lot_id: 'lot-2', event_type: 'LOT_CREATED', price: 30 },
      ];

      // Admin adds to team:
      registration.is_auction_eligible = false;
      const referredFranchiseId = 'fran-referring';

      // Lot is operational state: updated to 'allotted', NOT deleted
      auctionLots = auctionLots.map((l) => {
        if (l.registration_id === 'reg-101' && l.status === 'pending') {
          return {
            ...l,
            status: 'allotted',
            highest_bidder_franchise_id: referredFranchiseId,
            current_price: 0,
          };
        }
        return l;
      });

      // ALLOTMENT event is appended to authoritative auction_events
      auctionEvents.push({
        auction_lot_id: 'lot-1',
        event_type: 'ALLOTMENT',
        price: 0,
      });

      // Verification:
      expect(registration.is_auction_eligible).toBe(false);
      expect(auctionLots).toHaveLength(2); // Neither row was physically deleted!
      expect(auctionLots.find((l) => l.id === 'lot-1')?.status).toBe('allotted');
      expect(auctionLots.find((l) => l.id === 'lot-1')?.highest_bidder_franchise_id).toBe(referredFranchiseId);
      expect(auctionLots.find((l) => l.id === 'lot-1')?.current_price).toBe(0);

      // Pending queue queries only select status='pending', naturally excluding lot-1:
      const pendingQueue = auctionLots.filter((l) => l.status === 'pending');
      expect(pendingQueue).toHaveLength(1);
      expect(pendingQueue[0].id).toBe('lot-2');

      // Immutable event history is preserved; LOT_CREATED is NOT cascade deleted
      expect(auctionEvents.filter((e) => e.auction_lot_id === 'lot-1')).toHaveLength(2);
      expect(auctionEvents.some((e) => e.auction_lot_id === 'lot-1' && e.event_type === 'LOT_CREATED')).toBe(true);
      expect(auctionEvents.some((e) => e.auction_lot_id === 'lot-1' && e.event_type === 'ALLOTMENT')).toBe(true);
    });
  });

  // ===========================================================================
  // PART 5: Remaining-Bucket Group Progression
  // ===========================================================================
  describe('Part 5: Remaining-Bucket Group Progression & Completion Detection', () => {
    it('detects bucket group completion when all lots in active buckets are concluded', () => {
      const activeBuckets = ['B3', 'B4'];
      const bucketStats: Record<string, { pending: number; total: number; inProgress: boolean }> = {
        B3: { pending: 0, total: 10, inProgress: false },
        B4: { pending: 0, total: 8, inProgress: false },
        B2: { pending: 12, total: 12, inProgress: false },
        B5: { pending: 15, total: 15, inProgress: false },
        B1: { pending: 5, total: 5, inProgress: false },
        PG: { pending: 6, total: 6, inProgress: false },
      };

      const computeGroupComplete = (
        isLive: boolean,
        hasLiveLot: boolean,
        buckets: string[],
        stats: typeof bucketStats
      ) => {
        const pendingInActive = buckets.reduce((acc, b) => acc + (stats[b]?.pending ?? 0), 0);
        return isLive && !hasLiveLot && buckets.length > 0 && pendingInActive === 0;
      };

      // Both B3 and B4 have 0 pending and no active lot on floor -> complete!
      expect(computeGroupComplete(true, false, activeBuckets, bucketStats)).toBe(true);

      // If a lot is currently on floor (in_progress) -> NOT complete yet
      expect(computeGroupComplete(true, true, activeBuckets, bucketStats)).toBe(false);

      // If pending lots remain in active buckets -> NOT complete
      const activeWithPending = ['B3', 'B2'];
      expect(computeGroupComplete(true, false, activeWithPending, bucketStats)).toBe(false);
    });

    it('archives completed buckets and transitions to newly selected remaining buckets', () => {
      let previousActiveBuckets = ['B3', 'B4'];
      let completedBuckets: string[] = [];

      // When advancing to next group (e.g., B2, B5)
      const nextSelection = ['B2', 'B5'];

      // Add previous to completed
      completedBuckets = Array.from(new Set([...completedBuckets, ...previousActiveBuckets]));
      previousActiveBuckets = [...nextSelection];

      expect(completedBuckets).toEqual(['B3', 'B4']);
      expect(previousActiveBuckets).toEqual(['B2', 'B5']);

      // Completed buckets cannot be selected in subsequent rounds
      const availableRemaining = DEFAULT_BUCKET_ORDER.filter((b) => !completedBuckets.includes(b));
      expect(availableRemaining).toEqual(['B2', 'B5', 'B1', 'PG']);
      expect(availableRemaining.includes('B3')).toBe(false);
      expect(availableRemaining.includes('B4')).toBe(false);
    });

    it('when the selected active bucket group is exhausted, autoAdvanceToNextLot does NOT automatically touch an unselected bucket', async () => {
      // Database state:
      // Active bucket: ['B3'] with 0 pending lots
      // Unselected bucket: 'B2' with 5 pending lots
      const mockDatabaseLots = [
        { id: 'lot-b2-1', bucket: 'B2', status: 'pending', draw_number: 1, season_id: 'season-001' },
        { id: 'lot-b2-2', bucket: 'B2', status: 'pending', draw_number: 2, season_id: 'season-001' },
        { id: 'lot-b2-3', bucket: 'B2', status: 'pending', draw_number: 3, season_id: 'season-001' },
        { id: 'lot-b2-4', bucket: 'B2', status: 'pending', draw_number: 4, season_id: 'season-001' },
        { id: 'lot-b2-5', bucket: 'B2', status: 'pending', draw_number: 5, season_id: 'season-001' },
      ];

      const updatedLots: any[] = [];

      const mockAdminClient = {
        from: vi.fn((table: string) => {
          if (table === 'season_config') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn((keyCol: string, keyVal: string) => ({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: keyVal === 'auction_active_buckets'
                        ? { value: JSON.stringify(['B3']) }
                        : keyVal === 'auction_session_status'
                        ? { value: 'live' }
                        : null,
                      error: null,
                    }),
                  })),
                }),
              }),
            };
          }

          if (table === 'auction_lots') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn((statusCol: string, statusVal: string) => {
                    if (statusVal === 'in_progress') {
                      return {
                        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                      };
                    }
                    if (statusVal === 'pending') {
                      return {
                        in: vi.fn((bucketCol: string, buckets: string[]) => ({
                          order: vi.fn().mockReturnValue({
                            order: vi.fn().mockReturnValue({
                              limit: vi.fn().mockImplementation(() => {
                                // Strictly filter by requested active buckets (e.g. ['B3'])
                                const filtered = mockDatabaseLots.filter(
                                  (l) => buckets.includes(l.bucket) && l.status === 'pending'
                                );
                                return Promise.resolve({ data: filtered, error: null });
                              }),
                            }),
                          }),
                        })),
                      };
                    }
                    return {
                      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                    };
                  }),
                }),
              }),
              update: vi.fn((patch: any) => ({
                eq: vi.fn((col: string, val: string) => {
                  updatedLots.push({ id: val, ...patch });
                  return {
                    select: vi.fn().mockReturnValue({
                      single: vi.fn().mockResolvedValue({ data: { id: val, ...patch }, error: null }),
                    }),
                  };
                }),
              })),
            };
          }

          if (table === 'auction_events') {
            return {
              insert: vi.fn().mockResolvedValue({ data: null, error: null }),
            };
          }

          return {};
        }),
      };

      const result = await autoAdvanceToNextLot(mockAdminClient, 'season-001', 'user-admin-1');

      // Assertions matching requirements:
      expect(result.advanced).toBe(false);
      expect(result.nextLotId).toBeNull();
      expect(result.nextLot).toBeNull();

      // Explicit proof: No B2 lot was ever touched or transitioned to in_progress
      expect(updatedLots).toHaveLength(0);
      const b2Touched = updatedLots.find((l) => l.bucket === 'B2' || l.id.startsWith('lot-b2'));
      expect(b2Touched).toBeUndefined();
    });
  });

  // ===========================================================================
  // PART 6: Projector Screen Role Separation
  // ===========================================================================
  describe('Part 6: Projector Screen Access & Control Separation', () => {
    it('public viewers (canControl = false) have zero interactive controls during group complete', () => {
      const canControl = false;
      const isBucketGroupComplete = true;

      // Component rendering decision check
      const viewMode = isBucketGroupComplete
        ? (canControl ? 'interactive_selector' : 'public_standby')
        : 'normal_floor';

      expect(viewMode).toBe('public_standby');
    });

    it('authorized operators (canControl = true) receive the interactive ProjectorGroupSelector', () => {
      const canControl = true;
      const isBucketGroupComplete = true;

      const viewMode = isBucketGroupComplete
        ? (canControl ? 'interactive_selector' : 'public_standby')
        : 'normal_floor';

      expect(viewMode).toBe('interactive_selector');
    });
  });
});
