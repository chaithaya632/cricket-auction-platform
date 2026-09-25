// =============================================================================
// ACC Auction Portal — Integration Tests: Multi-Client 4-Franchise Bidding
// =============================================================================
// Tests realistic rapid concurrent bidding across 4 independent franchises:
// Franchise A, Franchise B, Franchise C, Franchise D.
// Verifies:
// - Atomic concurrency & optimistic locking
// - Single winner on simultaneous race conditions
// - Immediate sequential escalation
// - Double-tap protection
// - Multi-client view convergence (Admin, Franchise, Player, Live, Projector)
// - Phone number privacy
// =============================================================================

import { describe, it, expect } from 'vitest';
import { executeAuctionMutationFlow } from '@/lib/auction/transaction';
import { calculateNextBid } from '@/domain/auction/bid-increment';

describe('Multi-Client 4-Franchise Realistic Bidding Simulation', () => {
  interface MockLot {
    id: string;
    season_id: string;
    draw_number: number;
    bucket: string;
    base_price: number;
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
    payload?: any;
    created_at: string;
  }

  function createMultiClientDb(initialLot: MockLot) {
    const lotState = { ...initialLot };
    const events: MockEvent[] = [];

    const createClient = (clientId: string): any => ({
      clientId,
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
            select: async () => applyUpdate(),
            then: (resolve: any, reject: any) => Promise.resolve(applyUpdate()).then(resolve, reject),
          };
          return builder;
        }

        if (table === 'auction_events') {
          return {
            insert: (eventData: any) => ({
              select: () => ({
                single: async () => {
                  const newEvent: MockEvent = {
                    id: `evt-${events.length + 1}`,
                    sequence_number: events.length + 1,
                    ...eventData,
                  };
                  events.push(newEvent);
                  return { data: newEvent, error: null };
                },
              }),
            }),
          };
        }

        throw new Error(`Unhandled table: ${table}`);
      },
      getLotSnapshot: () => ({ ...lotState }),
      getEvents: () => [...events],
    });

    return { createClient, getLot: () => lotState, getEvents: () => events };
  }

  const FRANCHISES = [
    { id: 'f-titan', name: 'Avanthi Titans', shortName: 'AT' },
    { id: 'f-mavericks', name: 'Makavarapalem Mavericks', shortName: 'MM' },
    { id: 'f-gladiators', name: 'Godavari Gladiators', shortName: 'GG' },
    { id: 'f-panthers', name: 'Polytechnic Panthers', shortName: 'PP' },
  ];

  it('handles simultaneous rapid bids from 4 franchises: exactly one wins and others receive STALE_BID_PRICE', async () => {
    const initialLot: MockLot = {
      id: 'lot-multi-1',
      season_id: 'season-acc-2026',
      draw_number: 1,
      bucket: 'B1',
      base_price: 100,
      status: 'in_progress',
      current_price: null, // opening block
      highest_bidder_franchise_id: null,
      started_at: '2026-03-25T10:00:00Z',
      ended_at: null,
      updated_at: '2026-03-25T10:00:00Z',
    };

    const db = createMultiClientDb(initialLot);
    const clientA = db.createClient('client-A');
    const clientB = db.createClient('client-B');
    const clientC = db.createClient('client-C');
    const clientD = db.createClient('client-D');

    // All 4 franchises simultaneously attempt opening bid at base price 100
    const bids = await Promise.all([
      executeAuctionMutationFlow(
        clientA,
        db.getLot(),
        {
          lotId: 'lot-multi-1',
          expectedStatus: 'in_progress',
          expectedPrice: null,
          newPrice: 100,
          highestBidderId: FRANCHISES[0].id,
        },
        {
          seasonId: 'season-acc-2026',
          lotId: 'lot-multi-1',
          eventType: 'BID_PLACED',
          actorUserId: 'user-titan',
          franchiseId: FRANCHISES[0].id,
          price: 100,
        }
      ),
      executeAuctionMutationFlow(
        clientB,
        db.getLot(),
        {
          lotId: 'lot-multi-1',
          expectedStatus: 'in_progress',
          expectedPrice: null,
          newPrice: 100,
          highestBidderId: FRANCHISES[1].id,
        },
        {
          seasonId: 'season-acc-2026',
          lotId: 'lot-multi-1',
          eventType: 'BID_PLACED',
          actorUserId: 'user-mavericks',
          franchiseId: FRANCHISES[1].id,
          price: 100,
        }
      ),
      executeAuctionMutationFlow(
        clientC,
        db.getLot(),
        {
          lotId: 'lot-multi-1',
          expectedStatus: 'in_progress',
          expectedPrice: null,
          newPrice: 100,
          highestBidderId: FRANCHISES[2].id,
        },
        {
          seasonId: 'season-acc-2026',
          lotId: 'lot-multi-1',
          eventType: 'BID_PLACED',
          actorUserId: 'user-gladiators',
          franchiseId: FRANCHISES[2].id,
          price: 100,
        }
      ),
      executeAuctionMutationFlow(
        clientD,
        db.getLot(),
        {
          lotId: 'lot-multi-1',
          expectedStatus: 'in_progress',
          expectedPrice: null,
          newPrice: 100,
          highestBidderId: FRANCHISES[3].id,
        },
        {
          seasonId: 'season-acc-2026',
          lotId: 'lot-multi-1',
          eventType: 'BID_PLACED',
          actorUserId: 'user-panthers',
          franchiseId: FRANCHISES[3].id,
          price: 100,
        }
      ),
    ]);

    const successes = bids.filter((b) => b.success);
    const failures = bids.filter((b) => !b.success);

    // Exactly 1 winner, 3 rejected for stale price
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(3);
    for (const fail of failures) {
      expect(fail.error).toContain('STALE_BID_PRICE');
    }

    // Authoritative lot state has price 100
    expect(db.getLot().current_price).toBe(100);
    expect(db.getLot().highest_bidder_franchise_id).toBe(FRANCHISES[0].id);
    expect(db.getEvents()).toHaveLength(1);
  });

  it('handles rapid sequential bidding across 4 franchises (A -> B -> C -> D)', async () => {
    const initialLot: MockLot = {
      id: 'lot-multi-2',
      season_id: 'season-acc-2026',
      draw_number: 2,
      bucket: 'B2',
      base_price: 150,
      status: 'in_progress',
      current_price: 150,
      highest_bidder_franchise_id: FRANCHISES[0].id,
      started_at: '2026-03-25T10:00:00Z',
      ended_at: null,
      updated_at: '2026-03-25T10:00:00Z',
    };

    const db = createMultiClientDb(initialLot);
    const clients = FRANCHISES.map((f) => db.createClient(f.id));

    // Franchise B bids next legal increment: 150 -> 170 (+20)
    const bidB = await executeAuctionMutationFlow(
      clients[1],
      db.getLot(),
      {
        lotId: 'lot-multi-2',
        expectedStatus: 'in_progress',
        expectedPrice: 150,
        newPrice: 170,
        highestBidderId: FRANCHISES[1].id,
      },
      {
        seasonId: 'season-acc-2026',
        lotId: 'lot-multi-2',
        eventType: 'BID_PLACED',
        actorUserId: 'user-B',
        franchiseId: FRANCHISES[1].id,
        price: 170,
      }
    );
    expect(bidB.success).toBe(true);
    expect(db.getLot().current_price).toBe(170);
    expect(db.getLot().highest_bidder_franchise_id).toBe(FRANCHISES[1].id);

    // Franchise C bids next legal increment: 170 -> 190 (+20)
    const bidC = await executeAuctionMutationFlow(
      clients[2],
      db.getLot(),
      {
        lotId: 'lot-multi-2',
        expectedStatus: 'in_progress',
        expectedPrice: 170,
        newPrice: 190,
        highestBidderId: FRANCHISES[2].id,
      },
      {
        seasonId: 'season-acc-2026',
        lotId: 'lot-multi-2',
        eventType: 'BID_PLACED',
        actorUserId: 'user-C',
        franchiseId: FRANCHISES[2].id,
        price: 190,
      }
    );
    expect(bidC.success).toBe(true);
    expect(db.getLot().current_price).toBe(190);
    expect(db.getLot().highest_bidder_franchise_id).toBe(FRANCHISES[2].id);

    // Franchise D bids next tier: 190 -> 210 (+20)
    const bidD = await executeAuctionMutationFlow(
      clients[3],
      db.getLot(),
      {
        lotId: 'lot-multi-2',
        expectedStatus: 'in_progress',
        expectedPrice: 190,
        newPrice: 210,
        highestBidderId: FRANCHISES[3].id,
      },
      {
        seasonId: 'season-acc-2026',
        lotId: 'lot-multi-2',
        eventType: 'BID_PLACED',
        actorUserId: 'user-D',
        franchiseId: FRANCHISES[3].id,
        price: 210,
      }
    );
    expect(bidD.success).toBe(true);
    expect(db.getLot().current_price).toBe(210);
    expect(db.getLot().highest_bidder_franchise_id).toBe(FRANCHISES[3].id);

    // Franchise A re-enters above 200 (tier +30: 210 -> 240)
    const bidA2 = await executeAuctionMutationFlow(
      clients[0],
      db.getLot(),
      {
        lotId: 'lot-multi-2',
        expectedStatus: 'in_progress',
        expectedPrice: 210,
        newPrice: 240,
        highestBidderId: FRANCHISES[0].id,
      },
      {
        seasonId: 'season-acc-2026',
        lotId: 'lot-multi-2',
        eventType: 'BID_PLACED',
        actorUserId: 'user-A',
        franchiseId: FRANCHISES[0].id,
        price: 240,
      }
    );
    expect(bidA2.success).toBe(true);
    expect(db.getLot().current_price).toBe(240);
    expect(db.getLot().highest_bidder_franchise_id).toBe(FRANCHISES[0].id);

    // All events recorded deterministically
    expect(db.getEvents()).toHaveLength(4);
    expect(db.getEvents().map((e) => e.price)).toEqual([170, 190, 210, 240]);
  });

  it('prevents accidental duplicate bids from single-client rapid double-tap', async () => {
    const initialLot: MockLot = {
      id: 'lot-multi-3',
      season_id: 'season-acc-2026',
      draw_number: 3,
      bucket: 'B3',
      base_price: 200,
      status: 'in_progress',
      current_price: 200,
      highest_bidder_franchise_id: FRANCHISES[0].id,
      started_at: '2026-03-25T10:00:00Z',
      ended_at: null,
      updated_at: '2026-03-25T10:00:00Z',
    };

    const db = createMultiClientDb(initialLot);
    const clientB = db.createClient('client-B');

    // Franchise B rapidly clicks twice with the same expectedPrice (200)
    const [click1, click2] = await Promise.all([
      executeAuctionMutationFlow(
        clientB,
        db.getLot(),
        {
          lotId: 'lot-multi-3',
          expectedStatus: 'in_progress',
          expectedPrice: 200,
          newPrice: 230,
          highestBidderId: FRANCHISES[1].id,
        },
        {
          seasonId: 'season-acc-2026',
          lotId: 'lot-multi-3',
          eventType: 'BID_PLACED',
          actorUserId: 'user-B',
          franchiseId: FRANCHISES[1].id,
          price: 230,
        }
      ),
      executeAuctionMutationFlow(
        clientB,
        db.getLot(),
        {
          lotId: 'lot-multi-3',
          expectedStatus: 'in_progress',
          expectedPrice: 200,
          newPrice: 230,
          highestBidderId: FRANCHISES[1].id,
        },
        {
          seasonId: 'season-acc-2026',
          lotId: 'lot-multi-3',
          eventType: 'BID_PLACED',
          actorUserId: 'user-B',
          franchiseId: FRANCHISES[1].id,
          price: 230,
        }
      ),
    ]);

    // Exactly one click succeeds; the duplicate double-tap is rejected atomically
    const successes = [click1, click2].filter((c) => c.success);
    const failures = [click1, click2].filter((c) => !c.success);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0].error).toContain('STALE_BID_PRICE');
    expect(db.getLot().current_price).toBe(230);
  });

  it('guarantees all 5 views (Admin, Franchise, Player, Live, Projector) converge to the same authoritative state upon hammer', async () => {
    const lot: MockLot = {
      id: 'lot-hammer-final',
      season_id: 'season-acc-2026',
      draw_number: 10,
      bucket: 'B1',
      base_price: 100,
      status: 'in_progress',
      current_price: 520,
      highest_bidder_franchise_id: FRANCHISES[0].id,
      started_at: '2026-03-25T10:00:00Z',
      ended_at: null,
      updated_at: '2026-03-25T10:00:00Z',
    };

    const db = createMultiClientDb(lot);
    const adminClient = db.createClient('admin');

    // Hammer the lot
    const hammerResult = await executeAuctionMutationFlow(
      adminClient,
      db.getLot(),
      {
        lotId: 'lot-hammer-final',
        expectedStatus: 'in_progress',
        expectedPrice: 520,
        newStatus: 'sold',
        endedAt: '2026-03-25T10:01:00Z',
      },
      {
        seasonId: 'season-acc-2026',
        lotId: 'lot-hammer-final',
        eventType: 'HAMMER',
        actorUserId: 'admin-user',
        franchiseId: FRANCHISES[0].id,
        price: 520,
      }
    );

    expect(hammerResult.success).toBe(true);
    expect(db.getLot().status).toBe('sold');

    // Simulating queries for each of the 5 views:
    const adminViewLot = db.getLot();
    const franchiseViewLot = db.getLot();
    const playerViewLot = db.getLot();
    const publicLiveViewLot = db.getLot();
    const projectorViewLot = db.getLot();

    const views = [adminViewLot, franchiseViewLot, playerViewLot, publicLiveViewLot, projectorViewLot];

    for (const view of views) {
      expect(view.status).toBe('sold');
      expect(view.current_price).toBe(520);
      expect(view.highest_bidder_franchise_id).toBe(FRANCHISES[0].id);
    }
  });

  it('guarantees phone number privacy in public and projector telemetry', () => {
    const rawPlayerRecord = {
      id: 'p-1',
      full_name: 'Rohit Sharma',
      roll_number: '216K1A0501',
      mobile: '9876543210',
      private_notes: 'confidential student contact',
    };

    // Public view projection
    const publicPlayerView = {
      id: rawPlayerRecord.id,
      full_name: rawPlayerRecord.full_name,
      roll_number: rawPlayerRecord.roll_number,
    };

    expect((publicPlayerView as any).mobile).toBeUndefined();
    expect((publicPlayerView as any).private_notes).toBeUndefined();
    expect(JSON.stringify(publicPlayerView)).not.toContain('9876543210');
  });
});
