// =============================================================================
// ACC Auction Portal — Unit Tests: Auction Sync, Pause/Timer, & Latency Optimizations
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { AuctionTimer } from '@/components/auction/auction-timer';
import type { AuctionSessionState } from '@/lib/auction/types';
import { calculateNextBid } from '@/domain/auction/bid-increment';

const mockRevalidatePath = vi.fn();
vi.mock('next/cache', () => ({
  revalidatePath: (...args: any[]) => mockRevalidatePath(...args),
}));

const mockRequireAdmin = vi.fn();
vi.mock('@/lib/permissions', () => ({
  requireAdmin: () => mockRequireAdmin(),
  requireFranchise: vi.fn(),
}));

let mockAdminClientInstance: any = null;
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mockAdminClientInstance,
}));

import { pauseAuctionAction, resumeAuctionAction } from '@/lib/auction/actions';

describe('AuctionTimer Component — Pause Freeze & State Handling', () => {
  it('renders WAITING when auction lot is not active and not paused', () => {
    const html = renderToString(
      <AuctionTimer
        startedAt={null}
        durationSeconds={30}
        isActive={false}
        isPaused={false}
      />
    );
    expect(html).toContain('WAITING');
    expect(html).not.toContain('PAUSED');
  });

  it('renders countdown seconds and active ping when active and not paused', () => {
    const nowIso = new Date().toISOString();
    const html = renderToString(
      <AuctionTimer
        startedAt={nowIso}
        durationSeconds={30}
        isActive={true}
        isPaused={false}
      />
    );
    expect(html).toContain('s');
    expect(html).not.toContain('WAITING');
    expect(html).not.toContain('PAUSED');
    expect(html).toContain('animate-ping');
  });

  it('renders frozen PAUSED badge with exact pausedRemainingSeconds when paused', () => {
    const html = renderToString(
      <AuctionTimer
        startedAt={new Date(Date.now() - 12000).toISOString()}
        durationSeconds={30}
        isActive={false}
        isPaused={true}
        pausedRemainingSeconds={18}
      />
    );
    expect(html).toContain('PAUSED (18s)');
    expect(html).toContain('text-amber-400');
    expect(html).toContain('bg-amber-500');
    expect(html).not.toContain('animate-ping');
  });

  it('calculates percentage accurately when frozen at pausedRemainingSeconds', () => {
    const html = renderToString(
      <AuctionTimer
        startedAt={null}
        durationSeconds={30}
        isActive={false}
        isPaused={true}
        pausedRemainingSeconds={15}
      />
    );
    // 15 / 30 = 50%
    expect(html).toContain('width:50%');
    expect(html).toContain('PAUSED (15s)');
  });

  it('handles pausedRemainingSeconds = 0 gracefully', () => {
    const html = renderToString(
      <AuctionTimer
        startedAt={null}
        durationSeconds={30}
        isActive={false}
        isPaused={true}
        pausedRemainingSeconds={0}
      />
    );
    expect(html).toContain('PAUSED (0s)');
    expect(html).toContain('width:0%');
  });
});

describe('Pause & Resume Timer Mathematics Invariants', () => {
  it('correctly calculates remaining seconds on pause', () => {
    const timerDuration = 30;
    const elapsedSeconds = 11;
    const activeLotStartedAt = new Date(Date.now() - elapsedSeconds * 1000).toISOString();

    const elapsedMs = Date.now() - new Date(activeLotStartedAt).getTime();
    const computedElapsedSec = Math.max(0, Math.floor(elapsedMs / 1000));
    const remainingSeconds = Math.max(0, timerDuration - computedElapsedSec);

    expect(remainingSeconds).toBe(19);
  });

  it('synthesizes new started_at on resume ensuring seamless continuation', () => {
    const timerDuration = 30;
    const remainingSecondsToRestore = 19;

    // Remaining = 19s => Elapsed = 11s
    const elapsedSeconds = timerDuration - remainingSecondsToRestore;
    const resumeTime = Date.now();
    const restoredStartedAt = new Date(resumeTime - elapsedSeconds * 1000).toISOString();

    // Now verify: if a client computes remaining time from restoredStartedAt:
    const deadline = new Date(restoredStartedAt).getTime() + timerDuration * 1000;
    const clientRemaining = Math.ceil((deadline - resumeTime) / 1000);

    expect(clientRemaining).toBe(19);
  });

  it('handles subsequent bid timer (15s) resume math correctly', () => {
    const timerDuration = 15;
    const remainingSecondsToRestore = 7;

    const elapsedSeconds = timerDuration - remainingSecondsToRestore;
    const resumeTime = Date.now();
    const restoredStartedAt = new Date(resumeTime - elapsedSeconds * 1000).toISOString();

    const deadline = new Date(restoredStartedAt).getTime() + timerDuration * 1000;
    const clientRemaining = Math.ceil((deadline - resumeTime) / 1000);

    expect(clientRemaining).toBe(7);
  });
});

