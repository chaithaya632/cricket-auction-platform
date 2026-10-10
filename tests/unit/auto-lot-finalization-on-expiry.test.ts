// =============================================================================
// ACC Auction Portal — Test Suite: Automatic Lot Finalization on Expiry & Guest Draw Timing
// =============================================================================
// Comprehensive verification for:
// 1. Authoritative server-side deadline calculation & post-deadline bid rejection
// 2. Automatic lot finalization (SOLD with purse deduction / UNSOLD) on timer expiry
// 3. Concurrency safety, single-terminal outcome, and strict idempotency
// 4. Operator disconnection / multi-client headless finalization resilience
// 5. Pause & resume deadline adjustments
// 6. Guest Draw immediate broadcast upon DB selection commit with zero startup delay
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  finalizeExpiredLotAction,
  placeBidAction,
  callGuestDrawNumberAction,
} from '@/lib/auction/actions';
import * as guardsLib from '@/lib/permissions/guards';
import * as supabaseAdmin from '@/lib/supabase/admin';
import * as realtimeLib from '@/lib/auction/realtime';
import * as transactionLib from '@/lib/auction/transaction';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

// Mock franchise squad query for bidding
vi.mock('@/lib/franchises/queries', () => ({
  getFranchiseSquadData: vi.fn().mockResolvedValue({
    franchise: { id: 'fran-mi', name: 'Mumbai Indians', short_name: 'MI' },
    purseState: {
      remainingPurse: 5000,
      totalSquadCount: 10,
      auctionPurchasesCount: 5,
    },
    bucketProgress: {
      buckets: [],
    },
  }),
}));

// Mock realtime broadcast
const mockBroadcast = vi.spyOn(realtimeLib, 'broadcastAuctionUpdate').mockResolvedValue(undefined);

function createMockSupabase(options: {
  lot?: any;
  configRows?: Array<{ key: string; value: string }>;
  sessionStatus?: string;
}) {
  const lot = options.lot ?? null;
  const configRows = options.configRows ?? [
    { key: 'auction_session_status', value: options.sessionStatus || 'live' },
    { key: 'auction_first_bid_timer_seconds', value: '30' },
    { key: 'auction_subsequent_bid_timer_seconds', value: '20' },
  ];

  return {
    from: vi.fn((table: string) => {
      let activeData: any = null;
      if (table === 'auction_lots') activeData = lot;
      else if (table === 'season_config') activeData = configRows;
      else if (table === 'seasons') activeData = { id: 'season-001', status: 'auction', name: 'ACC 2026' };
      else if (table === 'users') activeData = { id: 'admin-system-001', is_super_admin: true };

      const builder: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        upsert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        single: vi.fn().mockImplementation(async () => ({
          data: activeData,
          error: activeData ? null : new Error('Not found'),
        })),
        maybeSingle: vi.fn().mockImplementation(async () => {
          if (table === 'season_config') {
            return { data: { value: options.sessionStatus || 'live' }, error: null };
          }
          if (table === 'auction_lots') {
            return { data: null, error: null };
          }
          return { data: activeData, error: null };
        }),
        then: (resolve: any, reject: any) => {
          const listData = Array.isArray(activeData) ? activeData : (activeData ? [activeData] : []);
          return Promise.resolve({ data: listData, error: null }).then(resolve, reject);
        },
      };
      return builder;
    }),
  } as any;
}

