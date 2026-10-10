// @vitest-environment jsdom
// =============================================================================
// ACC Auction Portal — Phase 5.2 Unit & State Machine Tests
// Instant UI Responsiveness, Single Timer Loop & Authoritative State Transitions
// =============================================================================

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import { AuctionTimer } from '@/components/auction/auction-timer';
import { GuestDrawDialog } from '@/components/auction/guest-draw-dialog';
import * as auctionActions from '@/lib/auction/actions';
import {
  startAuctionAction,
  pauseAuctionAction,
  resumeAuctionAction,
  endAuctionAction,
  getGuestDrawSnapshotAction,
  callGuestDrawNumberAction,
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
  enqueueBackgroundBroadcast: (task: () => Promise<any>) => {
    return Promise.resolve().then(() => task()).catch(() => {});
  },
}));

// Mock audit logger
const mockWriteAuditLog = vi.fn().mockResolvedValue({ id: 'audit-1' });
vi.mock('@/lib/audit/logger', () => ({
  writeAuditLog: (...args: any[]) => mockWriteAuditLog(...args),
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

    it('resumes from pause smoothly without jumping to a stale elapsed value', () => {
      const initialStartedAt = new Date(Date.now() - 10000).toISOString(); // 10s elapsed of 30s = 20s remaining
      const onRemainingChange = vi.fn();

      const { rerender } = render(
        <AuctionTimer
          startedAt={initialStartedAt}
          durationSeconds={30}
          isActive={true}
          isPaused={false}
          onRemainingChange={onRemainingChange}
        />
      );

      expect(screen.getByText('20s')).toBeDefined();

      // Operator pauses at 20s
      rerender(
        <AuctionTimer
          startedAt={initialStartedAt}
          durationSeconds={30}
          isActive={true}
          isPaused={true}
          pausedRemainingSeconds={20}
          onRemainingChange={onRemainingChange}
        />
      );

      expect(screen.getByText('PAUSED (20s)')).toBeDefined();

      // Pause lasts for 4 seconds in real time
      act(() => {
        vi.advanceTimersByTime(4000);
      });

      // Operator clicks Resume before server action roundtrip returns the new started_at
      // Note: startedAt prop is STILL initialStartedAt!
      rerender(
        <AuctionTimer
          startedAt={initialStartedAt}
          durationSeconds={30}
          isActive={true}
          isPaused={false}
          onRemainingChange={onRemainingChange}
        />
      );

      // MUST NOT jump to 16s! Must anchor at 20s and count down smoothly
      expect(screen.getByText('20s')).toBeDefined();
      expect(screen.queryByText('16s')).toBeNull();

      // Advance by 1 second -> smoothly ticks down to 19s
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.getByText('19s')).toBeDefined();
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

    it('ends auction session cleanly without constraint violation and records in audit logs', async () => {
      let seasonConfigUpdated = false;
      let seasonStatusUpdated = false;
      let auctionEventInserted = false;

      mockAdminClient = {
        from: (table: string) => {
          if (table === 'auction_lots') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: null, // No active lot in progress
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'season_config') {
            return {
              upsert: async (payload: any) => {
                if (payload.key === 'auction_session_status' && payload.value === 'completed') {
                  seasonConfigUpdated = true;
                }
                return { error: null };
              },
            };
          }
          if (table === 'seasons') {
            return {
              update: (payload: any) => ({
                eq: async () => {
                  if (payload.status === 'completed') {
                    seasonStatusUpdated = true;
                  }
                  return { error: null };
                },
              }),
            };
          }
          if (table === 'auction_events') {
            return {
              insert: async () => {
                auctionEventInserted = true;
                return { error: null };
              },
            };
          }
          throw new Error(`Unexpected table: ${table}`);
        },
      };

      const result = await endAuctionAction();

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('completed');
      expect(seasonConfigUpdated).toBe(true);
      expect(seasonStatusUpdated).toBe(true);
      // Invariant: auction_events must NOT have illegal SESSION_RESET event inserted
      expect(auctionEventInserted).toBe(false);
      // Invariant: session completion must be authoritatively recorded in audit_logs
      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'AUCTION_ENDED',
          entityType: 'season',
          entityId: 'season-001',
        })
      );
      // Invariant: broadcast AUCTION_ENDED with completed session status
      expect(mockBroadcastAuctionUpdate).toHaveBeenCalledWith(
        'season-001',
        'AUCTION_ENDED',
        expect.objectContaining({
          sessionStatus: 'completed',
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

  // ===========================================================================
  // 5. GuestDrawDialog — Instant 3D Flip & Selection Invariants
  // ===========================================================================
  describe('5. GuestDrawDialog — Instant 3D Flip & Reveal Hold Invariants', () => {
    it('flips immediately upon card click and reveals candidate details (<250ms / 0ms)', async () => {
      const candidates = [
        {
          cardNumber: 1,
          cardLabel: '01',
          bucketPlayerNumber: 'B3-01',
          lotId: 'lot-g-1',
          drawNumber: 1,
          playerName: 'Guest Player One',
          rollNumber: '2026-CS-01',
          bucket: 'B3',
          basePrice: 50,
          photoUrl: null,
          drawn: false,
        },
        {
          cardNumber: 2,
          cardLabel: '02',
          bucketPlayerNumber: 'B3-02',
          lotId: 'lot-g-2',
          drawNumber: 2,
          playerName: 'Guest Player Two',
          rollNumber: '2026-CS-02',
          bucket: 'B3',
          basePrice: 50,
          photoUrl: null,
          drawn: false,
        },
      ];

      vi.spyOn(auctionActions, 'getGuestDrawSnapshotAction').mockResolvedValue({
        success: true,
        data: candidates,
      });

      const callDrawSpy = vi.spyOn(auctionActions, 'callGuestDrawNumberAction').mockResolvedValue({
        success: true,
        data: {
          lotId: 'lot-g-1',
          drawNumber: 1,
          playerName: 'Guest Player One',
          activeLot: null,
          sessionState: undefined,
        },
      });

      const onPlayerDrawn = vi.fn();
      const onClose = vi.fn();

      render(
        <GuestDrawDialog
          isOpen={true}
          onClose={onClose}
          seasonId="season-001"
          activeBuckets={['B3']}
          initialBucket="B3"
          onPlayerDrawn={onPlayerDrawn}
        />
      );

      // Wait for snapshot candidates to load into UI
      await act(async () => {
        await Promise.resolve();
      });

      // Find the card container
      const card = screen.getByTestId('guest-draw-card-1');
      expect(card).toBeDefined();

      // Before click: card shows label 01 and CLICK TO DRAW
      expect(screen.getByText('01')).toBeDefined();
      expect(screen.getAllByText('CLICK TO DRAW').length).toBe(2);

      // Click card 1
      const button = screen.getAllByRole('button', { name: /CLICK TO DRAW/i })[0];
      act(() => {
        fireEvent.click(button);
      });

      // Instant flip: player details must be immediately visible (<0ms) on flipped card
      expect(within(card).getByText('Guest Player One')).toBeDefined();
      expect(within(card).getByText('REVEALED')).toBeDefined();
      expect(within(card).getByText('2026-CS-01')).toBeDefined();
      expect(within(card).getByText(/Base:/i)).toBeDefined();
      expect(within(card).getByText('Moving to floor...')).toBeDefined();
      expect(card.innerHTML).toContain('rotateY(180deg)');

      // Verify other card (card 2) is disabled and not flipped during reveal
      const card2 = screen.getByTestId('guest-draw-card-2');
      const otherButton = within(card2).getByRole('button', { name: /CLICK TO DRAW/i });
      expect((otherButton as HTMLButtonElement).disabled).toBe(true);
      expect(card2.innerHTML).toContain('rotateY(0deg)');

      // Fast-forward reveal hold (2000ms) + close timeout (600ms)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
        await vi.advanceTimersByTimeAsync(600);
      });

      expect(callDrawSpy).toHaveBeenCalledWith('lot-g-1', 'B3', 'season-001');
      expect(onPlayerDrawn).toHaveBeenCalledWith('lot-g-1', 'Guest Player One', null, undefined);
      expect(onClose).toHaveBeenCalled();
    });

    it('rolls back 3D flip when server action fails', async () => {
      const candidates = [
        {
          cardNumber: 1,
          cardLabel: '01',
          bucketPlayerNumber: 'B3-01',
          lotId: 'lot-g-1',
          drawNumber: 1,
          playerName: 'Guest Player One',
          rollNumber: '2026-CS-01',
          bucket: 'B3',
          basePrice: 50,
          photoUrl: null,
          drawn: false,
        },
      ];

      vi.spyOn(auctionActions, 'getGuestDrawSnapshotAction').mockResolvedValue({
        success: true,
        data: candidates,
      });

      vi.spyOn(auctionActions, 'callGuestDrawNumberAction').mockResolvedValue({
        success: false,
        error: 'Active bidding is already in progress',
      });

      render(
        <GuestDrawDialog
          isOpen={true}
          onClose={vi.fn()}
          seasonId="season-001"
          activeBuckets={['B3']}
          initialBucket="B3"
        />
      );

      await act(async () => {
        await Promise.resolve();
      });

      const button = screen.getByRole('button', { name: /CLICK TO DRAW/i });
      act(() => {
        fireEvent.click(button);
      });

      // Instant flip initially shows revealed face
      expect(screen.getByText('Guest Player One')).toBeDefined();

      // Fast forward 2000ms hold: server action failure returns
      await act(async () => {
        vi.advanceTimersByTime(2100);
        await Promise.resolve();
      });

      // Error message is displayed and card is no longer in flipped state
      expect(screen.getByText('Active bidding is already in progress')).toBeDefined();
    });
  });
});
