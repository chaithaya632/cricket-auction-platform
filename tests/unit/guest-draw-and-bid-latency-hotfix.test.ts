import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callGuestDrawNumberAction, placeBidAction } from '@/lib/auction/actions';
import { getFranchiseSquadData } from '@/lib/franchises/queries';
import * as guardsLib from '@/lib/permissions/guards';
import * as supabaseAdmin from '@/lib/supabase/admin';
import * as realtimeLib from '@/lib/auction/realtime';
import * as transactionLib from '@/lib/auction/transaction';
import { revalidatePath } from 'next/cache';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

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

describe('Guest Draw Lookup & Bid Update Latency Hotfix Verification', () => {
  const seasonId = '00000000-0000-0000-0000-000000000001';
  const lotUuid = '11111111-1111-1111-1111-111111111111';

  let mockBroadcast: any;
  let mockMutationFlow: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockBroadcast = vi.spyOn(realtimeLib, 'broadcastAuctionUpdate').mockResolvedValue(undefined);
    mockMutationFlow = vi.spyOn(transactionLib, 'executeAuctionMutationFlow').mockResolvedValue({
      success: true,
      data: {
        lot: { id: lotUuid, status: 'in_progress' },
        event: { id: 'evt-1', sequence_number: 101 },
      },
    } as any);
  });

  function createMockAdminClient(options: {
    lot?: any;
    onSelectCols?: (cols: string) => void;
  }) {
    const lot = options.lot ?? null;

    return {
      from: vi.fn((table: string) => {
        const queryBuilder: any = {
          select: vi.fn((cols: string) => {
            if (table === 'auction_lots' && options.onSelectCols) {
              options.onSelectCols(cols);
            }
            return queryBuilder;
          }),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          delete: vi.fn().mockReturnThis(),
          upsert: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockImplementation(async () => {
            if (table === 'auction_lots') {
              // Floor check: returns null so no lot is active on floor
              return { data: null, error: null };
            }
            if (table === 'seasons') {
              return { data: { id: seasonId, status: 'auction', name: 'ACC 2026' }, error: null };
            }
            return { data: { value: 'live' }, error: null };
          }),
          single: vi.fn().mockImplementation(async () => {
            if (table === 'seasons') {
              return { data: { id: seasonId, status: 'auction' }, error: null };
            }
            if (table === 'auction_lots') {
              return { data: lot, error: lot ? null : new Error('Not found') };
            }
            return { data: null, error: null };
          }),
          then: (resolve: any, reject: any) => {
            if (table === 'auction_lots') {
              const list = lot ? [lot] : [];
              return Promise.resolve({ data: list, error: null }).then(resolve, reject);
            }
            if (table === 'season_config') {
              return Promise.resolve({
                data: [
                  { key: 'auction_session_status', value: 'live' },
                  { key: 'auction_started_at', value: new Date().toISOString() },
                  { key: 'auction_first_bid_timer_seconds', value: '30' },
                  { key: 'auction_subsequent_bid_timer_seconds', value: '20' },
                ],
                error: null,
              }).then(resolve, reject);
            }
            return Promise.resolve({ data: [], error: null }).then(resolve, reject);
          },
        };
        return queryBuilder;
      }),
    } as any;
  }

  describe('1. Guest Draw Selection Query & Schema Invariants (callGuestDrawNumberAction)', () => {
    function setupAdminContext() {
      vi.spyOn(guardsLib, 'requireAdmin').mockResolvedValue({
        user: { id: 'admin-01' } as any,
        activeSeason: { id: seasonId } as any,
        roles: [{ role: 'super_admin' }] as any,
        isAdmin: true,
        isSuperAdmin: true,
        isOperator: false,
        isFranchise: false,
        isPlayer: false,
        isViewer: false,
        assignedFranchise: null,
      });
    }

    it('successfully queries lot by UUID and verifies PostgREST projection has valid columns', async () => {
      setupAdminContext();

      let capturedSelect = '';
      const mockLotRow = {
        id: lotUuid,
        season_id: seasonId,
        draw_number: 1,
        bucket: 'B3',
        base_price: 20,
        status: 'pending',
        player_season_registrations: [
          {
            id: 'reg-01',
            branch: 'CSE',
            academic_year: 3,
            programme: 'B.Tech',
            cricheroes_url: 'https://cricheroes.com/p/123',
            players: [
              {
                id: 'player-01',
                full_name: 'Rohit Sharma',
                photo_url: 'https://photos.com/rohit.jpg',
                roll_number: '21CS001',
              },
            ],
            player_skill_profiles: [
              {
                derived_player_type: 'Top-order Batter',
                batting_style: 'Right-hand bat',
                bowling_style: 'Right-arm offbreak',
              },
            ],
          },
        ],
      };

      const capturedSelects: string[] = [];
      const mockClient = createMockAdminClient({
        lot: mockLotRow,
        onSelectCols: (cols) => {
          capturedSelects.push(cols);
        },
      });

      vi.spyOn(supabaseAdmin, 'createAdminClient').mockReturnValue(mockClient);

      const res = await callGuestDrawNumberAction(lotUuid, 'B3', seasonId);

      expect(res.success).toBe(true);
      expect(res.data?.lotId).toBe(lotUuid);
      expect(res.data?.playerName).toBe('Rohit Sharma');
      expect(res.data?.activeLot?.player?.full_name).toBe('Rohit Sharma');
      expect((res.data?.activeLot?.registration as any)?.roll_number).toBe('21CS001');
      expect(res.data?.activeLot?.registration?.cricheroes_profile_url).toBe('https://cricheroes.com/p/123');

      const lotDetailsSelect = capturedSelects.find((s) => s.includes('player_season_registrations')) || '';

      // CRITICAL FORENSIC CHECK: Projection must query canonical cricheroes_url and not non-existent columns
      expect(lotDetailsSelect).toContain('cricheroes_url');
      expect(lotDetailsSelect).not.toContain('cricheroes_profile_url');
      expect(lotDetailsSelect).not.toContain('phone');
      expect(lotDetailsSelect).not.toContain('email');
      expect(lotDetailsSelect).toContain('roll_number'); // correctly placed under players

      // Must broadcast PLAYER_SELECTED immediately with isGuestDraw flag
      expect(mockBroadcast).toHaveBeenCalledWith(
        seasonId,
        'PLAYER_SELECTED',
        expect.objectContaining({
          lotId: lotUuid,
          isGuestDraw: true,
          guestDrawBucket: 'B3',
          playerName: 'Rohit Sharma',
        })
      );
    });

    it('resolves bucket player number (e.g. B31) to target lot and executes draw', async () => {
      setupAdminContext();

      const mockLotRow = {
        id: lotUuid,
        season_id: seasonId,
        draw_number: 1,
        bucket: 'B3',
        base_price: 20,
        status: 'pending',
        player_season_registrations: {
          id: 'reg-01',
          branch: 'IT',
          academic_year: 4,
          programme: 'B.Tech',
          players: {
            id: 'p-01',
            full_name: 'Virat Kohli',
            photo_url: null,
            roll_number: '20IT001',
          },
          player_skill_profiles: null,
        },
      };

      const mockClient = createMockAdminClient({ lot: mockLotRow });
      vi.spyOn(supabaseAdmin, 'createAdminClient').mockReturnValue(mockClient);

      const res = await callGuestDrawNumberAction('B31', 'B3', seasonId);

      expect(res.success).toBe(true);
      expect(res.data?.playerName).toBe('Virat Kohli');
    });

    it('returns informative error on bucket mismatch instead of generic failure', async () => {
      setupAdminContext();

      const mockLotRow = {
        id: lotUuid,
        season_id: seasonId,
        draw_number: 1,
        bucket: 'B4', // found B4
        base_price: 20,
        status: 'pending',
      };

      const mockClient = createMockAdminClient({ lot: mockLotRow });
      vi.spyOn(supabaseAdmin, 'createAdminClient').mockReturnValue(mockClient);

      // Caller requested B3, but lot is in B4
      const res = await callGuestDrawNumberAction(lotUuid, 'B3', seasonId);

      expect(res.success).toBe(false);
      expect(res.error).toContain("Lot bucket mismatch. Expected 'B3', found 'B4'");
    });

    it('rejects drawing a lot that is already sold or unsold', async () => {
      setupAdminContext();

      const mockLotRow = {
        id: lotUuid,
        season_id: seasonId,
        draw_number: 1,
        bucket: 'B3',
        base_price: 20,
        status: 'sold',
      };

      const mockClient = createMockAdminClient({ lot: mockLotRow });
      vi.spyOn(supabaseAdmin, 'createAdminClient').mockReturnValue(mockClient);

      const res = await callGuestDrawNumberAction(lotUuid, 'B3', seasonId);

      expect(res.success).toBe(false);
      expect(res.error).toContain('Lot is already sold and cannot be drawn');
    });
  });

  describe('2. Sub-Second Bid Confirmation & Latency Elimination (placeBidAction)', () => {
    function setupFranchiseContext() {
      vi.spyOn(guardsLib, 'requireFranchise').mockResolvedValue({
        user: { id: 'user-mi' } as any,
        activeSeason: { id: seasonId } as any,
        assignedFranchise: {
          id: 'fran-mi',
          name: 'Mumbai Indians',
          short_name: 'MI',
          color_primary: '#004BA0',
        } as any,
        roles: [{ role: 'franchise_representative' }] as any,
        isAdmin: false,
        isSuperAdmin: false,
        isOperator: false,
        isFranchise: true,
        isPlayer: false,
        isViewer: false,
      });
    }

    it('does NOT invoke revalidatePath on incremental bids, eliminating 3-4s blocking latency', async () => {
      setupFranchiseContext();

      const activeStartedAt = new Date().toISOString();
      const mockLot = {
        id: lotUuid,
        season_id: seasonId,
        status: 'in_progress',
        current_price: 100,
        base_price: 20,
        highest_bidder_franchise_id: 'fran-csk',
        started_at: activeStartedAt,
        bucket: 'B1',
      };

      const mockClient = createMockAdminClient({ lot: mockLot });
      vi.spyOn(supabaseAdmin, 'createAdminClient').mockReturnValue(mockClient);

      const res = await placeBidAction(lotUuid, 100);

      expect(res.success).toBe(true);

      // CRITICAL CHECK: revalidatePath must NOT be called on incremental bids
      expect(revalidatePath).not.toHaveBeenCalled();

      // Must broadcast BID_PLACED with reset duration
      expect(mockBroadcast).toHaveBeenCalledWith(
        seasonId,
        'BID_PLACED',
        expect.objectContaining({
          lotId: lotUuid,
          currentPrice: 120, // next legal bid after 100 is 120
          highestBidderId: 'fran-mi',
          durationSeconds: 20,
        })
      );
    });

    it('passes { skipPlayerProfiles: true } to getFranchiseSquadData during bid validation', async () => {
      setupFranchiseContext();

      const activeStartedAt = new Date().toISOString();
      const mockLot = {
        id: lotUuid,
        season_id: seasonId,
        status: 'in_progress',
        current_price: null,
        base_price: 20,
        highest_bidder_franchise_id: null,
        started_at: activeStartedAt,
        bucket: 'B1',
      };

      const mockClient = createMockAdminClient({ lot: mockLot });
      vi.spyOn(supabaseAdmin, 'createAdminClient').mockReturnValue(mockClient);

      await placeBidAction(lotUuid, null);

      expect(getFranchiseSquadData).toHaveBeenCalledWith(
        expect.anything(),
        'fran-mi',
        seasonId,
        expect.objectContaining({ skipPlayerProfiles: true })
      );
    });
  });

  describe('3. Franchise Squad Optimization (getFranchiseSquadData implementation)', () => {
    it('skips querying public_players_view when skipPlayerProfiles is true', async () => {
      const actualModule = await vi.importActual<typeof import('@/lib/franchises/queries')>(
        '@/lib/franchises/queries'
      );

      const queriedTables: string[] = [];

      const mockClient = {
        from: vi.fn((table: string) => {
          queriedTables.push(table);
          const builder: any = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'fran-01', name: 'Super Kings', starting_purse: 10000 },
              error: null,
            }),
            then: (resolve: any) => {
              if (table === 'season_config') {
                return Promise.resolve({
                  data: [
                    { key: 'auction_min_purchases', value: '15' },
                    { key: 'auction_min_base_price', value: '20' },
                  ],
                  error: null,
                }).then(resolve);
              }
              if (table === 'bucket_rules') {
                return Promise.resolve({
                  data: [{ bucket: 'B1', min_purchases: 2, is_mandatory: true }],
                  error: null,
                }).then(resolve);
              }
              if (table === 'auction_lots') {
                return Promise.resolve({
                  data: [
                    {
                      id: 'lot-01',
                      registration_id: 'reg-01',
                      bucket: 'B1',
                      status: 'sold',
                      current_price: 50,
                      base_price: 20,
                    },
                  ],
                  error: null,
                }).then(resolve);
              }
              return Promise.resolve({ data: [], error: null }).then(resolve);
            },
          };
          return builder;
        }),
      } as any;

      const result = await actualModule.getFranchiseSquadData(mockClient, 'fran-01', seasonId, {
        skipPlayerProfiles: true,
      });

      expect(result).not.toBeNull();
      expect(result?.purseState.remainingPurse).toBeDefined();
      expect(queriedTables).not.toContain('public_players_view');
    });
  });
});
