// @vitest-environment jsdom
// =============================================================================
// ACC Auction Portal — Broadcast, Stale Bid UX & Realtime Sync Tests
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, fireEvent, act, cleanup, waitFor } from '@testing-library/react';
import {
  AuctionRealtimeSync,
  createRealtimeRefreshCoordinator,
  resetLocalActionTrackingForTests,
} from '@/components/auction/auction-realtime-sync';
import { BiddingControl } from '@/components/auction/bidding-control';
import { LiveAuctionBanner } from '@/components/auction/live-auction-banner';
import type { AuctionLotWithDetails } from '@/lib/auction/types';

// =============================================================================
// Mocks
// =============================================================================

const mockRouterRefresh = vi.fn();
const mockRouterPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: mockRouterRefresh,
    push: mockRouterPush,
  }),
}));

const mockPlaceBidAction = vi.fn();

vi.mock('@/lib/auction/actions', () => ({
  startAuctionAction: vi.fn(),
  startAuctionAgainAction: vi.fn(),
  pauseAuctionAction: vi.fn(),
  resumeAuctionAction: vi.fn(),
  endAuctionAction: vi.fn(),
  selectLotAction: vi.fn(),
  confirmSaleAction: vi.fn(),
  markUnsoldAction: vi.fn(),
  skipLotAction: vi.fn(),
  recallSkippedLotAction: vi.fn(),
  undoSaleAction: vi.fn(),
  adminProxyBidAction: vi.fn(),
  adminStartRoundTwoAction: vi.fn(),
  adminAutoAllotLotAction: vi.fn(),
  adminRelaxBucketMinimumAction: vi.fn(),
  bringDownUnsoldLotAction: vi.fn(),
  reAuctionUnsoldLotAction: vi.fn(),
  adminAuctionRestartRecoveryAction: vi.fn(),
  placeBidAction: (...args: any[]) => mockPlaceBidAction(...args),
}));

// Mock Supabase browser client
let capturedChannelCallbacks: Array<{ type: string; filter?: any; handler: (payload?: any) => void }> = [];
let capturedSubscribeCallback: ((status: string) => void) | null = null;
const mockRemoveChannel = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    channel: () => {
      const ch = {
        on: (type: string, filter: any, handler: (payload?: any) => void) => {
          capturedChannelCallbacks.push({ type, filter, handler });
          return ch;
        },
        subscribe: (cb?: (status: string) => void) => {
          if (cb) {
            capturedSubscribeCallback = cb;
          }
          return ch;
        },
      };
      return ch;
    },
    removeChannel: mockRemoveChannel,
  }),
}));

function makeSampleLot(overrides: Partial<AuctionLotWithDetails> = {}): AuctionLotWithDetails {
  return {
    id: '11111111-2222-3333-4444-555555555555',
    season_id: 'season-001',
    registration_id: 'reg-001',
    bucket: 'B1',
    round: 1,
    draw_number: 7,
    base_price: 20,
    current_price: null,
    highest_bidder_franchise_id: null,
    status: 'in_progress',
    started_at: '2026-09-27T09:00:00.000Z',
    ended_at: null,
    created_at: '2026-09-27T08:00:00.000Z',
    updated_at: '2026-09-27T09:00:00.000Z',
    player: {
      id: 'player-001',
      full_name: 'Virat Kohli',
      photo_url: null,
    },
    franchise: null,
    lot_number: '7',
    ...overrides,
  } as AuctionLotWithDetails;
}

const sampleFranchise = {
  id: 'franchise-001',
  name: 'Mumbai Indians',
  shortName: 'MI',
  remainingPurse: 500,
  squadCount: 10,
  maxSquadSize: 22,
  maxPermissibleBid: 200,
};

beforeEach(() => {
  vi.clearAllMocks();
  capturedChannelCallbacks = [];
  capturedSubscribeCallback = null;
  resetLocalActionTrackingForTests();
});

