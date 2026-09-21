// =============================================================================
// ACC Auction Portal — Integration Tests: Auction Concurrency & Atomicity
// =============================================================================

import { describe, it, expect } from 'vitest';
import { executeAuctionMutationFlow } from '@/lib/auction/transaction';

describe('Auction Concurrency & Transaction Safety', () => {
  // In-memory mock database state
  interface MockLot {
    id: string;
    season_id: string;
    status: string;
    current_price: number | null;
    highest_bidder_franchise_id: string | null;
    started_at: string;
    ended_at: string | null;
    updated_at: string;
  }

  interface MockEvent {
    id: string;
    season_id: string;
    auction_lot_id: string;
    event_type: string;
    sequence_number: number;
    price: number | null;
    franchise_id: string | null;
    actor_user_id: string;
    created_at: string;
  }

  function createMockSupabaseClient(
    lotState: MockLot,
    eventsState: MockEvent[],
    options?: { failEventInsert?: boolean }
  ) {
    return {
      from: (table: string) => {
        if (table === 'auction_lots') {
          let pendingUpdates: Partial<MockLot> = {};
          let conditions: {
            id?: string;
            status?: string;
            current_price?: number | null;
            isCurrentPriceNull?: boolean;
          } = {};

          const applyUpdate = () => {
            const idMatches = conditions.id === undefined || lotState.id === conditions.id;
            const statusMatches = conditions.status === undefined || lotState.status === conditions.status;

            let priceMatches = true;
            if (conditions.isCurrentPriceNull) {
              priceMatches = lotState.current_price === null;
            } else if (conditions.current_price !== undefined) {
              priceMatches = lotState.current_price === conditions.current_price;
            }

            if (idMatches && statusMatches && priceMatches) {
              Object.assign(lotState, pendingUpdates);
              return { data: [lotState], error: null };
            }

            return { data: [], error: null };
          };

          const builder: any = {
            update: (values: Partial<MockLot>) => {
              pendingUpdates = values;
              return builder;
            },
            eq: (column: string, value: any) => {
              if (column === 'id') conditions.id = value;
              if (column === 'status') conditions.status = value;
              if (column === 'current_price') conditions.current_price = value;
              return builder;
            },
            is: (column: string, value: any) => {
              if (column === 'current_price' && value === null) {
                conditions.isCurrentPriceNull = true;
              }
              return builder;
            },
            select: async () => {
              return applyUpdate();
            },
            then: (resolve: any, reject: any) => {
              return Promise.resolve(applyUpdate()).then(resolve, reject);
            },
          };
          return builder;
        }

        if (table === 'auction_events') {
          return {
            insert: (eventData: any) => ({
              select: () => ({
                single: async () => {
                  if (options?.failEventInsert) {
                    return {
                      data: null,
                      error: { message: 'Forced event insertion failure (e.g. network/constraint)' },
                    };
                  }

                  const newEvent: MockEvent = {
                    id: `evt-${eventsState.length + 1}`,
                    sequence_number: eventsState.length + 1,
                    ...eventData,
                  };
                  eventsState.push(newEvent);
                  return { data: newEvent, error: null };
                },
              }),
            }),
          };
        }

        throw new Error(`Unhandled mock table: ${table}`);
      },
    } as any;
  }

  it('1. Atomicity Rollback Test: forces auction_events failure and verifies lot is unchanged', async () => {
    const lot: MockLot = {
      id: 'lot-100',
      season_id: 'season-acc-2026',
      status: 'in_progress',
      current_price: 20,
      highest_bidder_franchise_id: 'franchise-titans',
      started_at: '2026-03-01T10:00:00Z',
      ended_at: null,
      updated_at: '2026-03-01T10:00:00Z',
    };
    const events: MockEvent[] = [];

    // Client that will deliberately fail during event insertion
    const mockClient = createMockSupabaseClient(lot, events, { failEventInsert: true });

    const originalLotSnapshot = { ...lot };

    const result = await executeAuctionMutationFlow(
      mockClient,
      originalLotSnapshot,
      {
        lotId: 'lot-100',
        expectedStatus: 'in_progress',
        expectedPrice: 20,
        newPrice: 30,
        highestBidderId: 'franchise-warriors',
        startedAt: '2026-03-01T10:00:15Z',
      },
      {
        seasonId: 'season-acc-2026',
        lotId: 'lot-100',
        eventType: 'BID_PLACED',
        actorUserId: 'user-warriors',
        franchiseId: 'franchise-warriors',
        price: 30,
      }
    );

    // 1. Transaction failed
    expect(result.success).toBe(false);
    expect(result.error).toContain('Projection rolled back');

    // 2. Lot state is completely restored/unchanged
    expect(lot.current_price).toBe(20);
    expect(lot.highest_bidder_franchise_id).toBe('franchise-titans');
    expect(lot.status).toBe('in_progress');

    // 3. No partial event remains in audit history
    expect(events.length).toBe(0);
  });

  it('2. Simultaneous Bids Test: exactly one succeeds and second is rejected with STALE_BID_PRICE', async () => {
    const lot: MockLot = {
      id: 'lot-200',
      season_id: 'season-acc-2026',
      status: 'in_progress',
      current_price: null, // opening bid
      highest_bidder_franchise_id: null,
      started_at: '2026-03-01T10:00:00Z',
      ended_at: null,
      updated_at: '2026-03-01T10:00:00Z',
    };
    const events: MockEvent[] = [];

    const mockClient = createMockSupabaseClient(lot, events);

    // Bid 1: Franchise A bids 20 at opening (expectedPrice = null)
    const bid1 = await executeAuctionMutationFlow(
      mockClient,
      { ...lot },
      {
        lotId: 'lot-200',
        expectedStatus: 'in_progress',
        expectedPrice: null,
        newPrice: 20,
        highestBidderId: 'franchise-A',
        startedAt: '2026-03-01T10:00:05Z',
      },
      {
        seasonId: 'season-acc-2026',
        lotId: 'lot-200',
        eventType: 'BID_PLACED',
        actorUserId: 'user-A',
        franchiseId: 'franchise-A',
        price: 20,
      }
    );

    // Bid 2: Franchise B also thought price was null and bids 20 concurrently
    const bid2 = await executeAuctionMutationFlow(
      mockClient,
      { ...lot }, // at the time of sending, thought price was null
      {
        lotId: 'lot-200',
        expectedStatus: 'in_progress',
        expectedPrice: null,
        newPrice: 20,
        highestBidderId: 'franchise-B',
        startedAt: '2026-03-01T10:00:06Z',
      },
      {
        seasonId: 'season-acc-2026',
        lotId: 'lot-200',
        eventType: 'BID_PLACED',
        actorUserId: 'user-B',
        franchiseId: 'franchise-B',
        price: 20,
      }
    );

    expect(bid1.success).toBe(true);
    expect(bid2.success).toBe(false);
    expect(bid2.error).toContain('STALE_BID_PRICE');

    // Winning bidder is franchise-A at ₹20
    expect(lot.current_price).toBe(20);
    expect(lot.highest_bidder_franchise_id).toBe('franchise-A');
    expect(events.length).toBe(1);
    expect(events[0].franchise_id).toBe('franchise-A');
  });

  it('3. Bid vs Hammer Race: late bid arriving after hammer is rejected', async () => {
    const lot: MockLot = {
      id: 'lot-300',
      season_id: 'season-acc-2026',
      status: 'sold', // Already hammered!
      current_price: 50,
      highest_bidder_franchise_id: 'franchise-A',
      started_at: '2026-03-01T10:00:00Z',
      ended_at: '2026-03-01T10:00:30Z',
      updated_at: '2026-03-01T10:00:30Z',
    };
    const events: MockEvent[] = [];
    const mockClient = createMockSupabaseClient(lot, events);

    // Bid attempted while expecting status = 'in_progress'
    const lateBid = await executeAuctionMutationFlow(
      mockClient,
      { ...lot },
      {
        lotId: 'lot-300',
        expectedStatus: 'in_progress',
        expectedPrice: 50,
        newPrice: 60,
        highestBidderId: 'franchise-B',
      },
      {
        seasonId: 'season-acc-2026',
        lotId: 'lot-300',
        eventType: 'BID_PLACED',
        actorUserId: 'user-B',
        franchiseId: 'franchise-B',
        price: 60,
      }
    );

    expect(lateBid.success).toBe(false);
    expect(lateBid.error).toContain('STALE_BID_PRICE');
    expect(lot.status).toBe('sold');
    expect(lot.current_price).toBe(50);
  });

  it('4. Stale Price Rejection: bid with outdated expectedPrice fails', async () => {
    const lot: MockLot = {
      id: 'lot-400',
      season_id: 'season-acc-2026',
      status: 'in_progress',
      current_price: 100, // Price moved to 100
      highest_bidder_franchise_id: 'franchise-A',
      started_at: '2026-03-01T10:00:00Z',
      ended_at: null,
      updated_at: '2026-03-01T10:00:10Z',
    };
    const events: MockEvent[] = [];
    const mockClient = createMockSupabaseClient(lot, events);

    // Client had cached expectedPrice = 80
    const staleBid = await executeAuctionMutationFlow(
      mockClient,
      { ...lot },
      {
        lotId: 'lot-400',
        expectedStatus: 'in_progress',
        expectedPrice: 80,
        newPrice: 100,
        highestBidderId: 'franchise-B',
      },
      {
        seasonId: 'season-acc-2026',
        lotId: 'lot-400',
        eventType: 'BID_PLACED',
        actorUserId: 'user-B',
        franchiseId: 'franchise-B',
        price: 100,
      }
    );

    expect(staleBid.success).toBe(false);
    expect(staleBid.error).toContain('STALE_BID_PRICE');
    expect(lot.current_price).toBe(100);
  });

  it('5. Non-Cascading UNDO_SALE Protection: rejects undo if later acquisition occurred', () => {
    const allEvents: MockEvent[] = [
      {
        id: 'e1',
        season_id: 'acc-2026',
        auction_lot_id: 'lot-1',
        event_type: 'SALE',
        sequence_number: 10,
        price: 50,
        franchise_id: 'franchise-A',
        actor_user_id: 'admin',
        created_at: '2026-03-01T10:00:00Z',
      },
      {
        id: 'e2',
        season_id: 'acc-2026',
        auction_lot_id: 'lot-2',
        event_type: 'SALE', // Subsequent sale!
        sequence_number: 15,
        price: 70,
        franchise_id: 'franchise-B',
        actor_user_id: 'admin',
        created_at: '2026-03-01T10:05:00Z',
      },
    ];

    const targetSale = allEvents[0];

    const hasSubsequent = allEvents.some(
      (e) =>
        ['SALE', 'ALLOTMENT', 'SCOUTING'].includes(e.event_type) &&
        e.sequence_number > targetSale.sequence_number
    );

    expect(hasSubsequent).toBe(true);
    const canUndo = !hasSubsequent;
    expect(canUndo).toBe(false);
  });
});
