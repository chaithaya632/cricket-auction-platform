// @vitest-environment jsdom
// =============================================================================
// ACC Auction Portal — Hydration (#418), Server Action Refresh & Realtime Sync Tests
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { render, fireEvent, act, cleanup } from '@testing-library/react';
import {
  RecentActivityStream,
  formatActivityTimestampIST,
} from '@/components/auction/recent-activity-stream';
import {
  AuctionTimer,
  getDeterministicInitialRemaining,
} from '@/components/auction/auction-timer';
import {
  AuctionRealtimeSync,
  createRealtimeRefreshCoordinator,
  runWithLocalActionTracking,
  resetLocalActionTrackingForTests,
} from '@/components/auction/auction-realtime-sync';
import { OperatorControls } from '@/components/auction/operator-controls';
import { BiddingControl } from '@/components/auction/bidding-control';
import { LiveAuctionBanner } from '@/components/auction/live-auction-banner';
import type {
  AuctionEventDTO,
  AuctionLotWithDetails,
  AuctionSessionState,
} from '@/lib/auction/types';

const mockRouterRefresh = vi.fn();
const mockRouterPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: mockRouterRefresh,
    push: mockRouterPush,
  }),
}));

const mockStartAuctionAction = vi.fn();
const mockPauseAuctionAction = vi.fn();
const mockResumeAuctionAction = vi.fn();
const mockSelectLotAction = vi.fn();
const mockConfirmSaleAction = vi.fn();
const mockMarkUnsoldAction = vi.fn();
const mockPlaceBidAction = vi.fn();

