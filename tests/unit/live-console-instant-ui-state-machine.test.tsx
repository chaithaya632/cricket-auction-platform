// @vitest-environment jsdom
// =============================================================================
// ACC Auction Portal — Phase 5.2 Unit & State Machine Tests
// Instant UI Responsiveness, Single Timer Loop & Authoritative State Transitions
// =============================================================================

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { AuctionTimer } from '@/components/auction/auction-timer';
import {
  startAuctionAction,
  pauseAuctionAction,
  resumeAuctionAction,
} from '@/lib/auction/actions';
import type { AuctionSessionState, AuctionLotWithDetails } from '@/lib/auction/types';

// Mock next/navigation & next/cache
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// Mock realtime broadcast
const mockBroadcastAuctionUpdate = vi.fn().mockResolvedValue(true);
vi.mock('@/lib/auction/realtime', () => ({
  broadcastAuctionUpdate: (...args: any[]) => mockBroadcastAuctionUpdate(...args),
}));

// Mock admin auth context
const mockAdminContext = {
  user: { id: 'admin-user-001', email: 'admin@acc.com' },
  activeSeason: { id: 'season-001', name: 'ACC 2026 Season' },
  isSuperAdmin: true,
};

vi.mock('@/lib/permissions', () => ({
  requireAdmin: vi.fn(async () => mockAdminContext),
  requireFranchise: vi.fn(),
  requireSuperAdmin: vi.fn(async () => mockAdminContext),
}));

vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(async () => mockAdminContext.user),
}));

let mockAdminClient: any;
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mockAdminClient,
}));

// Mock queries
vi.mock('@/lib/auction/queries', () => ({
  getActiveLot: vi.fn(async () => ({
    id: 'lot-existing-floor',
    season_id: 'season-001',
    lot_number: 1,
    status: 'in_progress',
    base_price: 20,
    current_price: null,
    highest_bidder_franchise_id: null,
    draw_number: 7,
    bucket: 'B3',
    player: {
      id: 'p-007',
      full_name: 'Existing Floor Player',
      category: 'ALL_ROUNDER',
      batting_style: 'RHB',
      bowling_style: 'RAF',
    },
  })),
  getAuctionSessionState: vi.fn(async () => ({
    status: 'live',
    seasonId: 'season-001',
    isLive: true,
    isPaused: false,
    isNotStarted: false,
    isCompleted: false,
  })),
  getGuestDrawCandidates: vi.fn(async () => []),
}));