describe('AuctionSessionState Model & Type Extension', () => {
  it('includes pausedRemainingSeconds and pausedAt in AuctionSessionState', () => {
    const sessionState: AuctionSessionState = {
      status: 'paused',
      seasonId: 'season-001',
      seasonName: 'ACC 2026',
      isLive: false,
      isPaused: true,
      isNotStarted: false,
      isCompleted: false,
      startedAt: '2026-09-26T10:00:00.000Z',
      activeLotId: 'lot-123',
      pausedRemainingSeconds: 22,
      pausedAt: '2026-09-26T10:15:30.000Z',
    };

    expect(sessionState.status).toBe('paused');
    expect(sessionState.isPaused).toBe(true);
    expect(sessionState.pausedRemainingSeconds).toBe(22);
    expect(sessionState.pausedAt).toBe('2026-09-26T10:15:30.000Z');
  });

  it('allows null pausedRemainingSeconds when not paused or not present', () => {
    const sessionState: AuctionSessionState = {
      status: 'live',
      seasonId: 'season-001',
      seasonName: 'ACC 2026',
      isLive: true,
      isPaused: false,
      isNotStarted: false,
      isCompleted: false,
      startedAt: '2026-09-26T10:00:00.000Z',
      activeLotId: 'lot-123',
      pausedRemainingSeconds: null,
      pausedAt: null,
    };

    expect(sessionState.isLive).toBe(true);
    expect(sessionState.pausedRemainingSeconds).toBeNull();
  });
});

describe('Franchise Bidding Optimistic Logic', () => {
  it('correctly calculates next bid targets across pricing thresholds', () => {
    // Under 100: increment is 10
    expect(calculateNextBid(20, 20)).toBe(30);
    expect(calculateNextBid(90, 20)).toBe(100);

    // 100 to 200: increment is 20
    expect(calculateNextBid(100, 20)).toBe(120);
    expect(calculateNextBid(180, 20)).toBe(200);

    // Over 200: increment is 30
    expect(calculateNextBid(200, 20)).toBe(230);
    expect(calculateNextBid(500, 20)).toBe(530);
  });

  it('determines optimistic bid priority before server roundtrip finishes', () => {
    const basePrice = 20;
    const serverPrice = 50;
    const proposedOptimisticPrice = calculateNextBid(serverPrice, basePrice); // 60

    expect(proposedOptimisticPrice).toBe(60);

    // When optimistic price is 60 and server is still at 50:
    const hasOptimisticBid = proposedOptimisticPrice > serverPrice;
    const displayPrice = hasOptimisticBid ? proposedOptimisticPrice : serverPrice;
    expect(displayPrice).toBe(60);

    // Next bid after optimistic is 70
    const nextBidAfterOptimistic = calculateNextBid(displayPrice, basePrice);
    expect(nextBidAfterOptimistic).toBe(70);
  });
});