vi.mock('@/lib/auction/actions', () => ({
  startAuctionAction: (...args: any[]) => mockStartAuctionAction(...args),
  startAuctionAgainAction: vi.fn(),
  pauseAuctionAction: (...args: any[]) => mockPauseAuctionAction(...args),
  resumeAuctionAction: (...args: any[]) => mockResumeAuctionAction(...args),
  endAuctionAction: vi.fn(),
  selectLotAction: (...args: any[]) => mockSelectLotAction(...args),
  confirmSaleAction: (...args: any[]) => mockConfirmSaleAction(...args),
  markUnsoldAction: (...args: any[]) => mockMarkUnsoldAction(...args),
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

// Mock Supabase browser client for AuctionRealtimeSync & LiveAuctionBanner
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
    registration: {
      id: 'reg-001',
      programme: 'btech',
      academic_year: 3,
      branch: 'CSE',
      cricheroes_profile_url: null,
    },
    highest_bidder: null,
    ...overrides,
  };
}

function makeSampleSessionState(overrides: Partial<AuctionSessionState> = {}): AuctionSessionState {
  return {
    status: 'live',
    seasonId: 'season-001',
    seasonName: 'ACC 2026',
    isLive: true,
    isPaused: false,
    isNotStarted: false,
    isCompleted: false,
    startedAt: '2026-09-27T09:00:00.000Z',
    activeLotId: '11111111-2222-3333-4444-555555555555',
    pausedRemainingSeconds: null,
    pausedAt: null,
    ...overrides,
  };
}

describe('1. Hydration Determinism & Zero React Error #418', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-27T09:00:05.000Z'));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('produces deterministic IST timestamps in RecentActivityStream regardless of server/client timezone', () => {
    expect(formatActivityTimestampIST('2026-09-27T09:15:08.000Z')).toBe('02:45:08 PM');
    expect(formatActivityTimestampIST('2026-09-26T18:30:00.000Z')).toBe('12:00:00 AM');
    expect(formatActivityTimestampIST('2026-09-27T06:29:59.000Z')).toBe('11:59:59 AM');
    expect(formatActivityTimestampIST('invalid-date')).toBe('--:--:--');

    const events: AuctionEventDTO[] = [
      {
        id: 'evt-1',
        season_id: 'season-001',
        auction_lot_id: 'lot-1',
        actor_user_id: 'user-1',
        franchise_id: 'f-1',
        payload: null,
        sequence_number: 12,
        event_type: 'BID_PLACED',
        franchise: {
          id: 'f-1',
          name: 'Mumbai Mavericks',
          short_name: 'MM',
          primary_color: '#10b981',
          secondary_color: '#064e3b',
        },
        price: 50,
        reason: 'Valid floor bid',
        created_at: '2026-09-27T09:15:08.000Z',
      },
    ];

    const ssrHtml = renderToString(<RecentActivityStream events={events} />);
    expect(ssrHtml).toContain('02:45:08 PM');

    // Hydrate on client after advancing clock by 45 seconds
    vi.advanceTimersByTime(45_000);
    const container = document.createElement('div');
    container.innerHTML = ssrHtml;
    document.body.appendChild(container);

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let root: ReturnType<typeof hydrateRoot> | null = null;
    act(() => {
      root = hydrateRoot(container, <RecentActivityStream events={events} />);
    });

    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(container.textContent).toContain('02:45:08 PM');

    act(() => {
      root?.unmount();
    });
    document.body.removeChild(container);
    consoleErrorSpy.mockRestore();
  });

  it('renders deterministic initial AuctionTimer markup on SSR and client hydration, then ticks only after mount', () => {
    const startedAt = new Date('2026-09-27T09:00:00.000Z').toISOString();

    // At T = 09:00:00Z on SSR
    vi.setSystemTime(new Date('2026-09-27T09:00:00.000Z'));
    const ssrHtml = renderToString(
      <AuctionTimer
        startedAt={startedAt}
        durationSeconds={30}
        isActive={true}
        isPaused={false}
      />
    );
    // Initial SSR render uses deterministic durationSeconds (30s)
    expect(ssrHtml).toContain('30s');
    expect(getDeterministicInitialRemaining({ durationSeconds: 30, isPaused: false })).toBe(30);

    // Advance clock by 7 seconds to simulate network + hydration delay (T = 09:00:07Z -> 23s remaining)
    vi.setSystemTime(new Date('2026-09-27T09:00:07.000Z'));

    const container = document.createElement('div');
    container.innerHTML = ssrHtml;
    document.body.appendChild(container);

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let root: ReturnType<typeof hydrateRoot> | null = null;

    // Hydrate: initial render matches SSR (30s), then post-mount useEffect immediately updates to 23s
    act(() => {
      root = hydrateRoot(
        container,
        <AuctionTimer
          startedAt={startedAt}
          durationSeconds={30}
          isActive={true}
          isPaused={false}
        />
      );
    });

    // Zero hydration mismatch errors (#418)
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    // Immediately after mount effect, timer displays exact live remaining seconds (23s)
    expect(container.textContent).toContain('23s');

    // Advance 3 seconds -> ticks down to 20s
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(container.textContent).toContain('20s');

    act(() => {
      root?.unmount();
    });
    document.body.removeChild(container);
    consoleErrorSpy.mockRestore();
  });

  it('keeps paused AuctionTimer frozen across 15+ seconds and resumes from the exact frozen seconds', () => {
    const startedAt = new Date('2026-09-27T09:00:00.000Z').toISOString();
    vi.setSystemTime(new Date('2026-09-27T09:00:12.000Z')); // 18s left when paused

    const { container, rerender } = render(
      <AuctionTimer
        startedAt={startedAt}
        durationSeconds={30}
        isActive={false}
        isPaused={true}
        pausedRemainingSeconds={18}
      />
    );

    expect(container.textContent).toContain('PAUSED (18s)');

    // Advance 15 seconds while paused -> remains strictly frozen at 18s
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(container.textContent).toContain('PAUSED (18s)');

    // Resume at T = 09:00:27Z: server synthesizes new startedAt = now - (30 - 18)s = 09:00:15Z
    const nowMs = Date.now();
    const resumedStartedAt = new Date(nowMs - (30 - 18) * 1000).toISOString();

    rerender(
      <AuctionTimer
        startedAt={resumedStartedAt}
        durationSeconds={30}
        isActive={true}
        isPaused={false}
        pausedRemainingSeconds={null}
      />
    );

    // Immediately continues from exact frozen 18s
    expect(container.textContent).toContain('18s');
    expect(container.textContent).not.toContain('PAUSED');

    // Advance 2 seconds -> ticks down to 16s
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(container.textContent).toContain('16s');
  });

  it('hydrates LiveAuctionBanner deterministically without Math.random mismatches', () => {
    const ssrHtml = renderToString(
      <LiveAuctionBanner initialIsLive={true} seasonId="season-001" role="franchise" />
    );
    const container = document.createElement('div');
    container.innerHTML = ssrHtml;
    document.body.appendChild(container);

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let root: ReturnType<typeof hydrateRoot> | null = null;
    act(() => {
      root = hydrateRoot(
        container,
        <LiveAuctionBanner initialIsLive={true} seasonId="season-001" role="franchise" />
      );
    });

    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(container.textContent).toContain('AUCTION IS LIVE');

    act(() => {
      root?.unmount();
    });
    document.body.removeChild(container);
    consoleErrorSpy.mockRestore();
  });
});