describe('Issue A — Automatic Lot Finalization on Timer Expiry', () => {
  const seasonId = 'season-001';
  const lotIdWithBid = 'lot-highest-bidder-01';
  const lotIdNoBid = 'lot-no-bid-02';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Server-Side Authoritative Deadline & Post-Deadline Bid Rejection', () => {
    it('rejects bids submitted after the authoritative server deadline has elapsed', async () => {
      // Lot started 25 seconds ago, timer duration is 20s (has bidder) => expired 5s ago
      const expiredStartedAt = new Date(Date.now() - 25000).toISOString();

      const mockLot = {
        id: lotIdWithBid,
        season_id: seasonId,
        status: 'in_progress',
        current_price: 100,
        base_price: 20,
        highest_bidder_franchise_id: 'fran-csk',
        started_at: expiredStartedAt,
        bucket: 'B1',
      };

      vi.spyOn(guardsLib, 'requireFranchise').mockResolvedValue({
        user: { id: 'user-mi' } as any,
        activeSeason: { id: seasonId } as any,
        assignedFranchise: { id: 'fran-mi', name: 'Mumbai Indians', short_name: 'MI' } as any,
        roles: [{ role: 'franchise_representative' }] as any,
        isAdmin: false,
        isSuperAdmin: false,
        isOperator: false,
        isFranchise: true,
        isPlayer: false,
        isViewer: false,
      });

      const mockClient = createMockSupabase({ lot: mockLot });
      vi.spyOn(supabaseAdmin, 'createAdminClient').mockReturnValue(mockClient);

      const res = await placeBidAction(lotIdWithBid, 100);

      expect(res.success).toBe(false);
      expect(res.error).toContain('bidding window has expired');
    });

    it('rejects bids when the auction session is paused even if clock has time remaining', async () => {
      const activeStartedAt = new Date().toISOString();
      const mockLot = {
        id: lotIdWithBid,
        season_id: seasonId,
        status: 'in_progress',
        current_price: 100,
        base_price: 20,
        highest_bidder_franchise_id: 'fran-csk',
        started_at: activeStartedAt,
        bucket: 'B1',
      };

      vi.spyOn(guardsLib, 'requireFranchise').mockResolvedValue({
        user: { id: 'user-mi' } as any,
        activeSeason: { id: seasonId } as any,
        assignedFranchise: { id: 'fran-mi', name: 'Mumbai Indians', short_name: 'MI' } as any,
        roles: [{ role: 'franchise_representative' }] as any,
        isAdmin: false,
        isSuperAdmin: false,
        isOperator: false,
        isFranchise: true,
        isPlayer: false,
        isViewer: false,
      });

      const mockClient = createMockSupabase({ lot: mockLot, sessionStatus: 'paused' });
      vi.spyOn(supabaseAdmin, 'createAdminClient').mockReturnValue(mockClient);

      const res = await placeBidAction(lotIdWithBid, 100);

      expect(res.success).toBe(false);
      expect(res.error).toContain('currently paused');
    });
  });

  describe('2. Automatic Finalization (finalizeExpiredLotAction)', () => {
    it('rejects finalization if authoritative deadline has NOT yet expired', async () => {
      // Started 5 seconds ago, timer duration is 30s => 25s remaining
      const recentStartedAt = new Date(Date.now() - 5000).toISOString();

      const mockLot = {
        id: lotIdNoBid,
        season_id: seasonId,
        status: 'in_progress',
        current_price: null,
        base_price: 20,
        highest_bidder_franchise_id: null,
        started_at: recentStartedAt,
      };

      const mockClient = createMockSupabase({ lot: mockLot });
      vi.spyOn(supabaseAdmin, 'createAdminClient').mockReturnValue(mockClient);

      const res = await finalizeExpiredLotAction(lotIdNoBid, seasonId);

      expect(res.success).toBe(false);
      expect(res.error).toContain('deadline has not expired yet');
    });

    it('automatically finalizes lot as SOLD when expired with a highest bidder', async () => {
      // Started 35 seconds ago, timer duration 20s => expired 15s ago
      const expiredStartedAt = new Date(Date.now() - 35000).toISOString();

      const mockLot = {
        id: lotIdWithBid,
        season_id: seasonId,
        status: 'in_progress',
        current_price: 150,
        base_price: 20,
        highest_bidder_franchise_id: 'fran-rcb',
        started_at: expiredStartedAt,
      };

      const mockMutationFlow = vi.spyOn(transactionLib, 'executeAuctionMutationFlow').mockResolvedValue({
        success: true,
        data: {
          lot: { ...mockLot, status: 'sold' },
          event: { id: 'evt-sale-01', sequence_number: 101 },
        },
      });

      const mockClient = createMockSupabase({ lot: mockLot });
      vi.spyOn(supabaseAdmin, 'createAdminClient').mockReturnValue(mockClient);

      const res = await finalizeExpiredLotAction(lotIdWithBid, seasonId);

      expect(res.success).toBe(true);
      expect(res.data?.status).toBe('sold');
      expect(res.data?.price).toBe(150);
      expect(res.data?.franchiseId).toBe('fran-rcb');

      // Verifies atomic mutation executed with SOLD status and SALE event
      expect(mockMutationFlow).toHaveBeenCalledWith(
        expect.anything(),
        mockLot,
        expect.objectContaining({
          lotId: lotIdWithBid,
          expectedStatus: 'in_progress',
          newStatus: 'sold',
        }),
        expect.objectContaining({
          eventType: 'SALE',
          franchiseId: 'fran-rcb',
          price: 150,
        })
      );

      // Verifies SALE broadcast sent
      expect(mockBroadcast).toHaveBeenCalledWith(
        seasonId,
        'SALE',
        expect.objectContaining({
          lotId: lotIdWithBid,
          lotStatus: 'sold',
          currentPrice: 150,
          highestBidderId: 'fran-rcb',
        })
      );
    });

    it('automatically marks lot as UNSOLD when expired without any bids', async () => {
      // Started 40 seconds ago, duration 30s => expired 10s ago
      const expiredStartedAt = new Date(Date.now() - 40000).toISOString();

      const mockLot = {
        id: lotIdNoBid,
        season_id: seasonId,
        status: 'in_progress',
        current_price: null,
        base_price: 30,
        highest_bidder_franchise_id: null,
        started_at: expiredStartedAt,
      };

      const mockMutationFlow = vi.spyOn(transactionLib, 'executeAuctionMutationFlow').mockResolvedValue({
        success: true,
        data: {
          lot: { ...mockLot, status: 'unsold' },
          event: { id: 'evt-unsold-02', sequence_number: 102 },
        },
      });

      const mockClient = createMockSupabase({ lot: mockLot });
      vi.spyOn(supabaseAdmin, 'createAdminClient').mockReturnValue(mockClient);

      const res = await finalizeExpiredLotAction(lotIdNoBid, seasonId);

      expect(res.success).toBe(true);
      expect(res.data?.status).toBe('unsold');
      expect(res.data?.price).toBeNull();
      expect(res.data?.franchiseId).toBeNull();

      // Verifies UNSOLD event
      expect(mockMutationFlow).toHaveBeenCalledWith(
        expect.anything(),
        mockLot,
        expect.objectContaining({
          lotId: lotIdNoBid,
          expectedStatus: 'in_progress',
          newStatus: 'unsold',
        }),
        expect.objectContaining({
          eventType: 'UNSOLD',
        })
      );

      // Verifies UNSOLD broadcast
      expect(mockBroadcast).toHaveBeenCalledWith(
        seasonId,
        'UNSOLD',
        expect.objectContaining({
          lotId: lotIdNoBid,
          lotStatus: 'unsold',
        })
      );
    });

    it('is strictly idempotent: duplicate triggers on already finalized lots return harmlessly without mutations', async () => {
      // Lot is already marked sold
      const mockLot = {
        id: lotIdWithBid,
        season_id: seasonId,
        status: 'sold',
        current_price: 150,
        base_price: 20,
        highest_bidder_franchise_id: 'fran-rcb',
        started_at: new Date().toISOString(),
      };

      const mockMutationFlow = vi.spyOn(transactionLib, 'executeAuctionMutationFlow');
      const mockClient = createMockSupabase({ lot: mockLot });
      vi.spyOn(supabaseAdmin, 'createAdminClient').mockReturnValue(mockClient);

      const res = await finalizeExpiredLotAction(lotIdWithBid, seasonId);

      expect(res.success).toBe(true);
      expect(res.data?.alreadyFinalized).toBe(true);
      expect(res.data?.finalized).toBe(false);
      expect(res.data?.status).toBe('sold');

      // Ensures zero database mutations and zero duplicate events
      expect(mockMutationFlow).not.toHaveBeenCalled();
      expect(mockBroadcast).not.toHaveBeenCalled();
    });

    it('handles concurrent expiry triggers safely: second request gracefully receives alreadyFinalized', async () => {
      const expiredStartedAt = new Date(Date.now() - 35000).toISOString();
      const mockLot = {
        id: lotIdWithBid,
        season_id: seasonId,
        status: 'in_progress',
        current_price: 150,
        base_price: 20,
        highest_bidder_franchise_id: 'fran-rcb',
        started_at: expiredStartedAt,
      };

      // Simulate first call succeeding, but second concurrent call encountering updated status
      vi.spyOn(transactionLib, 'executeAuctionMutationFlow').mockResolvedValueOnce({
        success: false,
        error: 'Conditional update failed: expected status in_progress but was sold',
      });

      let lotQueryCount = 0;
      const configRows = [
        { key: 'auction_session_status', value: 'live' },
        { key: 'auction_first_bid_timer_seconds', value: '30' },
        { key: 'auction_subsequent_bid_timer_seconds', value: '20' },
      ];
      const mockClient = createMockSupabase({ lot: mockLot });
      mockClient.from = vi.fn((table: string) => {
        let activeData: any = null;
        if (table === 'auction_lots') {
          lotQueryCount++;
          activeData = lotQueryCount === 1 ? mockLot : { ...mockLot, status: 'sold' };
        } else if (table === 'season_config') {
          activeData = configRows;
        } else if (table === 'users') {
          activeData = { id: 'admin-01', is_super_admin: true };
        }

        const builder: any = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          single: vi.fn().mockImplementation(async () => ({
            data: activeData,
            error: null,
          })),
          maybeSingle: vi.fn().mockResolvedValue({ data: activeData, error: null }),
          then: (resolve: any, reject: any) => {
            const list = Array.isArray(activeData) ? activeData : [activeData];
            return Promise.resolve({ data: list, error: null }).then(resolve, reject);
          },
        };
        return builder;
      });

      vi.spyOn(supabaseAdmin, 'createAdminClient').mockReturnValue(mockClient);

      const res = await finalizeExpiredLotAction(lotIdWithBid, seasonId);

      expect(res.success).toBe(true);
      expect(res.data?.alreadyFinalized).toBe(true);
      expect(res.data?.status).toBe('sold');
    });

    it('can be triggered by non-operator client if operator is disconnected', async () => {
      const expiredStartedAt = new Date(Date.now() - 40000).toISOString();
      const mockLot = {
        id: lotIdNoBid,
        season_id: seasonId,
        status: 'in_progress',
        current_price: null,
        base_price: 20,
        highest_bidder_franchise_id: null,
        started_at: expiredStartedAt,
      };

      vi.spyOn(transactionLib, 'executeAuctionMutationFlow').mockResolvedValue({
        success: true,
        data: {
          lot: { ...mockLot, status: 'unsold' },
          event: { id: 'evt-headless', sequence_number: 105 },
        },
      });

      const mockClient = createMockSupabase({ lot: mockLot });
      vi.spyOn(supabaseAdmin, 'createAdminClient').mockReturnValue(mockClient);

      const res = await finalizeExpiredLotAction(lotIdNoBid, seasonId);

      expect(res.success).toBe(true);
      expect(res.data?.status).toBe('unsold');
    });

    it('database failure in executeAuctionMutationFlow returns error and does NOT broadcast SALE', async () => {
      const expiredStartedAt = new Date(Date.now() - 35000).toISOString();
      const mockLot = {
        id: lotIdWithBid,
        season_id: seasonId,
        status: 'in_progress',
        current_price: 150,
        base_price: 20,
        highest_bidder_franchise_id: 'fran-rcb',
        started_at: expiredStartedAt,
      };

      vi.spyOn(transactionLib, 'executeAuctionMutationFlow').mockResolvedValueOnce({
        success: false,
        error: 'Database constraint violation during sale transaction',
      });

      const mockClient = createMockSupabase({ lot: mockLot });
      vi.spyOn(supabaseAdmin, 'createAdminClient').mockReturnValue(mockClient);

      const res = await finalizeExpiredLotAction(lotIdWithBid, seasonId);

      expect(res.success).toBe(false);
      expect(res.error).toBe('Database constraint violation during sale transaction');
      expect(mockBroadcast).not.toHaveBeenCalled();
    });

    it('absorbs clock skew (diffMs <= 2000) and aborts if a concurrent bid occurred while awaiting skew', async () => {
      // Started 19.8s ago, duration is 20s => 200ms remaining (<= 2000ms clock skew)
      const nearExpiredStartedAt = new Date(Date.now() - 19800).toISOString();
      const mockLot = {
        id: lotIdWithBid,
        season_id: seasonId,
        status: 'in_progress',
        current_price: 150,
        base_price: 20,
        highest_bidder_franchise_id: 'fran-rcb',
        started_at: nearExpiredStartedAt,
      };

      let lotQueryCount = 0;
      const configRows = [
        { key: 'auction_session_status', value: 'live' },
        { key: 'auction_first_bid_timer_seconds', value: '30' },
        { key: 'auction_subsequent_bid_timer_seconds', value: '20' },
      ];
      const mockClient = createMockSupabase({ lot: mockLot });
      mockClient.from = vi.fn((table: string) => {
        let activeData: any = null;
        if (table === 'auction_lots') {
          lotQueryCount++;
          // First query returns mockLot, second query after skew absorption sees the newly placed bid!
          activeData = lotQueryCount === 1
            ? mockLot
            : {
                ...mockLot,
                started_at: new Date().toISOString(),
                current_price: 200,
                highest_bidder_franchise_id: 'fran-csk',
              };
        } else if (table === 'season_config') {
          activeData = configRows;
        } else if (table === 'users') {
          activeData = { id: 'admin-01', is_super_admin: true };
        }

        const builder: any = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          single: vi.fn().mockImplementation(async () => ({
            data: activeData,
            error: null,
          })),
          maybeSingle: vi.fn().mockResolvedValue({ data: activeData, error: null }),
          then: (resolve: any, reject: any) => {
            const list = Array.isArray(activeData) ? activeData : [activeData];
            return Promise.resolve({ data: list, error: null }).then(resolve, reject);
          },
        };
        return builder;
      });

      vi.spyOn(supabaseAdmin, 'createAdminClient').mockReturnValue(mockClient);
      const mockMutationFlow = vi.spyOn(transactionLib, 'executeAuctionMutationFlow');

      const res = await finalizeExpiredLotAction(lotIdWithBid, seasonId);

      expect(res.success).toBe(false);
      expect(res.error).toContain('A concurrent bid or timer extension occurred; lot is not expired.');
      expect(mockMutationFlow).not.toHaveBeenCalled();
      expect(mockBroadcast).not.toHaveBeenCalled();
    });
  });
});