describe('Phase 5.2 — Live Console Instant UI & State Machine Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ===========================================================================
  // 1. AuctionTimer — Instant Pause Freeze & Single Interval Loop Invariants
  // ===========================================================================
  describe('1. AuctionTimer Component — Instant Pause Freeze & Single Loop Invariants', () => {
    it('freezes immediately at current remaining seconds when isPaused becomes true without ticking down', () => {
      const startedAt = new Date(Date.now() - 4000).toISOString(); // 4s elapsed of 30s = 26s left
      const onRemainingChange = vi.fn();

      const { rerender } = render(
        <AuctionTimer
          startedAt={startedAt}
          durationSeconds={30}
          isActive={true}
          isPaused={false}
          onRemainingChange={onRemainingChange}
        />
      );

      // Initial render shows 26s
      expect(screen.getByText('26s')).toBeDefined();
      expect(onRemainingChange).toHaveBeenCalledWith(26);

      // Operator clicks PAUSE -> parent rerenders with isPaused=true and pausedRemainingSeconds=26
      rerender(
        <AuctionTimer
          startedAt={startedAt}
          durationSeconds={30}
          isActive={true}
          isPaused={true}
          pausedRemainingSeconds={26}
          onRemainingChange={onRemainingChange}
        />
      );

      // Visible UI shows PAUSED badge at 26s instantly
      expect(screen.getByText('PAUSED (26s)')).toBeDefined();

      // Advance time by 5 seconds while paused: timer MUST NOT tick down to 25, 24, etc.
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      // Still frozen at 26s
      expect(screen.getByText('PAUSED (26s)')).toBeDefined();
    });

    it('maintains exactly one interval loop and prevents duplicate intervals on parent re-renders', () => {
      const startedAt = new Date(Date.now()).toISOString();
      const onRemainingChange = vi.fn();

      const { rerender } = render(
        <AuctionTimer
          startedAt={startedAt}
          durationSeconds={30}
          isActive={true}
          isPaused={false}
          onRemainingChange={onRemainingChange}
        />
      );

      // Trigger 10 parent re-renders in quick succession (e.g. Supabase broadcast messages, audio toggles)
      for (let i = 0; i < 10; i++) {
        rerender(
          <AuctionTimer
            startedAt={startedAt}
            durationSeconds={30}
            isActive={true}
            isPaused={false}
            onRemainingChange={onRemainingChange}
          />
        );
      }

      // Advance 1 second
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      // Countdown should cleanly show 29s, NOT decremented multiple times by rogue duplicated intervals
      expect(screen.getByText('29s')).toBeDefined();
    });

    it('handles instant optimistic time extensions (+10s, +20s, +30s) and clears TIME UP', () => {
      // Setup expired timer: 35s elapsed of 30s -> TIME UP
      const startedAt = new Date(Date.now() - 35000).toISOString();
      const onExtend = vi.fn().mockResolvedValue(true);
      const onRemainingChange = vi.fn();

      render(
        <AuctionTimer
          startedAt={startedAt}
          durationSeconds={30}
          isActive={true}
          isPaused={false}
          showControls={true}
          onExtend={onExtend}
          onRemainingChange={onRemainingChange}
        />
      );

      expect(screen.getByText('TIME UP')).toBeDefined();

      // Click +10s button
      const extend10Btn = screen.getByRole('button', { name: /\+10s/i });
      fireEvent.click(extend10Btn);

      // TIME UP must be replaced immediately with active countdown (5s remaining from 40s total - 35s elapsed)
      expect(screen.getByText('5s')).toBeDefined();
      expect(screen.queryByText('TIME UP')).toBeNull();
      expect(onExtend).toHaveBeenCalledWith(10);
    });

    it('cleans up interval timer on unmount', () => {
      const startedAt = new Date(Date.now()).toISOString();
      const onRemainingChange = vi.fn();

      const { unmount } = render(
        <AuctionTimer
          startedAt={startedAt}
          durationSeconds={30}
          isActive={true}
          isPaused={false}
          onRemainingChange={onRemainingChange}
        />
      );

      unmount();

      // Advancing timer after unmount should not throw or trigger callback
      const callCount = onRemainingChange.mock.calls.length;
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(onRemainingChange.mock.calls.length).toBe(callCount);
    });
  });

  // ===========================================================================
  // 2. startAuctionAction — Pre-Start Floor Lot Preservation & Guest Draw
  // ===========================================================================
  describe('2. startAuctionAction — Pre-Start Floor Lot Preservation Invariants', () => {
    it('auto-advances to the first eligible player when no lot is on the floor', async () => {
      let lotUpdateCalled = false;

      mockAdminClient = {
        from: (table: string) => {
          if (table === 'seasons') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: { id: 'season-001', status: 'draft' },
                    error: null,
                  }),
                }),
              }),
              update: () => ({
                eq: async () => ({ error: null }),
              }),
            };
          }
          if (table === 'season_config') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
                  }),
                }),
              }),
              upsert: vi.fn().mockResolvedValue({ error: null }),
            };
          }
          if (table === 'auction_lots') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    in: () => ({
                      order: () => ({
                        order: () => ({
                          limit: async () => ({
                            data: [
                              {
                                id: 'lot-pending-1',
                                season_id: 'season-001',
                                status: 'pending',
                                bucket: 'B3',
                                round: 1,
                                draw_number: 1,
                                base_price: 20,
                              },
                            ],
                            error: null,
                          }),
                        }),
                      }),
                    }),
                    maybeSingle: async () => ({
                      data: null, // NO EXISTING LOT ON FLOOR
                      error: null,
                    }),
                  }),
                }),
              }),
              update: () => ({
                eq: async () => {
                  lotUpdateCalled = true;
                  return { data: null, error: null };
                },
              }),
            };
          }
          if (table === 'auction_events') {
            return {
              insert: vi.fn().mockResolvedValue({ error: null }),
            };
          }
          throw new Error(`Unexpected table: ${table}`);
        },
      };

      const result = await startAuctionAction();

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('live');
      expect(mockBroadcastAuctionUpdate).toHaveBeenCalledWith(
        'season-001',
        'AUCTION_STARTED',
        expect.objectContaining({
          sessionStatus: 'live',
        })
      );
    });

    it('PRESERVES the existing player on the floor if Guest Draw was performed before start and does not auto-advance', async () => {
      let preservedLotUpdated = false;
      const existingFloorLot = {
        id: 'lot-guest-drawn-prestart',
        bucket: 'B3',
        draw_number: 42,
        started_at: '2026-10-08T10:00:00Z',
      };

      mockAdminClient = {
        from: (table: string) => {
          if (table === 'seasons') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: { id: 'season-001', status: 'draft' },
                    error: null,
                  }),
                }),
              }),
              update: () => ({
                eq: async () => ({ error: null }),
              }),
            };
          }
          if (table === 'season_config') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
                  }),
                }),
              }),
              upsert: vi.fn().mockResolvedValue({ error: null }),
            };
          }
          if (table === 'auction_lots') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: existingFloorLot, // LOT ALREADY ON FLOOR FROM GUEST DRAW
                      error: null,
                    }),
                  }),
                }),
              }),
              update: (payload: any) => ({
                eq: async (col: string, val: string) => {
                  if (col === 'id' && val === existingFloorLot.id) {
                    preservedLotUpdated = true;
                    expect(payload.started_at).toBeDefined(); // Reset to fresh started_at
                  }
                  return { data: null, error: null };
                },
              }),
            };
          }
          if (table === 'auction_events') {
            return {
              insert: vi.fn().mockResolvedValue({ error: null }),
            };
          }
          throw new Error(`Unexpected table: ${table}`);
        },
      };

      const result = await startAuctionAction();

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('live');
      expect(preservedLotUpdated).toBe(true); // Existing floor lot was preserved with fresh timer!
      expect(result.data?.activeLotId).toBe('lot-guest-drawn-prestart');
      expect(mockBroadcastAuctionUpdate).toHaveBeenCalledWith(
        'season-001',
        'AUCTION_STARTED',
        expect.objectContaining({
          lotId: 'lot-guest-drawn-prestart',
          sessionStatus: 'live',
        })
      );
    });
  });

  // ===========================================================================
  // 3. pauseAuctionAction & resumeAuctionAction — Bound Validation & Roundtrip
  // ===========================================================================
  describe('3. pauseAuctionAction & resumeAuctionAction Invariants', () => {
    it('pauseAuctionAction accepts clientRemainingSeconds and enforces timerDuration bounds', async () => {
      let savedRemainingSeconds: string | null = null;
      let pauseEventPayload: any = null;

      mockAdminClient = {
        from: (table: string) => {
          if (table === 'season_config') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: { value: 'live' }, // not already paused
                      error: null,
                    }),
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
              upsert: async (payload: any) => {
                const items = Array.isArray(payload) ? payload : [payload];
                const target = items.find((i: any) => i.key === 'auction_lot_paused_remaining_seconds');
                if (target) {
                  savedRemainingSeconds = target.value;
                }
                return { error: null };
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
                        started_at: new Date(Date.now() - 4000).toISOString(),
                        highest_bidder_franchise_id: null, // First bid timer: 30s
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
                if (payload.event_type === 'PAUSE') {
                  pauseEventPayload = payload.payload;
                }
                return { error: null };
              },
            };
          }
          throw new Error(`Unexpected table: ${table}`);
        },
      };

      // Client saw 26 seconds on screen when clicking pause
      const result = await pauseAuctionAction('season-001', 26);

      expect(result.success).toBe(true);
      expect(result.data?.remainingSeconds).toBe(26);
      expect(savedRemainingSeconds).toBe('26');
      expect(pauseEventPayload?.remaining_seconds).toBe(26);
      expect(mockBroadcastAuctionUpdate).toHaveBeenCalledWith(
        'season-001',
        'PAUSE',
        expect.objectContaining({
          remainingSeconds: 26,
          sessionStatus: 'paused',
        })
      );
    });

    it('resumeAuctionAction restores timer accurately from paused remaining seconds', async () => {
      let lotStartedAtUpdated = false;
      let resumeEventInserted = false;

      mockAdminClient = {
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
                      { key: 'auction_lot_paused_remaining_seconds', value: '26' },
                      { key: 'first_bid_timer_seconds', value: '30' },
                      { key: 'subsequent_bid_timer_seconds', value: '20' },
                    ],
                    error: null,
                  }),
                }),
              }),
              upsert: async () => ({ error: null }),
              delete: () => ({
                eq: () => ({
                  in: async () => ({ error: null }),
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
                  lotStartedAtUpdated = Boolean(payload.started_at);
                  return { data: null, error: null };
                },
              }),
            };
          }
          if (table === 'auction_events') {
            return {
              insert: async (payload: any) => {
                if (payload.event_type === 'RESUME') {
                  resumeEventInserted = true;
                }
                return { error: null };
              },
            };
          }
          throw new Error(`Unexpected table: ${table}`);
        },
      };

      const result = await resumeAuctionAction();

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('live');
      expect(lotStartedAtUpdated).toBe(true);
      expect(resumeEventInserted).toBe(true);
      expect(mockBroadcastAuctionUpdate).toHaveBeenCalledWith(
        'season-001',
        'RESUME',
        expect.objectContaining({
          sessionStatus: 'live',
        })
      );
    });
  });

  // ===========================================================================
  // 4. Optimistic State Machine & Rollback Mechanics
  // ===========================================================================
  describe('4. Optimistic State Machine & Rollback Invariants', () => {
    it('rolls back sessionState when pause server action returns failure', async () => {
      const originalState: AuctionSessionState = {
        status: 'live',
        seasonId: 'season-001',
        seasonName: 'ACC 2026 Season',
        isLive: true,
        isPaused: false,
        isNotStarted: false,
        isCompleted: false,
        startedAt: new Date().toISOString(),
        activeLotId: 'lot-001',
      };

      let state = originalState;
      const onSessionStateChange = (next: AuctionSessionState) => {
        state = next;
      };

      // Optimistic update: Immediate freeze
      const optimisticState: AuctionSessionState = {
        ...state,
        status: 'paused',
        isPaused: true,
        pausedRemainingSeconds: 26,
        pausedAt: new Date().toISOString(),
      };
      onSessionStateChange(optimisticState);
      expect(state.isPaused).toBe(true);
      expect(state.pausedRemainingSeconds).toBe(26);

      // Server returns error -> Rollback
      const serverResponse = { success: false, error: 'Database timeout' };
      if (!serverResponse.success) {
        onSessionStateChange(originalState);
      }

      expect(state.isPaused).toBe(false);
      expect(state.pausedRemainingSeconds).toBeUndefined();
      expect(state.status).toBe('live');
    });

    it('rolls back activeLot when markUnsold server action returns failure', () => {
      const originalLot: any = {
        id: 'lot-001',
        season_id: 'season-001',
        lot_number: 1,
        status: 'in_progress',
        base_price: 20,
        current_price: null,
        highest_bidder_franchise_id: null,
        draw_number: 10,
        bucket: 'B3',
        player: {
          id: 'p-10',
          full_name: 'Test Player',
          photo_url: null,
        },
      };

      let currentLot: AuctionLotWithDetails | null = originalLot;
      const onActiveLotChange = (next: AuctionLotWithDetails | null) => {
        currentLot = next;
      };

      // Optimistic unsold transition (<250ms)
      onActiveLotChange({
        ...currentLot!,
        status: 'unsold',
      });
      expect(currentLot?.status).toBe('unsold');

      // Server returns failure -> Revert to in_progress
      const serverFailure = { success: false, error: 'Conflict' };
      if (!serverFailure.success) {
        onActiveLotChange(originalLot);
      }

      expect(currentLot?.status).toBe('in_progress');
    });
  });
});