describe('2. Realtime Sync Coalescing, Healthy No-Poll & Degraded Fallback Recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetLocalActionTrackingForTests();
    mockRouterRefresh.mockClear();
    capturedChannelCallbacks = [];
    capturedSubscribeCallback = null;
  });

  afterEach(() => {
    cleanup();
    resetLocalActionTrackingForTests();
    vi.useRealTimers();
  });

  it('coalesces multi-table Realtime burst (auction_lots + auction_events + season_config) into exactly ONE refresh', () => {
    const onRefresh = vi.fn();
    const coordinator = createRealtimeRefreshCoordinator({
      onRefresh,
      coalesceMs: 80,
      inFlightWindowMs: 300,
    });

    coordinator.setChannelStatus('SUBSCRIBED');

    // Simulate multi-table burst arriving within 25ms
    coordinator.handleRealtimeEvent(); // auction_lots UPDATE at t=0
    vi.advanceTimersByTime(10);
    coordinator.handleRealtimeEvent(); // auction_events INSERT at t=10ms
    vi.advanceTimersByTime(15);
    coordinator.handleRealtimeEvent(); // season_config UPSERT at t=25ms

    // Before 80ms coalescing window completes, refresh has not fired yet
    expect(onRefresh).toHaveBeenCalledTimes(0);

    // Advance past coalescing window
    vi.advanceTimersByTime(85);
    expect(onRefresh).toHaveBeenCalledTimes(1);

    coordinator.dispose();
  });

  it('does NOT trigger unconditional rapid polling when Realtime channel is healthy (SUBSCRIBED)', () => {
    render(<AuctionRealtimeSync seasonId="season-001" fallbackIntervalMs={1500} />);

    // Mark Realtime channel as healthy
    expect(capturedSubscribeCallback).not.toBeNull();
    act(() => {
      capturedSubscribeCallback?.('SUBSCRIBED');
    });

    // Advance 15 seconds (10 heartbeat intervals) with healthy Realtime and no DB changes
    act(() => {
      vi.advanceTimersByTime(15_000);
    });

    // Zero unconditional polling refreshes while SUBSCRIBED
    expect(mockRouterRefresh).toHaveBeenCalledTimes(0);
  });

  it('triggers fallback recovery refresh when Realtime channel is degraded (CHANNEL_ERROR / TIMED_OUT / CLOSED)', () => {
    render(<AuctionRealtimeSync seasonId="season-001" fallbackIntervalMs={2000} />);

    act(() => {
      capturedSubscribeCallback?.('CHANNEL_ERROR');
    });

    act(() => {
      vi.advanceTimersByTime(2100);
    });

    expect(mockRouterRefresh).toHaveBeenCalledTimes(1);

    // Once channel recovers to SUBSCRIBED, fallback polling stops automatically
    act(() => {
      capturedSubscribeCallback?.('SUBSCRIBED');
      vi.advanceTimersByTime(10_000);
    });

    expect(mockRouterRefresh).toHaveBeenCalledTimes(1);
  });

  it('prevents overlapping router.refresh() calls while an RSC refresh is already in flight', () => {
    const onRefresh = vi.fn();
    const coordinator = createRealtimeRefreshCoordinator({
      onRefresh,
      coalesceMs: 50,
      inFlightWindowMs: 300,
    });
    coordinator.setChannelStatus('SUBSCRIBED');

    // First burst triggers refresh #1 at t=50ms
    coordinator.handleRealtimeEvent();
    vi.advanceTimersByTime(50);
    expect(onRefresh).toHaveBeenCalledTimes(1);

    // Another burst arrives at t=70ms while refresh #1 is still within its 300ms in-flight window
    vi.advanceTimersByTime(20);
    coordinator.handleRealtimeEvent();
    vi.advanceTimersByTime(50);

    // Still 1 call during in-flight window (no overlapping refresh replacing pending RSC state)
    expect(onRefresh).toHaveBeenCalledTimes(1);

    // Once the 300ms in-flight window finishes, the queued refresh executes cleanly
    vi.advanceTimersByTime(250);
    expect(onRefresh).toHaveBeenCalledTimes(2);

    coordinator.dispose();
  });
});