describe('Realtime Sync Architecture Invariants', () => {
  it('constructs deterministic shared season channels for WebSocket broadcast', () => {
    const seasonId = 'season-xyz-123';
    const channelName = `acc-auction-${seasonId}`;
    expect(channelName).toBe('acc-auction-season-xyz-123');
    // Ensure no random suffix breaks cross-tab broadcast
    expect(channelName).not.toMatch(/[a-z0-9]{5}$/);
  });

  it('trailing debounce schedule executes when events arrive in rapid succession', async () => {
    let callCount = 0;
    let lastRefreshTime = 0;
    let debounceTimer: NodeJS.Timeout | null = null;
    const DEBOUNCE_MS = 50;

    const triggerRefresh = (fakeNow: number) => {
      const elapsed = fakeNow - lastRefreshTime;
      if (elapsed > DEBOUNCE_MS) {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
        lastRefreshTime = fakeNow;
        callCount++;
      } else {
        if (!debounceTimer) {
          debounceTimer = setTimeout(() => {
            debounceTimer = null;
            lastRefreshTime = Date.now();
            callCount++;
          }, DEBOUNCE_MS - elapsed);
        }
      }
    };

    // First event at t = 0
    triggerRefresh(100);
    expect(callCount).toBe(1);

    // Second event arrives rapidly at t = 120ms (within 50ms debounce window)
    triggerRefresh(120);
    expect(callCount).toBe(1); // Not called yet, scheduled trailing

    // Wait for trailing debounce to fire
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(callCount).toBe(2); // Trailing event fired, NOT dropped!
  });
});