afterEach(() => {
  cleanup();
});

// =============================================================================
// §1 — AuctionRealtimeSync uses ONLY broadcast (no postgres_changes)
// =============================================================================
describe('AuctionRealtimeSync — Broadcast-only subscription', () => {
  it('subscribes only to broadcast event, no postgres_changes listeners', () => {
    render(<AuctionRealtimeSync seasonId="season-001" />);

    // Should have exactly ONE callback: broadcast
    const broadcastCbs = capturedChannelCallbacks.filter(
      (cb) => cb.type === 'broadcast'
    );
    const pgCbs = capturedChannelCallbacks.filter(
      (cb) => cb.type === 'postgres_changes'
    );

    expect(broadcastCbs.length).toBe(1);
    expect(pgCbs.length).toBe(0);
    expect(broadcastCbs[0].filter).toEqual({ event: 'auction_update' });
  });

  it('triggers router.refresh() when broadcast event received', () => {
    vi.useFakeTimers();

    render(<AuctionRealtimeSync seasonId="season-001" />);

    // Simulate SUBSCRIBED status
    if (capturedSubscribeCallback) {
      capturedSubscribeCallback('SUBSCRIBED');
    }

    // Fire broadcast event
    const broadcastCb = capturedChannelCallbacks.find(
      (cb) => cb.type === 'broadcast'
    );
    expect(broadcastCb).toBeDefined();

    act(() => {
      broadcastCb!.handler();
    });

    // Advance past 80ms coalesce window
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(mockRouterRefresh).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('does NOT poll when channel is SUBSCRIBED (heartbeat suppressed)', () => {
    vi.useFakeTimers();

    render(<AuctionRealtimeSync seasonId="season-001" fallbackIntervalMs={1000} />);

    // Simulate SUBSCRIBED
    if (capturedSubscribeCallback) {
      capturedSubscribeCallback('SUBSCRIBED');
    }

    // Advance past several heartbeat intervals (5 seconds)
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // No refresh should have been triggered since channel is healthy
    expect(mockRouterRefresh).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('heartbeat triggers refresh when channel status is CHANNEL_ERROR', () => {
    vi.useFakeTimers();

    render(<AuctionRealtimeSync seasonId="season-001" fallbackIntervalMs={1000} />);

    // Simulate CHANNEL_ERROR
    if (capturedSubscribeCallback) {
      capturedSubscribeCallback('CHANNEL_ERROR');
    }

    // Advance past heartbeat + coalesce (1000 + 80)
    act(() => {
      vi.advanceTimersByTime(1100);
    });

    expect(mockRouterRefresh).toHaveBeenCalled();

    vi.useRealTimers();
  });
});

// =============================================================================
// §2 — LiveAuctionBanner uses broadcast (not postgres_changes)
// =============================================================================
describe('LiveAuctionBanner — Broadcast subscription', () => {
  it('subscribes to broadcast event on acc-auction-{seasonId} channel', () => {
    render(
      <LiveAuctionBanner
        initialIsLive={true}
        seasonId="season-001"
        role="franchise"
      />
    );

    const broadcastCbs = capturedChannelCallbacks.filter(
      (cb) => cb.type === 'broadcast'
    );
    const pgCbs = capturedChannelCallbacks.filter(
      (cb) => cb.type === 'postgres_changes'
    );

    expect(broadcastCbs.length).toBe(1);
    expect(pgCbs.length).toBe(0);
    expect(broadcastCbs[0].filter).toEqual({ event: 'auction_update' });
  });
});

// =============================================================================
// §3 — Stale Bid UX: friendly message, auto-refresh, optimistic state cleared
// =============================================================================
describe('BiddingControl — Stale bid UX', () => {
  it('shows friendly message and auto-refreshes on STALE_BID_PRICE error', async () => {
    mockPlaceBidAction.mockResolvedValue({
      success: false,
      error: 'Bid rejected: STALE_BID_PRICE — concurrent bid won.',
    });

    const lot = makeSampleLot({ current_price: 30, base_price: 20 });
    const { getByText, findByText } = render(
      <BiddingControl lot={lot} franchise={sampleFranchise} />
    );

    const bidButton = getByText(/Place Bid/);
    await act(async () => {
      fireEvent.click(bidButton);
    });

    // Should show friendly message, NOT the raw error
    const friendlyMsg = await findByText(
      'Another franchise placed a bid first. The auction has been updated.'
    );
    expect(friendlyMsg).toBeTruthy();

    // Should trigger router.refresh()
    expect(mockRouterRefresh).toHaveBeenCalled();
  });

  it('shows friendly message on "no longer in progress" error', async () => {
    mockPlaceBidAction.mockResolvedValue({
      success: false,
      error: 'Lot is no longer in progress.',
    });

    const lot = makeSampleLot({ current_price: 30, base_price: 20 });
    const { getByText, findByText } = render(
      <BiddingControl lot={lot} franchise={sampleFranchise} />
    );

    await act(async () => {
      fireEvent.click(getByText(/Place Bid/));
    });

    const friendlyMsg = await findByText(
      'Another franchise placed a bid first. The auction has been updated.'
    );
    expect(friendlyMsg).toBeTruthy();
    expect(mockRouterRefresh).toHaveBeenCalled();
  });

  it('shows original error message for non-stale errors', async () => {
    mockPlaceBidAction.mockResolvedValue({
      success: false,
      error: 'Cannot place bid: auction session is currently paused.',
    });

    const lot = makeSampleLot({ current_price: 30, base_price: 20 });
    const { getByText, findByText } = render(
      <BiddingControl lot={lot} franchise={sampleFranchise} />
    );

    await act(async () => {
      fireEvent.click(getByText(/Place Bid/));
    });

    // Should show the original error
    const errorMsg = await findByText(
      'Cannot place bid: auction session is currently paused.'
    );
    expect(errorMsg).toBeTruthy();

    // Should NOT trigger auto router.refresh() for non-stale errors
    expect(mockRouterRefresh).not.toHaveBeenCalled();
  });
});

// =============================================================================
// §4 — Broadcast helper resilience (unit test for broadcastAuctionUpdate)
// =============================================================================
describe('broadcastAuctionUpdate — Failure resilience', () => {
  it('module exports broadcastAuctionUpdate function', async () => {
    // Dynamically import to verify the module structure
    const mod = await import('@/lib/auction/realtime');
    expect(typeof mod.broadcastAuctionUpdate).toBe('function');
  });
});

// =============================================================================
// §5 — Coordinator burst coalescing still works with broadcast-only
// =============================================================================
describe('Coordinator — Burst coalescing with broadcast events', () => {
  it('coalesces multiple rapid broadcast events into a single refresh', () => {
    vi.useFakeTimers();

    const onRefresh = vi.fn();
    const coordinator = createRealtimeRefreshCoordinator({
      onRefresh,
      coalesceMs: 80,
      inFlightWindowMs: 300,
    });

    // Simulate 5 rapid broadcast events (like multi-table auction mutation)
    coordinator.handleRealtimeEvent();
    vi.advanceTimersByTime(20);
    coordinator.handleRealtimeEvent();
    vi.advanceTimersByTime(20);
    coordinator.handleRealtimeEvent();
    vi.advanceTimersByTime(20);
    coordinator.handleRealtimeEvent();
    vi.advanceTimersByTime(20);
    coordinator.handleRealtimeEvent();

    // At this point no refresh should have happened yet (still within coalesce window)
    expect(onRefresh).not.toHaveBeenCalled();

    // Advance past the 80ms coalesce window from the last event
    vi.advanceTimersByTime(80);

    // Should fire exactly once
    expect(onRefresh).toHaveBeenCalledTimes(1);

    coordinator.dispose();
    vi.useRealTimers();
  });
});