describe('3. Initiating Browser vs Other Browsers — Admin, Player Queue, Franchise & Public /live Flows', () => {
  beforeEach(() => {
    resetLocalActionTrackingForTests();
    mockRouterRefresh.mockClear();
    mockStartAuctionAction.mockReset();
    mockPauseAuctionAction.mockReset();
    mockResumeAuctionAction.mockReset();
    mockSelectLotAction.mockReset();
    mockConfirmSaleAction.mockReset();
    mockMarkUnsoldAction.mockReset();
    mockPlaceBidAction.mockReset();
    capturedChannelCallbacks = [];
    capturedSubscribeCallback = null;
  });

  afterEach(() => {
    cleanup();
    resetLocalActionTrackingForTests();
  });

  it('Admin Start / Pause / Resume / Bring to Floor updates cleanly via authoritative sessionState without redundant router.refresh() or stuck loading state', async () => {
    mockStartAuctionAction.mockResolvedValue({ success: true });
    mockPauseAuctionAction.mockResolvedValue({
      success: true,
      data: { status: 'paused', remainingSeconds: 22 },
    });
    mockResumeAuctionAction.mockResolvedValue({
      success: true,
      data: { status: 'live' },
    });
    mockSelectLotAction.mockResolvedValue({
      success: true,
      data: { lotId: 'lot-upcoming-1' },
    });

    const upcomingLot = makeSampleLot({
      id: 'lot-upcoming-1',
      status: 'pending',
      draw_number: 8,
    });

    const notStartedSession = makeSampleSessionState({
      status: 'not_started',
      isLive: false,
      isPaused: false,
      isNotStarted: true,
    });

    const liveSession = makeSampleSessionState({
      status: 'live',
      isLive: true,
      isPaused: false,
      isNotStarted: false,
    });

    const pausedSession = makeSampleSessionState({
      status: 'paused',
      isLive: false,
      isPaused: true,
      isNotStarted: false,
      pausedRemainingSeconds: 22,
    });

    const { getByText, queryByText, rerender } = render(
      <OperatorControls
        activeLot={null}
        upcomingLots={[upcomingLot]}
        sessionState={notStartedSession}
      />
    );

    // 1. Admin clicks START AUCTION -> opens start mode dialog -> selects START FROM BUCKETS -> commits
    const startBtn = getByText('START AUCTION').closest('button')!;
    await act(async () => {
      fireEvent.click(startBtn);
    });

    const startFromBucketsBtn = queryByText('START FROM BUCKETS')?.closest('button');
    if (startFromBucketsBtn) {
      await act(async () => {
        fireEvent.click(startFromBucketsBtn);
      });
    }

    expect(mockStartAuctionAction).toHaveBeenCalledTimes(1);
    expect(mockRouterRefresh).toHaveBeenCalledTimes(0);
    expect(queryByText('STARTING AUCTION...')).toBeNull();

    rerender(
      <OperatorControls
        activeLot={null}
        upcomingLots={[upcomingLot]}
        sessionState={liveSession}
      />
    );
    expect(getByText('AUCTION SESSION ACTIVE')).toBeTruthy();
    expect(getByText('PAUSE AUCTION')).toBeTruthy();

    // 2. Admin clicks PAUSE AUCTION
    const pauseBtn = getByText('PAUSE AUCTION').closest('button')!;
    await act(async () => {
      fireEvent.click(pauseBtn);
    });

    expect(mockPauseAuctionAction).toHaveBeenCalledTimes(1);
    expect(mockRouterRefresh).toHaveBeenCalledTimes(0);

    // D. Authoritative OperatorControls: before server sessionState prop updates to isPaused=true,
    // OperatorControls does NOT optimistically flip to RESUME AUCTION on its own (no contradictory localSessionState)
    expect(getByText('PAUSE AUCTION')).toBeTruthy();

    // Server Action revalidatePath delivers pausedSession prop -> renders RESUME AUCTION
    rerender(
      <OperatorControls
        activeLot={null}
        upcomingLots={[upcomingLot]}
        sessionState={pausedSession}
      />
    );
    expect(getByText('AUCTION SESSION PAUSED')).toBeTruthy();
    expect(getByText('RESUME AUCTION')).toBeTruthy();

    // 3. Admin clicks RESUME AUCTION -> Server Action revalidatePath delivers liveSession prop
    const resumeBtn = getByText('RESUME AUCTION').closest('button')!;
    await act(async () => {
      fireEvent.click(resumeBtn);
    });

    expect(mockResumeAuctionAction).toHaveBeenCalledTimes(1);
    expect(mockRouterRefresh).toHaveBeenCalledTimes(0);

    rerender(
      <OperatorControls
        activeLot={null}
        upcomingLots={[upcomingLot]}
        sessionState={liveSession}
      />
    );
    expect(getByText('AUCTION SESSION ACTIVE')).toBeTruthy();
    expect(getByText('PAUSE AUCTION')).toBeTruthy();

    // 4. Verify upcoming player is visible in read-only list (no Bring to Floor button)
    expect(getByText('Virat Kohli')).toBeTruthy();
    // Phase 5.2: "Bring to Floor" button was intentionally removed from the upcoming list
    expect(queryByText('Bring to Floor')).toBeNull();
  });

  it('Admin Operator Controls: clicking RESUME AUCTION optimistically unpauses session state immediately and reconciles when server confirms', async () => {
    let resolveResume!: (val: any) => void;
    mockResumeAuctionAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveResume = resolve;
        })
    );

    const onSessionStateChange = vi.fn();
    const onActiveLotChange = vi.fn();

    const pausedSession: AuctionSessionState = {
      status: 'paused',
      seasonId: 'season-001',
      seasonName: 'ACC Season 2026',
      isLive: true,
      isPaused: true,
      isNotStarted: false,
      isCompleted: false,
      startedAt: null,
      activeLotId: 'lot-active-1',
      pausedRemainingSeconds: 20,
      pausedAt: '2026-03-30T10:00:00.000Z',
    };

    const activeLot = makeSampleLot({
      id: 'lot-active-1',
      status: 'in_progress',
      started_at: '2026-03-30T10:00:00.000Z',
    });

    const { getByText } = render(
      <OperatorControls
        activeLot={activeLot}
        upcomingLots={[]}
        sessionState={pausedSession}
        onSessionStateChange={onSessionStateChange}
        onActiveLotChange={onActiveLotChange}
      />
    );

    expect(getByText('RESUME AUCTION')).toBeTruthy();

    const resumeBtn = getByText('RESUME AUCTION').closest('button')!;
    await act(async () => {
      fireEvent.click(resumeBtn);
    });

    // 1. In-flight verification (Fix C): Pending state displayed, button disabled, OPTIMISTIC unpause triggered
    expect(getByText('RESUMING...')).toBeTruthy();
    expect((resumeBtn as HTMLButtonElement).disabled).toBe(true);
    expect(onSessionStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'live',
        isLive: true,
        isPaused: false,
        pausedRemainingSeconds: null,
      })
    );
    expect(onActiveLotChange).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'lot-active-1',
        started_at: expect.any(String),
      })
    );

    // 2. Authoritative resolution: Server confirms with new synthetic startedAt
    const liveStartedAt = new Date().toISOString();
    const authoritativeLiveState: AuctionSessionState = {
      ...pausedSession,
      status: 'live',
      isPaused: false,
      startedAt: liveStartedAt,
      pausedRemainingSeconds: null,
      pausedAt: null,
    };

    await act(async () => {
      resolveResume({
        success: true,
        data: {
          status: 'live',
          sessionState: authoritativeLiveState,
        },
      });
    });

    // 3. Callback verification: Session reconciles with authoritative startedAt
    expect(onSessionStateChange).toHaveBeenLastCalledWith(authoritativeLiveState);
    expect(onActiveLotChange).toHaveBeenLastCalledWith({
      ...activeLot,
      started_at: liveStartedAt,
    });
  });

  it('Franchise Bid applies optimistic bid immediately, completes without redundant router.refresh(), and never gets stuck in Submitting state', async () => {
    let resolveBid!: (val: { success: boolean; data?: any }) => void;
    mockPlaceBidAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveBid = resolve;
        })
    );

    const lot = makeSampleLot({
      id: 'lot-live-1',
      status: 'in_progress',
      base_price: 20,
      current_price: 20,
      highest_bidder_franchise_id: 'other-franchise',
    });

    const { getByText, queryByText } = render(
      <BiddingControl
        lot={lot}
        franchise={{
          id: 'my-franchise',
          name: 'Chennai Challengers',
          shortName: 'CC',
          remainingPurse: 500,
          squadCount: 5,
          maxSquadSize: 22,
          maxPermissibleBid: 300,
        }}
      />
    );

    const bidBtn = getByText('Place Bid for ₹30').closest('button')!;

    // Click Bid: enters pending state + applies optimistic bid (₹30)
    act(() => {
      fireEvent.click(bidBtn);
    });

    expect(getByText(/Submitting/i)).toBeTruthy();
    expect(getByText(/Your franchise currently holds the highest bid at ₹30/i)).toBeTruthy();

    // Resolve server action
    await act(async () => {
      resolveBid({ success: true, data: { newPrice: 30 } });
    });

    // Pending spinner clears immediately, no redundant router.refresh(), leading bidder shown
    expect(queryByText(/Submitting/i)).toBeNull();
    expect(getByText('Leading Bidder (₹30)')).toBeTruthy();
    expect(mockRouterRefresh).toHaveBeenCalledTimes(0);
  });

  it('synchronizes Initiating Browser (via Server Action revalidatePath) and Other Browsers / Public /live (via coalesced Realtime event)', async () => {
    vi.useFakeTimers();

    // Part A — Initiating Browser (Browser A):
    // Mounts AuctionRealtimeSync and executes a local Server Action while self-echo Realtime events arrive.
    const { unmount } = render(<AuctionRealtimeSync seasonId="season-001" fallbackIntervalMs={5000} />);
    act(() => {
      capturedSubscribeCallback?.('SUBSCRIBED');
    });

    let finishAction!: (res: { success: boolean }) => void;
    const actionPromise = runWithLocalActionTracking(
      () =>
        new Promise<{ success: boolean }>((resolve) => {
          finishAction = resolve;
        })
    );

    // Self-echo broadcast event arrives on Initiating Browser A while its Server Action is in flight
    act(() => {
      for (const cb of capturedChannelCallbacks) {
        if (cb.type === 'broadcast') {
          cb.handler({ type: 'auction_update', seasonId: 'season-001' });
        }
      }
    });

    finishAction({ success: true });
    await actionPromise;

    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Initiating Browser A did NOT fire a competing router.refresh() (it commits the Server Action's revalidatePath RSC payload)
    expect(mockRouterRefresh).toHaveBeenCalledTimes(0);

    unmount();
    resetLocalActionTrackingForTests();
    capturedChannelCallbacks = [];
    capturedSubscribeCallback = null;

    // Part B — Other Browsers / Public /live (Browser C):
    // In its own browser tab (no local action active), receives the 3-table Realtime burst
    // (auction_lots + auction_events + season_config) and coalesces it into 1 router.refresh().
    render(<AuctionRealtimeSync seasonId="season-001" fallbackIntervalMs={5000} />);
    act(() => {
      capturedSubscribeCallback?.('SUBSCRIBED');
    });

    // In this browser tab (no local action), receive the broadcast event
    // and coalesce it into 1 router.refresh().
    act(() => {
      for (const cb of capturedChannelCallbacks) {
        if (cb.type === 'broadcast') {
          cb.handler({ type: 'auction_update', seasonId: 'season-001' });
        }
      }
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Public /live (Browser C) coalesced the 3-table burst into EXACTLY 1 router.refresh()!
    expect(mockRouterRefresh).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('Admin SOLD and UNSOLD actions complete cleanly without redundant router.refresh() or stuck pending state', async () => {
    mockConfirmSaleAction.mockResolvedValue({
      success: true,
      data: { price: 60 },
    });
    mockMarkUnsoldAction.mockResolvedValue({
      success: true,
    });

    const activeLotWithBids = makeSampleLot({
      id: 'lot-active-bid',
      status: 'in_progress',
      current_price: 60,
      highest_bidder_franchise_id: 'f-1',
      highest_bidder: {
        id: 'f-1',
        name: 'Mumbai Mavericks',
        short_name: 'MM',
        primary_color: '#10b981',
        secondary_color: '#064e3b',
      },
    });

    const liveSession = makeSampleSessionState({
      status: 'live',
      isLive: true,
    });

    const { getByText } = render(
      <OperatorControls
        activeLot={activeLotWithBids}
        upcomingLots={[]}
        sessionState={liveSession}
      />
    );

    const hammerBtn = getByText('SOLD').closest('button')!;;
    await act(async () => {
      fireEvent.click(hammerBtn);
    });

    expect(mockConfirmSaleAction).toHaveBeenCalledWith('lot-active-bid');
    expect(mockRouterRefresh).toHaveBeenCalledTimes(0);
    expect(getByText(/Player SOLD for ₹60/i)).toBeTruthy();

    const passBtn = getByText('UNSOLD').closest('button')!;;
    await act(async () => {
      fireEvent.click(passBtn);
    });

    expect(mockMarkUnsoldAction).toHaveBeenCalledWith('lot-active-bid');
    expect(mockRouterRefresh).toHaveBeenCalledTimes(0);
    expect(getByText(/Player passed and marked UNSOLD/i)).toBeTruthy();
  });

  it('flushes a coalesced Realtime refresh if a local Server Action fails (e.g. outbid race)', async () => {
    vi.useFakeTimers();

    render(<AuctionRealtimeSync seasonId="season-001" fallbackIntervalMs={5000} />);
    act(() => {
      capturedSubscribeCallback?.('SUBSCRIBED');
    });

    let finishFailedAction!: (res: { success: boolean; error?: string }) => void;
    const actionPromise = runWithLocalActionTracking(
      () =>
        new Promise<{ success: boolean; error?: string }>((resolve) => {
          finishFailedAction = resolve;
        })
    );

    // Another franchise's winning bid broadcast event arrives while our failing bid action is in flight
    act(() => {
      for (const cb of capturedChannelCallbacks) {
        if (cb.type === 'broadcast') {
          cb.handler({ type: 'auction_update', seasonId: 'season-001' });
        }
      }
    });

    // Our bid action fails because we were outbid
    finishFailedAction({ success: false, error: 'Outbid by another franchise' });
    await actionPromise;

    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Because our local action failed (didMutate = false), the Realtime update is flushed immediately
    expect(mockRouterRefresh).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('D. Authoritative OperatorControls: sessionState.isPaused=true -> RESUME AUCTION, sessionState.isPaused=false -> PAUSE AUCTION, with zero contradictory localSessionState', async () => {
    mockPauseAuctionAction.mockResolvedValue({
      success: true,
      data: { status: 'paused', remainingSeconds: 25 },
    });

    const liveSession = makeSampleSessionState({
      status: 'live',
      isLive: true,
      isPaused: false,
      pausedRemainingSeconds: null,
    });

    const pausedSession = makeSampleSessionState({
      status: 'paused',
      isLive: false,
      isPaused: true,
      pausedRemainingSeconds: 25,
    });

    const { getByText, queryByText, rerender } = render(
      <OperatorControls
        activeLot={makeSampleLot()}
        upcomingLots={[]}
        sessionState={liveSession}
      />
    );

    // sessionState.isPaused = false -> PAUSE AUCTION
    expect(getByText('PAUSE AUCTION')).toBeTruthy();
    expect(queryByText('RESUME AUCTION')).toBeNull();
    expect(getByText('AUCTION SESSION ACTIVE')).toBeTruthy();

    // Even if pauseAuctionAction resolves while sessionState prop is still liveSession,
    // OperatorControls never contradicts authoritative sessionState
    await act(async () => {
      fireEvent.click(getByText('PAUSE AUCTION').closest('button')!);
    });
    expect(getByText('PAUSE AUCTION')).toBeTruthy();
    expect(queryByText('RESUME AUCTION')).toBeNull();

    // sessionState.isPaused = true -> RESUME AUCTION
    rerender(
      <OperatorControls
        activeLot={makeSampleLot()}
        upcomingLots={[]}
        sessionState={pausedSession}
      />
    );
    expect(getByText('RESUME AUCTION')).toBeTruthy();
    expect(queryByText('PAUSE AUCTION')).toBeNull();
    expect(getByText('AUCTION SESSION PAUSED')).toBeTruthy();

    // sessionState.isPaused = false -> PAUSE AUCTION
    rerender(
      <OperatorControls
        activeLot={makeSampleLot()}
        upcomingLots={[]}
        sessionState={liveSession}
      />
    );
    expect(getByText('PAUSE AUCTION')).toBeTruthy();
    expect(queryByText('RESUME AUCTION')).toBeNull();
    expect(getByText('AUCTION SESSION ACTIVE')).toBeTruthy();
  });

  it('F. Realtime race: cancels any pre-action queued refresh (hasQueuedRefreshAfterInFlight) when a local Server Action starts so it cannot overwrite the newer Server Action RSC state', async () => {
    vi.useFakeTimers();

    render(<AuctionRealtimeSync seasonId="season-001" fallbackIntervalMs={5000} />);
    act(() => {
      capturedSubscribeCallback?.('SUBSCRIBED');
    });

    // T = 0ms: First Realtime event arrives -> fires router.refresh() #1 at T = 80ms
    act(() => {
      capturedChannelCallbacks[0].handler();
    });
    act(() => {
      vi.advanceTimersByTime(80);
    });
    expect(mockRouterRefresh).toHaveBeenCalledTimes(1);

    // T = 100ms: Second Realtime event arrives while refresh #1 is in its 300ms in-flight window.
    // At T = 180ms, executeSingleRefresh runs and sets hasQueuedRefreshAfterInFlight = true.
    act(() => {
      vi.advanceTimersByTime(20);
      capturedChannelCallbacks[0].handler();
      vi.advanceTimersByTime(80);
    });
    expect(mockRouterRefresh).toHaveBeenCalledTimes(1);

    // T = 200ms: Admin clicks PAUSE AUCTION -> runWithLocalActionTracking starts and calls notifyLocalActionStarted().
    // This MUST cancel the pre-action hasQueuedRefreshAfterInFlight and inFlightTimer!
    let finishPauseAction!: (res: { success: boolean }) => void;
    const pausePromise = runWithLocalActionTracking(
      () =>
        new Promise<{ success: boolean }>((resolve) => {
          finishPauseAction = resolve;
        })
    );

    // T = 250ms: Pause Server Action completes and commits its authoritative RSC payload
    act(() => {
      vi.advanceTimersByTime(50);
    });
    finishPauseAction({ success: true });
    await pausePromise;

    // Advance well past the original 300ms in-flight window (T = 600ms)
    act(() => {
      vi.advanceTimersByTime(350);
    });

    // The pre-action queued refresh NEVER fired after the Server Action completed!
    expect(mockRouterRefresh).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