describe('Pause & Resume Server Actions — Schema Constraint Compliance, Atomic Fail-Closed & Write Ordering', () => {
  beforeEach(() => {
    mockRevalidatePath.mockReset();
    mockRequireAdmin.mockReset();
    mockRequireAdmin.mockResolvedValue({
      user: { id: 'admin-user-001' },
      activeSeason: { id: 'season-001', name: 'ACC 2026', status: 'auction' },
      isSuperAdmin: true,
    });
  });

  it('A. pauseAuctionAction writes value_type="integer" (strictly within season_config CHECK constraint) and defaults subsequent timer to 20s', async () => {
    const capturedConfigUpserts: any[] = [];
    const capturedEvents: any[] = [];
    const started5SecAgo = new Date(Date.now() - 5000).toISOString();

    mockAdminClientInstance = {
      from: (table: string) => {
        if (table === 'season_config') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { value: 'live' }, error: null }),
                }),
                in: async () => ({
                  // Omit subsequent_bid_timer_seconds to verify 20s default fallback
                  data: [{ key: 'first_bid_timer_seconds', value: '30' }],
                  error: null,
                }),
              }),
            }),
            upsert: async (payload: any) => {
              capturedConfigUpserts.push(...(Array.isArray(payload) ? payload : [payload]));
              return { data: null, error: null };
            },
          };
        }
        if (table === 'auction_lots') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: 'lot-active-001',
                      started_at: started5SecAgo,
                      highest_bidder_franchise_id: 'franchise-001', // Uses subsequentBidSeconds (20s)
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'auction_events') {
          return {
            insert: async (payload: any) => {
              capturedEvents.push(payload);
              return { data: null, error: null };
            },
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    };

    const result = await pauseAuctionAction();

    expect(result.success).toBe(true);
    // 20s subsequent timer - 5s elapsed = 15s remaining
    expect(result.data?.remainingSeconds).toBe(15);

    // Every upserted row in season_config must strictly satisfy CHECK (value_type IN ('integer', 'text', 'boolean', 'json'))
    const allowedValueTypes = new Set(['integer', 'text', 'boolean', 'json']);
    expect(capturedConfigUpserts.length).toBe(3);
    for (const row of capturedConfigUpserts) {
      expect(allowedValueTypes.has(row.value_type)).toBe(true);
      expect(row.value_type).not.toBe('number');
    }

    const pausedRemainingRow = capturedConfigUpserts.find(
      (r) => r.key === 'auction_lot_paused_remaining_seconds'
    );
    expect(pausedRemainingRow).toBeDefined();
    expect(pausedRemainingRow.value_type).toBe('integer');
    expect(pausedRemainingRow.value).toBe('15');

    expect(capturedEvents.length).toBe(1);
    expect(capturedEvents[0].event_type).toBe('PAUSE');
    expect(capturedEvents[0].payload.remaining_seconds).toBe(15);
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/auction');
  });

  it('B. pauseAuctionAction fails closed when season_config upsert fails (no PAUSE event inserted, no success returned)', async () => {
    const capturedEvents: any[] = [];

    mockAdminClientInstance = {
      from: (table: string) => {
        if (table === 'season_config') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { value: 'live' }, error: null }),
                }),
                in: async () => ({
                  data: [
                    { key: 'first_bid_timer_seconds', value: '30' },
                    { key: 'subsequent_bid_timer_seconds', value: '20' },
                  ],
                  error: null,
                }),
              }),
            }),
            upsert: async () => ({
              data: null,
              error: {
                code: '23514',
                message: 'new row for relation "season_config" violates check constraint "season_config_value_type_check"',
              },
            }),
          };
        }
        if (table === 'auction_lots') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: 'lot-active-001',
                      started_at: new Date(Date.now() - 3000).toISOString(),
                      highest_bidder_franchise_id: null,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'auction_events') {
          return {
            insert: async (payload: any) => {
              capturedEvents.push(payload);
              return { data: null, error: null };
            },
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    };

    const result = await pauseAuctionAction();

    expect(result.success).toBe(false);
    expect(result.error).toContain('season_config_value_type_check');
    // Must NOT insert PAUSE event or revalidate paths when season_config fails
    expect(capturedEvents.length).toBe(0);
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it('C. resumeAuctionAction updates auction_lots.started_at FIRST before flipping season_config to live and deleting pause config', async () => {
    const operationOrder: string[] = [];

    mockAdminClientInstance = {
      from: (table: string) => {
        if (table === 'season_config') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { value: 'paused' }, error: null }),
                }),
                in: async () => ({
                  data: [
                    { key: 'auction_lot_paused_remaining_seconds', value: '25' },
                    { key: 'first_bid_timer_seconds', value: '30' },
                  ],
                  error: null,
                }),
              }),
            }),
            upsert: async (payload: any) => {
              operationOrder.push(`season_config.upsert(${payload.value})`);
              return { data: null, error: null };
            },
            delete: () => ({
              eq: () => ({
                in: async ( col: string, keys: string[]) => {
                  operationOrder.push(`season_config.delete(${keys.join(',')})`);
                  return { data: null, error: null };
                },
              }),
            }),
          };
        }
        if (table === 'auction_lots') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: 'lot-active-001',
                      highest_bidder_franchise_id: null,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
            update: (payload: any) => ({
              eq: async () => {
                operationOrder.push(`auction_lots.update(started_at=${Boolean(payload.started_at)})`);
                return { data: null, error: null };
              },
            }),
          };
        }
        if (table === 'auction_events') {
          return {
            insert: async (payload: any) => {
              operationOrder.push(`auction_events.insert(${payload.event_type})`);
              return { data: null, error: null };
            },
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    };

    const result = await resumeAuctionAction();

    expect(result.success).toBe(true);
    expect(operationOrder).toEqual([
      'auction_lots.update(started_at=true)',
      'season_config.upsert(live)',
      'season_config.delete(auction_lot_paused_remaining_seconds,auction_paused_at)',
      'auction_events.insert(RESUME)',
    ]);
  });

  it('C2. resumeAuctionAction fails closed without flipping season_config to live if auction_lots.started_at update fails', async () => {
    const operationOrder: string[] = [];

    mockAdminClientInstance = {
      from: (table: string) => {
        if (table === 'season_config') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { value: 'paused' }, error: null }),
                }),
                in: async () => ({
                  data: [{ key: 'auction_lot_paused_remaining_seconds', value: '25' }],
                  error: null,
                }),
              }),
            }),
            upsert: async () => {
              operationOrder.push('season_config.upsert');
              return { data: null, error: null };
            },
            delete: () => ({
              eq: () => ({
                in: async () => {
                  operationOrder.push('season_config.delete');
                  return { data: null, error: null };
                },
              }),
            }),
          };
        }
        if (table === 'auction_lots') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: 'lot-active-001', highest_bidder_franchise_id: null },
                    error: null,
                  }),
                }),
              }),
            }),
            update: () => ({
              eq: async () => {
                operationOrder.push('auction_lots.update');
                return { data: null, error: { message: 'Database connection timeout' } };
              },
            }),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    };

    const result = await resumeAuctionAction();
    expect(result.success).toBe(false);
    expect(result.error).toContain('Database connection timeout');
    expect(operationOrder).toEqual(['auction_lots.update']);
  });
});