describe('Issue B — Guest Draw Startup Latency & Coordination', () => {
  const seasonId = 'season-001';
  const lotId = 'a0000000-0000-0000-0000-000000000099';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('broadcasts PLAYER_SELECTED immediately upon DB commit with hydrated player details', async () => {
    vi.spyOn(guardsLib, 'requireAdmin').mockResolvedValue({
      user: { id: 'admin-01' } as any,
      activeSeason: { id: seasonId } as any,
      assignedFranchise: null,
      roles: [{ role: 'super_admin' }] as any,
      isAdmin: true,
      isSuperAdmin: true,
      isOperator: false,
      isFranchise: false,
      isPlayer: false,
      isViewer: false,
    });

    const mockTargetLot = {
      id: lotId,
      season_id: seasonId,
      status: 'pending',
      bucket: 'B3',
      draw_number: 14,
      base_price: 20,
      current_price: null,
      highest_bidder_franchise_id: null,
      player_season_registrations: {
        id: 'reg-99',
        roll_number: '21BCE100',
        branch: 'CSE',
        academic_year: 4,
        programme: 'BTech',
        player_skill_profiles: {
          derived_player_type: 'WICKET_KEEPER',
        },
        players: {
          id: 'p-99',
          full_name: 'Jasprit Bumrah',
          photo_url: 'https://images.example.com/bumrah.jpg',
        },
      },
    };

    vi.spyOn(transactionLib, 'executeAuctionMutationFlow').mockResolvedValue({
      success: true,
      data: {
        lot: { ...mockTargetLot, status: 'in_progress' },
        event: { id: 'evt-draw-99', sequence_number: 99 },
      },
    });

    const mockClient: any = {
      from: vi.fn((table: string) => {
        let returnData: any = null;
        if (table === 'auction_lots') returnData = [mockTargetLot];
        else if (table === 'season_config') returnData = [{ key: 'auction_session_status', value: 'live' }];
        else if (table === 'seasons') returnData = { id: seasonId, status: 'auction', name: 'ACC 2026' };

        const builder: any = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          delete: vi.fn().mockReturnThis(),
          upsert: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }), // active lot floor check returns null (empty floor)
          then: (resolve: any, reject: any) => {
            return Promise.resolve({ data: returnData, error: null }).then(resolve, reject);
          },
        };
        return builder;
      }),
    };
    vi.spyOn(supabaseAdmin, 'createAdminClient').mockReturnValue(mockClient);

    const res = await callGuestDrawNumberAction(lotId, 'B3', seasonId);

    expect(res.success).toBe(true);
    expect(res.data?.playerName).toBe('Jasprit Bumrah');

    // Verifies immediate post-commit broadcast containing full player card details
    expect(mockBroadcast).toHaveBeenCalledWith(
      seasonId,
      'PLAYER_SELECTED',
      expect.objectContaining({
        lotId,
        isGuestDraw: true,
        guestDrawCardNumber: 14,
        guestDrawBucket: 'B3',
        playerName: 'Jasprit Bumrah',
        activeLot: expect.objectContaining({
          player: expect.objectContaining({
            full_name: 'Jasprit Bumrah',
            photo_url: 'https://images.example.com/bumrah.jpg',
          }),
        }),
      })
    );
  });
});
