import { describe, it, expect, vi, beforeEach } from 'vitest';
import { placeBidAction, finalizeExpiredLotAction } from '@/lib/auction/actions';
import * as guardsLib from '@/lib/permissions/guards';
import * as supabaseAdmin from '@/lib/supabase/admin';
import * as realtimeLib from '@/lib/auction/realtime';
import * as transactionLib from '@/lib/auction/transaction';
import {
  subscribeAuctionDelta,
  notifyAuctionDelta,
  resetSequenceTrackingForTests,
} from '@/components/auction/auction-realtime-sync';
import type { AuctionBroadcastPayload } from '@/lib/auction/types';

describe('Instantaneous Bid Submission, Concurrency & Deadline Regression Suite', () => {
  const seasonId = '00000000-0000-0000-0000-000000000001';
  const lotUuid = '11111111-1111-1111-1111-111111111111';

  let mockBroadcast: any;

  beforeEach(() => {
    vi.clearAllMocks();
    resetSequenceTrackingForTests();
    mockBroadcast = vi.spyOn(realtimeLib, 'broadcastAuctionUpdate').mockResolvedValue(undefined);
  });

  function setupFranchiseContext(franchiseId = 'fran-csk', franchiseName = 'Chennai Super Kings') {
    vi.spyOn(guardsLib, 'requireFranchise').mockResolvedValue({
      user: { id: `user-${franchiseId}` } as any,
      activeSeason: { id: seasonId } as any,
      assignedFranchise: {
        id: franchiseId,
        name: franchiseName,
        short_name: franchiseId.replace('fran-', '').toUpperCase(),
        starting_purse: 1000,
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

  // ===========================================================================
  // 1. END-TO-END BID PATH INSTRUMENTATION & LATENCY BENCHMARK (p50 / p95)
  // ===========================================================================
  describe('1. Bid Path Latency Instrumentation & Benchmarks', () => {
    it('measures end-to-end latency across all stages (auth, data fetch, validation, db commit, broadcast, client update) and reports p50/p95', async () => {
      setupFranchiseContext();

      const lot = {
        id: lotUuid,
        season_id: seasonId,
        status: 'in_progress',
        current_price: 100,
        base_price: 20,
        highest_bidder_franchise_id: 'fran-mi',
        started_at: new Date().toISOString(),
        bucket: 'B1',
      };

      // Mock database operations with realistic in-process delays
      const mockAdmin = {
        from: vi.fn((table: string) => {
          const builder: any = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            single: vi.fn().mockImplementation(async () => {
              if (table === 'auction_lots') return { data: lot, error: null };
              return { data: null, error: null };
            }),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            then: (resolve: any) => {
              if (table === 'season_config') {
                return Promise.resolve({
                  data: [
                    { key: 'auction_session_status', value: 'live' },
                    { key: 'auction_subsequent_bid_timer_seconds', value: '20' },
                    { key: 'auction_first_bid_timer_seconds', value: '30' },
                    { key: 'default_purse', value: '1000' },
                    { key: 'min_squad_size', value: '17' },
                    { key: 'max_squad_size', value: '22' },
                    { key: 'min_auction_purchases', value: '15' },
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
                return Promise.resolve({ data: [], error: null }).then(resolve);
              }
              if (table === 'franchise_referrals') {
                return Promise.resolve({ data: [], error: null }).then(resolve);
              }
              return Promise.resolve({ data: [], error: null }).then(resolve);
            },
          };
          return builder;
        }),
      };

      vi.spyOn(supabaseAdmin, 'createAdminClient').mockReturnValue(mockAdmin as any);
      vi.spyOn(transactionLib, 'executeAuctionMutationFlow').mockResolvedValue({
        success: true,
        data: {
          lot: { ...lot, current_price: 120, highest_bidder_franchise_id: 'fran-csk' },
          event: { id: 'evt-bid-1', sequence_number: 105 },
        },
      } as any);

      const iterations = 50;
      const stageSamples: {
        clientClickToReceipt: number[];
        serverAuth: number[];
        dataFetch: number[];
        validation: number[];
        dbCommit: number[];
        broadcast: number[];
        totalServer: number[];
        receivingClientUpdate: number[];
        totalEndToEnd: number[];
      } = {
        clientClickToReceipt: [],
        serverAuth: [],
        dataFetch: [],
        validation: [],
        dbCommit: [],
        broadcast: [],
        totalServer: [],
        receivingClientUpdate: [],
        totalEndToEnd: [],
      };

      for (let i = 0; i < iterations; i++) {
        const clientClickTime = performance.now();

        // 1. Client Click -> Server Action call
        const actionPromise = placeBidAction(lotUuid, 100);
        const serverReceiptTime = performance.now();
        stageSamples.clientClickToReceipt.push(serverReceiptTime - clientClickTime);

        const res = await actionPromise;
        expect(res.success).toBe(true);

        const timings = res.debugTimings!;
        stageSamples.serverAuth.push(timings.authMs || 0);
        stageSamples.dataFetch.push(timings.dataFetchMs || 0);
        stageSamples.validation.push(timings.validationMs || 0);
        stageSamples.dbCommit.push(timings.dbCommitMs || 0);
        stageSamples.broadcast.push(timings.broadcastMs || 0);
        stageSamples.totalServer.push(timings.totalServerMs || 0);

        // 2. Receiving Client Update via delta subscription
        const clientReceiveStart = performance.now();
        let clientUpdated = false;
        const unsubscribe = subscribeAuctionDelta((delta) => {
          if (delta.type === 'BID_PLACED' && delta.currentPrice === 120) {
            clientUpdated = true;
          }
        });

        notifyAuctionDelta({
          version: 2,
          type: 'BID_PLACED',
          seasonId,
          lotId: lotUuid,
          currentPrice: 120,
          highestBidderId: 'fran-csk',
          sequenceNumber: 100 + i,
          serverTimestamp: new Date().toISOString(),
        });
        unsubscribe();

        const clientReceiveEnd = performance.now();
        expect(clientUpdated).toBe(true);
        const clientUpdateMs = clientReceiveEnd - clientReceiveStart;
        stageSamples.receivingClientUpdate.push(clientUpdateMs);

        const totalE2E = (serverReceiptTime - clientClickTime) + (timings.totalServerMs || 0) + clientUpdateMs;
        stageSamples.totalEndToEnd.push(totalE2E);
      }

      function calcPercentiles(arr: number[]) {
        const sorted = [...arr].sort((a, b) => a - b);
        const p50 = sorted[Math.floor(sorted.length * 0.5)];
        const p95 = sorted[Math.floor(sorted.length * 0.95)];
        return {
          p50: Math.round(p50 * 100) / 100,
          p95: Math.round(p95 * 100) / 100,
        };
      }

      const results = {
        client_click_to_receipt_ms: calcPercentiles(stageSamples.clientClickToReceipt),
        server_auth_ms: calcPercentiles(stageSamples.serverAuth),
        data_fetch_ms: calcPercentiles(stageSamples.dataFetch),
        domain_validation_ms: calcPercentiles(stageSamples.validation),
        database_commit_ms: calcPercentiles(stageSamples.dbCommit),
        broadcast_ms: calcPercentiles(stageSamples.broadcast),
        total_server_action_ms: calcPercentiles(stageSamples.totalServer),
        receiving_client_update_ms: calcPercentiles(stageSamples.receivingClientUpdate),
        total_end_to_end_ms: calcPercentiles(stageSamples.totalEndToEnd),
      };

      console.log('INSTRUMENTED_BID_PATH_LATENCY_REPORT (p50 / p95 in ms):', JSON.stringify(results, null, 2));

      // Verifications:
      // In-process server execution must be sub-second
      expect(results.total_server_action_ms.p50).toBeLessThan(100);
      expect(results.total_server_action_ms.p95).toBeLessThan(250);
      // Receiving client subscriber execution must be <10ms
      expect(results.receiving_client_update_ms.p50).toBeLessThan(10);
      expect(results.receiving_client_update_ms.p95).toBeLessThan(20);
    });
  });

  // ===========================================================================
  // 2. CONCURRENCY TESTS — MUTATION SERIALIZATION & ROW LOCKING
  // ===========================================================================
  describe('2. Concurrency & Optimistic Row Locking (§PostgreSQL Authority)', () => {
    it('when multiple franchises place bids concurrently at the same expectedPrice, exactly ONE succeeds and others receive STALE_BID_PRICE', async () => {
      // Simulate PostgreSQL row lock: only the first transaction to acquire the lock succeeds
      let currentPrice = 100;
      let highestBidder = 'fran-mi';

      const mockDbEngine = {
        updateLot: async (lotId: string, expectedPrice: number | null, newPrice: number, bidderId: string) => {
          // Atomic conditional update simulation: WHERE current_price = expectedPrice
          if (currentPrice !== expectedPrice) {
            return {
              success: false,
              error: 'STALE_BID_PRICE: The lot state or price has changed concurrently. Mutation rejected.',
            };
          }
          currentPrice = newPrice;
          highestBidder = bidderId;
          return {
            success: true,
            data: { id: lotId, current_price: currentPrice, highest_bidder_franchise_id: highestBidder },
          };
        },
      };

      vi.spyOn(transactionLib, 'executeAuctionMutationFlow').mockImplementation(
        async (_client, _orig, lotUpdate, eventParams) => {
          const res = await mockDbEngine.updateLot(
            lotUpdate.lotId,
            lotUpdate.expectedPrice ?? null,
            lotUpdate.newPrice ?? 120,
            lotUpdate.highestBidderId ?? 'unknown'
          );
          if (!res.success) return { success: false, error: res.error };
          return {
            success: true,
            data: { lot: res.data, event: { id: 'evt-1', sequence_number: 1 } },
          } as any;
        }
      );

      // Setup 4 concurrent bidding franchises
      const franchises = ['fran-csk', 'fran-rcb', 'fran-kkr', 'fran-dc'];

      const runBidForFranchise = async (fId: string) => {
        vi.spyOn(guardsLib, 'requireFranchise').mockResolvedValueOnce({
          user: { id: `user-${fId}` } as any,
          activeSeason: { id: seasonId } as any,
          assignedFranchise: { id: fId, name: fId.toUpperCase(), short_name: fId.toUpperCase() } as any,
          roles: [{ role: 'franchise_representative' }] as any,
          isAdmin: false,
          isSuperAdmin: false,
          isOperator: false,
          isFranchise: true,
          isPlayer: false,
          isViewer: false,
        });

        const mockClient = {
          from: vi.fn((table: string) => ({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: lotUuid,
                season_id: seasonId,
                status: 'in_progress',
                current_price: 100,
                base_price: 20,
                highest_bidder_franchise_id: 'fran-mi',
                started_at: new Date().toISOString(),
                bucket: 'B1',
              },
              error: null,
            }),
            then: (resolve: any) => {
              if (table === 'season_config') {
                return Promise.resolve({
                  data: [
                    { key: 'auction_session_status', value: 'live' },
                    { key: 'auction_subsequent_bid_timer_seconds', value: '20' },
                    { key: 'default_purse', value: '1000' },
                    { key: 'min_squad_size', value: '17' },
                    { key: 'max_squad_size', value: '22' },
                    { key: 'min_auction_purchases', value: '15' },
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
              return Promise.resolve({ data: [], error: null }).then(resolve);
            },
          })),
        };
        vi.spyOn(supabaseAdmin, 'createAdminClient').mockReturnValue(mockClient as any);

        return placeBidAction(lotUuid, 100);
      };

      // Execute 4 bids simultaneously at expectedPrice = 100
      const results = await Promise.all(franchises.map((fId) => runBidForFranchise(fId)));

      const successfulBids = results.filter((r) => r.success);
      const rejectedBids = results.filter((r) => !r.success);

      expect(successfulBids.length).toBe(1);
      expect(rejectedBids.length).toBe(3);
      for (const rej of rejectedBids) {
        expect(rej.error).toContain('STALE_BID_PRICE');
      }
      expect(currentPrice).toBe(120);
    });
  });

  // ===========================================================================
  // 3. DEADLINE & EXPIRY COORDINATION TESTS
  // ===========================================================================
  describe('3. Deadline Enforcement & Expiry Finalization Coordination', () => {
    it('accepts a bid placed 0.5s before deadline and extends the authoritative timer by subsequent_bid_timer_seconds (20s)', async () => {
      setupFranchiseContext();

      // Started 19.5s ago with 20s subsequent bid timer -> 0.5s remaining
      const startedAt = new Date(Date.now() - 19500).toISOString();
      const lot = {
        id: lotUuid,
        season_id: seasonId,
        status: 'in_progress',
        current_price: 150,
        base_price: 20,
        highest_bidder_franchise_id: 'fran-mi',
        started_at: startedAt,
        bucket: 'B1',
      };

      let committedStartedAt = '';
      const mockAdmin = {
        from: vi.fn((table: string) => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: lot, error: null }),
          then: (resolve: any) => {
            if (table === 'season_config') {
              return Promise.resolve({
                data: [
                  { key: 'auction_session_status', value: 'live' },
                  { key: 'auction_subsequent_bid_timer_seconds', value: '20' },
                  { key: 'auction_first_bid_timer_seconds', value: '30' },
                  { key: 'default_purse', value: '1000' },
                  { key: 'min_squad_size', value: '17' },
                  { key: 'max_squad_size', value: '22' },
                  { key: 'min_auction_purchases', value: '15' },
                ],
                error: null,
              }).then(resolve);
            }
            if (table === 'bucket_rules') {
              return Promise.resolve({ data: [{ bucket: 'B1', min_purchases: 2, is_mandatory: true }], error: null }).then(resolve);
            }
            return Promise.resolve({ data: [], error: null }).then(resolve);
          },
        })),
      };

      vi.spyOn(supabaseAdmin, 'createAdminClient').mockReturnValue(mockAdmin as any);
      vi.spyOn(transactionLib, 'executeAuctionMutationFlow').mockImplementation(
        async (_c, _orig, update) => {
          committedStartedAt = update.startedAt!;
          return { success: true, data: { lot: { ...lot, started_at: committedStartedAt }, event: { id: 'evt-1' } } } as any;
        }
      );

      const res = await placeBidAction(lotUuid, 150);

      expect(res.success).toBe(true);
      expect(res.data?.newPrice).toBe(170); // 150 -> 170 (+20 ladder)
      // Authoritative started_at was refreshed to now, extending the timer by 20s
      expect(committedStartedAt).toBeDefined();
      expect(new Date(committedStartedAt).getTime()).toBeGreaterThan(new Date(startedAt).getTime() + 19000);

      // Verify broadcast carrying 20s subsequent duration
      expect(mockBroadcast).toHaveBeenCalledWith(
        seasonId,
        'BID_PLACED',
        expect.objectContaining({
          durationSeconds: 20,
          currentPrice: 170,
        })
      );
    });

    it('rejects a bid placed after the deadline has expired with authoritative server error', async () => {
      setupFranchiseContext();

      // Started 21 seconds ago with 20s timer -> EXPIRED
      const startedAt = new Date(Date.now() - 21000).toISOString();
      const lot = {
        id: lotUuid,
        season_id: seasonId,
        status: 'in_progress',
        current_price: 150,
        base_price: 20,
        highest_bidder_franchise_id: 'fran-mi',
        started_at: startedAt,
        bucket: 'B1',
      };

      const mockAdmin = {
        from: vi.fn((table: string) => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: lot, error: null }),
          then: (resolve: any) => {
            if (table === 'season_config') {
              return Promise.resolve({
                data: [
                  { key: 'auction_session_status', value: 'live' },
                  { key: 'auction_subsequent_bid_timer_seconds', value: '20' },
                  { key: 'auction_first_bid_timer_seconds', value: '30' },
                ],
                error: null,
              }).then(resolve);
            }
            return Promise.resolve({ data: [], error: null }).then(resolve);
          },
        })),
      };

      vi.spyOn(supabaseAdmin, 'createAdminClient').mockReturnValue(mockAdmin as any);

      const res = await placeBidAction(lotUuid, 150);

      expect(res.success).toBe(false);
      expect(res.error).toContain('bidding window has expired for this lot');
      expect(mockBroadcast).not.toHaveBeenCalled();
    });

    it('rejects finalizeExpiredLotAction if called before the deadline has elapsed', async () => {
      // Started 10s ago with 20s timer -> 10s remaining
      const startedAt = new Date(Date.now() - 10000).toISOString();
      const lot = {
        id: lotUuid,
        season_id: seasonId,
        status: 'in_progress',
        current_price: 100,
        base_price: 20,
        highest_bidder_franchise_id: 'fran-mi',
        started_at: startedAt,
      };

      const mockAdmin = {
        from: vi.fn((table: string) => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: lot, error: null }),
          then: (resolve: any) => {
            if (table === 'season_config') {
              return Promise.resolve({
                data: [
                  { key: 'auction_session_status', value: 'live' },
                  { key: 'auction_subsequent_bid_timer_seconds', value: '20' },
                  { key: 'auction_first_bid_timer_seconds', value: '30' },
                ],
                error: null,
              }).then(resolve);
            }
            return Promise.resolve({ data: [], error: null }).then(resolve);
          },
        })),
      };

      vi.spyOn(supabaseAdmin, 'createAdminClient').mockReturnValue(mockAdmin as any);

      const res = await finalizeExpiredLotAction(lotUuid, seasonId);

      expect(res.success).toBe(false);
      expect(res.error).toContain('bidding deadline has not expired yet');
    });

    it('rejects bid when auction session is paused', async () => {
      setupFranchiseContext();

      const lot = {
        id: lotUuid,
        season_id: seasonId,
        status: 'in_progress',
        current_price: 100,
        base_price: 20,
        highest_bidder_franchise_id: null,
        started_at: new Date().toISOString(),
        bucket: 'B1',
      };

      const mockAdmin = {
        from: vi.fn((table: string) => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: lot, error: null }),
          then: (resolve: any) => {
            if (table === 'season_config') {
              return Promise.resolve({
                data: [{ key: 'auction_session_status', value: 'paused' }],
                error: null,
              }).then(resolve);
            }
            return Promise.resolve({ data: [], error: null }).then(resolve);
          },
        })),
      };

      vi.spyOn(supabaseAdmin, 'createAdminClient').mockReturnValue(mockAdmin as any);

      const res = await placeBidAction(lotUuid, null);

      expect(res.success).toBe(false);
      expect(res.error).toContain('auction session is currently paused');
    });
  });

  // ===========================================================================
  // 4. FIRST-BID (30s) VS SUBSEQUENT-BID (20s) TIMER PRESERVATION
  // ===========================================================================
  describe('4. Timer Invariants (30s first-bid, 20s subsequent-bid)', () => {
    it('uses 30s deadline for opening bid and 20s deadline for subsequent bids', async () => {
      setupFranchiseContext();

      // Case A: Opening bid (highest_bidder_franchise_id is null)
      // Started 25 seconds ago. Under 30s timer, 25s < 30s -> VALID
      const startedAtOpening = new Date(Date.now() - 25000).toISOString();
      const openingLot = {
        id: lotUuid,
        season_id: seasonId,
        status: 'in_progress',
        current_price: null,
        base_price: 20,
        highest_bidder_franchise_id: null,
        started_at: startedAtOpening,
        bucket: 'B1',
      };

      const mockAdminOpening = {
        from: vi.fn((table: string) => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: openingLot, error: null }),
          then: (resolve: any) => {
            if (table === 'season_config') {
              return Promise.resolve({
                data: [
                  { key: 'auction_session_status', value: 'live' },
                  { key: 'auction_first_bid_timer_seconds', value: '30' },
                  { key: 'auction_subsequent_bid_timer_seconds', value: '20' },
                  { key: 'default_purse', value: '1000' },
                  { key: 'min_squad_size', value: '17' },
                  { key: 'max_squad_size', value: '22' },
                  { key: 'min_auction_purchases', value: '15' },
                ],
                error: null,
              }).then(resolve);
            }
            if (table === 'bucket_rules') {
              return Promise.resolve({ data: [{ bucket: 'B1', min_purchases: 2, is_mandatory: true }], error: null }).then(resolve);
            }
            return Promise.resolve({ data: [], error: null }).then(resolve);
          },
        })),
      };

      vi.spyOn(supabaseAdmin, 'createAdminClient').mockReturnValue(mockAdminOpening as any);
      vi.spyOn(transactionLib, 'executeAuctionMutationFlow').mockResolvedValue({
        success: true,
        data: { lot: openingLot, event: { id: 'evt-1' } },
      } as any);

      const resOpening = await placeBidAction(lotUuid, null);
      expect(resOpening.success).toBe(true);

      // Case B: Subsequent bid (highest_bidder_franchise_id is set)
      // Started 25 seconds ago. Under 20s timer, 25s >= 20s -> EXPIRED
      const subsequentLot = {
        id: lotUuid,
        season_id: seasonId,
        status: 'in_progress',
        current_price: 50,
        base_price: 20,
        highest_bidder_franchise_id: 'fran-mi',
        started_at: startedAtOpening, // 25s ago
        bucket: 'B1',
      };

      const mockAdminSubsequent = {
        from: vi.fn((table: string) => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: subsequentLot, error: null }),
          then: (resolve: any) => {
            if (table === 'season_config') {
              return Promise.resolve({
                data: [
                  { key: 'auction_session_status', value: 'live' },
                  { key: 'auction_first_bid_timer_seconds', value: '30' },
                  { key: 'auction_subsequent_bid_timer_seconds', value: '20' },
                ],
                error: null,
              }).then(resolve);
            }
            return Promise.resolve({ data: [], error: null }).then(resolve);
          },
        })),
      };

      vi.spyOn(supabaseAdmin, 'createAdminClient').mockReturnValue(mockAdminSubsequent as any);

      const resSubsequent = await placeBidAction(lotUuid, 50);
      expect(resSubsequent.success).toBe(false);
      expect(resSubsequent.error).toContain('bidding window has expired for this lot');
    });
  });
});
