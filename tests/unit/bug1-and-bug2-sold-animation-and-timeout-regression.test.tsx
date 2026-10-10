// @vitest-environment jsdom
// =============================================================================
// ACC Auction Portal — Regression Tests: Bug 1 & Bug 2
// -----------------------------------------------------------------------------
// Bug 1: Manual SOLD/UNSOLD animations & winning franchise announcement
//        missing on non-admin views (Franchise, Projector, Public Live).
// Bug 2: Timer expiry (finalizeExpiredLotAction) failing to award the highest
//        valid bidder due to clock skew rejection, missing auction_events
//        authoritative bid resolution, and broadcast inversion.
// =============================================================================

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ActiveLotCard } from '@/components/auction/active-lot-card';
import { FranchiseAuctionFloor } from '@/components/auction/franchise-auction-floor';
import { ProjectorAuctionFloor } from '@/components/auction/projector-auction-floor';
import { LiveAuctionRoomFloor } from '@/components/auction/live-auction-room-floor';
import {
  notifyAuctionDelta,
  resetSequenceTrackingForTests,
} from '@/components/auction/auction-realtime-sync';
import type {
  AuctionLotWithDetails,
  AuctionSessionState,
  AuctionConfigDTO,
} from '@/lib/auction/types';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock('@/lib/auction/audio', () => ({
  playBidGavelChime: vi.fn(),
  playHammerStrikeSound: vi.fn(),
  getAudioEnabled: vi.fn(() => false),
  setAudioEnabled: vi.fn(),
}));

// Mock permissions & actions for floor tests
const mockFinalizeExpiredLotAction = vi.fn();
vi.mock('@/lib/auction/actions', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    finalizeExpiredLotAction: (...args: any[]) => mockFinalizeExpiredLotAction(...args),
  };
});

// Test fixtures
const mockLotA: AuctionLotWithDetails = {
  id: 'lot-uuid-001',
  season_id: 'season-001',
  registration_id: 'reg-001',
  bucket: 'B1',
  draw_number: 1,
  base_price: 20,
  round: 1,
  status: 'in_progress',
  current_price: 150,
  highest_bidder_franchise_id: 'f-titans',
  started_at: '2026-10-10T12:00:00.000Z',
  ended_at: null,
  created_at: '2026-10-10T12:00:00.000Z',
  updated_at: '2026-10-10T12:00:00.000Z',
  player: {
    id: 'player-001',
    full_name: 'Virat Kohli',
    photo_url: null,
  },
  skills: {
    derived_player_type: 'BATTER',
    batting_style: 'RHB',
    bowling_style: null,
  },
  registration: {
    id: 'reg-001',
    branch: 'CSE',
    academic_year: 4,
    programme: 'B.Tech',
    cricheroes_profile_url: null,
  },
  highest_bidder: {
    id: 'f-titans',
    name: 'ACC Titans',
    short_name: 'TITANS',
    primary_color: '#3b82f6',
    secondary_color: null,
  },
};

const mockLotB: AuctionLotWithDetails = {
  id: 'lot-uuid-002',
  season_id: 'season-001',
  registration_id: 'reg-002',
  bucket: 'B1',
  draw_number: 2,
  base_price: 20,
  round: 1,
  status: 'in_progress',
  current_price: null,
  highest_bidder_franchise_id: null,
  started_at: '2026-10-10T12:01:00.000Z',
  ended_at: null,
  created_at: '2026-10-10T12:00:00.000Z',
  updated_at: '2026-10-10T12:01:00.000Z',
  player: {
    id: 'player-002',
    full_name: 'Rohit Sharma',
    photo_url: null,
  },
  skills: {
    derived_player_type: 'BATTER',
    batting_style: 'RHB',
    bowling_style: null,
  },
  registration: {
    id: 'reg-002',
    branch: 'ECE',
    academic_year: 3,
    programme: 'B.Tech',
    cricheroes_profile_url: null,
  },
  highest_bidder: null,
};

const mockSessionState: AuctionSessionState = {
  status: 'live',
  seasonId: 'season-001',
  seasonName: 'ACC 2026 Season',
  isLive: true,
  isPaused: false,
  isNotStarted: false,
  isCompleted: false,
  startedAt: '2026-10-10T12:00:00.000Z',
  activeLotId: 'lot-uuid-001',
  pausedRemainingSeconds: null,
};

const mockConfig: AuctionConfigDTO = {
  firstBidTimerSeconds: 30,
  subsequentBidTimerSeconds: 20,
  minAuctionPurchases: 5,
  maxSquadSize: 15,
  minSquadSize: 10,
  defaultPurse: 10000,
};

describe('Bug 1 — SOLD & UNSOLD Presentation & Winner Announcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    resetSequenceTrackingForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders hammer price, winning franchise badge, and name on ActiveLotCard upon SALE broadcast', () => {
    render(<ActiveLotCard lot={mockLotA} size="normal" />);

    // Broadcast SALE with authoritative winner details
    act(() => {
      notifyAuctionDelta({
        version: 2,
        type: 'SALE',
        seasonId: 'season-001',
        lotId: mockLotA.id,
        currentPrice: 220,
        highestBidderId: 'f-titans',
        highestBidderName: 'ACC Titans',
        highestBidderShortName: 'TITANS',
        highestBidderPrimaryColor: '#3b82f6',
        playerName: 'Virat Kohli',
        sequenceNumber: 101,
      });
    });

    // Verify SOLD stamp and hammer price
    expect(screen.getByText(/SOLD!/i)).toBeDefined();
    expect(screen.getByText('Official Hammer Price')).toBeDefined();
    expect(screen.getByText('₹220')).toBeDefined();

    // Verify ACQUIRED BY section displays winning franchise
    expect(screen.getByText('ACQUIRED BY')).toBeDefined();
    expect(screen.getByText('TITANS')).toBeDefined();
    expect(screen.getByText('ACC Titans')).toBeDefined();
    expect(screen.getByText(/Winning Franchise · Final Sale Confirmed at ₹220/i)).toBeDefined();
  });

  it('renders UNSOLD card on ActiveLotCard upon UNSOLD broadcast', () => {
    const lotWithoutBid = { ...mockLotA, current_price: null, highest_bidder: null, highest_bidder_franchise_id: null };
    render(<ActiveLotCard lot={lotWithoutBid} size="normal" />);

    // Broadcast UNSOLD
    act(() => {
      notifyAuctionDelta({
        version: 2,
        type: 'UNSOLD',
        seasonId: 'season-001',
        lotId: lotWithoutBid.id,
        playerName: 'Virat Kohli',
        sequenceNumber: 102,
      });
    });

    // Verify UNSOLD presentation
    expect(screen.getAllByText('UNSOLD').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Passed at Opening Price')).toBeDefined();
    expect(screen.getByText('₹20')).toBeDefined();
  });

  it('preserves the SOLD presentation when props.lot changes immediately to next lot, holding for 2.2 seconds', () => {
    const { rerender } = render(<ActiveLotCard lot={mockLotA} size="normal" />);

    // Receive SALE broadcast
    act(() => {
      notifyAuctionDelta({
        version: 2,
        type: 'SALE',
        seasonId: 'season-001',
        lotId: mockLotA.id,
        currentPrice: 180,
        highestBidderId: 'f-titans',
        highestBidderName: 'ACC Titans',
        highestBidderShortName: 'TITANS',
        sequenceNumber: 103,
      });
    });

    // Verify Lot A is sold
    expect(screen.getByText('Virat Kohli')).toBeDefined();
    expect(screen.getByText('₹180')).toBeDefined();

    // Next lot arrives immediately from parent floor or RSC refresh (at T = 50ms)
    act(() => {
      vi.advanceTimersByTime(50);
    });
    rerender(<ActiveLotCard lot={mockLotB} size="normal" />);

    // ActiveLotCard MUST retain Lot A during the 2200ms retention window!
    expect(screen.getByText('Virat Kohli')).toBeDefined();
    expect(screen.queryByText('Rohit Sharma')).toBeNull();

    // Advance 2100ms (total 2150ms) — still showing Lot A
    act(() => {
      vi.advanceTimersByTime(2100);
    });
    expect(screen.getByText('Virat Kohli')).toBeDefined();
    expect(screen.queryByText('Rohit Sharma')).toBeNull();

    // Advance remaining 100ms (total 2250ms) — transitions to Lot B
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getByText('Rohit Sharma')).toBeDefined();
    expect(screen.queryByText('Virat Kohli')).toBeNull();
  });

  it('safely ignores duplicate SALE broadcasts without re-triggering audio or resetting presentation', () => {
    render(<ActiveLotCard lot={mockLotA} size="normal" />);

    act(() => {
      notifyAuctionDelta({
        version: 2,
        type: 'SALE',
        seasonId: 'season-001',
        lotId: mockLotA.id,
        currentPrice: 150,
        highestBidderId: 'f-titans',
        highestBidderName: 'ACC Titans',
        sequenceNumber: 104,
      });
    });

    expect(screen.getByText('ACC Titans')).toBeDefined();

    // Dispatch duplicate SALE broadcast with same sequence or duplicate lot
    act(() => {
      notifyAuctionDelta({
        version: 2,
        type: 'SALE',
        seasonId: 'season-001',
        lotId: mockLotA.id,
        currentPrice: 150,
        highestBidderId: 'f-titans',
        highestBidderName: 'ACC Titans',
        sequenceNumber: 104,
      });
    });

    // Presentation remains steady on Lot A
    expect(screen.getByText('ACC Titans')).toBeDefined();
    expect(screen.getByText('Virat Kohli')).toBeDefined();
  });

  it('preserves the UNSOLD presentation when props.lot changes immediately to next lot, holding for 2.2 seconds', () => {
    const lotWithoutBid = { ...mockLotA, current_price: null, highest_bidder: null, highest_bidder_franchise_id: null };
    const { rerender } = render(<ActiveLotCard lot={lotWithoutBid} size="normal" />);

    // Receive UNSOLD broadcast
    act(() => {
      notifyAuctionDelta({
        version: 2,
        type: 'UNSOLD',
        seasonId: 'season-001',
        lotId: lotWithoutBid.id,
        playerName: 'Virat Kohli',
        sequenceNumber: 105,
      });
    });

    // Verify UNSOLD is displayed
    expect(screen.getAllByText('UNSOLD').length).toBeGreaterThanOrEqual(1);

    // Next lot arrives immediately from parent floor (at T = 50ms)
    act(() => {
      vi.advanceTimersByTime(50);
    });
    rerender(<ActiveLotCard lot={mockLotB} size="normal" />);

    // ActiveLotCard MUST retain Lot A during the 2200ms retention window!
    expect(screen.getAllByText('UNSOLD').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Rohit Sharma')).toBeNull();

    // Advance remaining 2200ms — transitions to Lot B
    act(() => {
      vi.advanceTimersByTime(2200);
    });
    expect(screen.getByText('Rohit Sharma')).toBeDefined();
  });

  it('does not produce a false SOLD announcement when no authoritative SALE broadcast has been received', () => {
    render(<ActiveLotCard lot={mockLotA} size="normal" />);

    expect(screen.queryByText(/SOLD!/i)).toBeNull();
    expect(screen.queryByText('Official Hammer Price')).toBeNull();
    expect(screen.queryByText('ACQUIRED BY')).toBeNull();
  });
});

describe('Bug 1 — Floor Coordinators Terminal Outcome Retention (Franchise, Projector, Live)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    resetSequenceTrackingForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('FranchiseAuctionFloor holds sold lot for 2.2s when PLAYER_SELECTED arrives right after SALE', () => {
    render(
      <FranchiseAuctionFloor
        seasonId="season-001"
        initialActiveLot={mockLotA}
        initialSessionState={mockSessionState}
        config={mockConfig}
        franchise={null}
      />
    );

    // 1. SALE arrives
    act(() => {
      notifyAuctionDelta({
        version: 2,
        type: 'SALE',
        seasonId: 'season-001',
        lotId: mockLotA.id,
        currentPrice: 150,
        highestBidderId: 'f-titans',
        highestBidderName: 'ACC Titans',
        highestBidderShortName: 'TITANS',
        sequenceNumber: 201,
      });
    });

    expect(screen.getByText('Virat Kohli')).toBeDefined();
    expect(screen.getByText(/SOLD!/i)).toBeDefined();
    expect(screen.getByText('ACQUIRED BY')).toBeDefined();
    expect(screen.getByText('ACC Titans')).toBeDefined();

    // 2. PLAYER_SELECTED for Lot B arrives 50ms later
    act(() => {
      vi.advanceTimersByTime(50);
      notifyAuctionDelta({
        version: 2,
        type: 'PLAYER_SELECTED',
        seasonId: 'season-001',
        lotId: mockLotB.id,
        activeLot: mockLotB,
        sequenceNumber: 202,
      });
    });

    // Floor MUST hold Lot A for 2200ms!
    expect(screen.getByText('Virat Kohli')).toBeDefined();
    expect(screen.queryByText('Rohit Sharma')).toBeNull();

    // Advance 2200ms
    act(() => {
      vi.advanceTimersByTime(2200);
    });

    // Now transitions to Lot B
    expect(screen.getByText('Rohit Sharma')).toBeDefined();
  });

  it('ProjectorAuctionFloor holds sold lot for 2.2s when PLAYER_SELECTED arrives right after SALE', () => {
    render(
      <ProjectorAuctionFloor
        seasonId="season-001"
        initialActiveLot={mockLotA}
        initialSessionState={mockSessionState}
        config={mockConfig}
      />
    );

    // 1. SALE arrives
    act(() => {
      notifyAuctionDelta({
        version: 2,
        type: 'SALE',
        seasonId: 'season-001',
        lotId: mockLotA.id,
        currentPrice: 150,
        highestBidderId: 'f-titans',
        highestBidderName: 'ACC Titans',
        sequenceNumber: 301,
      });
    });

    expect(screen.getByText('Virat Kohli')).toBeDefined();
    expect(screen.getByText(/SOLD!/i)).toBeDefined();
    expect(screen.getByText('ACQUIRED BY')).toBeDefined();
    expect(screen.getByText('ACC Titans')).toBeDefined();

    // 2. PLAYER_SELECTED arrives
    act(() => {
      vi.advanceTimersByTime(50);
      notifyAuctionDelta({
        version: 2,
        type: 'PLAYER_SELECTED',
        seasonId: 'season-001',
        lotId: mockLotB.id,
        activeLot: mockLotB,
        sequenceNumber: 302,
      });
    });

    // Still showing Lot A
    expect(screen.getByText('Virat Kohli')).toBeDefined();
    expect(screen.queryByText('Rohit Sharma')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(2200);
    });

    expect(screen.getByText('Rohit Sharma')).toBeDefined();
  });

  it('LiveAuctionRoomFloor holds unsold lot for 2.2s when PLAYER_SELECTED arrives right after UNSOLD', () => {
    render(
      <LiveAuctionRoomFloor
        seasonId="season-001"
        initialActiveLot={mockLotA}
        initialSessionState={mockSessionState}
        config={mockConfig}
        franchiseBiddingData={null}
      />
    );

    // 1. UNSOLD arrives
    act(() => {
      notifyAuctionDelta({
        version: 2,
        type: 'UNSOLD',
        seasonId: 'season-001',
        lotId: mockLotA.id,
        sequenceNumber: 401,
      });
    });

    expect(screen.getByText('Virat Kohli')).toBeDefined();
    expect(screen.getAllByText('UNSOLD').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Passed at Opening Price')).toBeDefined();

    // 2. PLAYER_SELECTED arrives
    act(() => {
      vi.advanceTimersByTime(50);
      notifyAuctionDelta({
        version: 2,
        type: 'PLAYER_SELECTED',
        seasonId: 'season-001',
        lotId: mockLotB.id,
        activeLot: mockLotB,
        sequenceNumber: 402,
      });
    });

    // Still showing Lot A
    expect(screen.getByText('Virat Kohli')).toBeDefined();
    expect(screen.queryByText('Rohit Sharma')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(2200);
    });

    expect(screen.getByText('Rohit Sharma')).toBeDefined();
  });
});

describe('Bug 2 — Timeout Finalization & Client Retry Invariants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resets hasTriggeredExpiryRef on transient failure so client can retry finalization', async () => {
    mockFinalizeExpiredLotAction.mockResolvedValueOnce({
      success: false,
      error: 'Cannot finalize lot: bidding deadline has not expired yet (1s remaining).',
    });

    const activeLotFuture = {
      ...mockLotA,
      started_at: new Date().toISOString(),
    };

    render(
      <FranchiseAuctionFloor
        seasonId="season-001"
        initialActiveLot={activeLotFuture}
        initialSessionState={mockSessionState}
        config={mockConfig}
        franchise={null}
      />
    );

    // Advance 21 seconds so the subsequentBidTimer (20s) expires
    await act(async () => {
      vi.advanceTimersByTime(21000);
    });

    expect(mockFinalizeExpiredLotAction).toHaveBeenCalledTimes(1);

    // Second attempt succeeds
    mockFinalizeExpiredLotAction.mockResolvedValueOnce({
      success: true,
      data: { finalized: true, status: 'sold', price: 150, franchiseId: 'f-titans' },
    });

    // Advance 1000ms to allow client retry to execute
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    // finalizeExpiredLotAction was invoked again after transient failure
    expect(mockFinalizeExpiredLotAction).toHaveBeenCalledTimes(2);
  });
});

describe('Broadcast Ordering — enqueueBackgroundBroadcast Strict FIFO Execution', () => {
  it('guarantees task N completes before task N+1 begins execution', async () => {
    const { enqueueBackgroundBroadcast, _resetBroadcastChainForTesting } = await import(
      '@/lib/auction/realtime'
    );
    _resetBroadcastChainForTesting();

    const executionLog: string[] = [];

    // Task 1 (e.g. SALE broadcast): takes 50ms
    enqueueBackgroundBroadcast(async () => {
      executionLog.push('task1:start');
      await new Promise((resolve) => setTimeout(resolve, 50));
      executionLog.push('task1:end');
    });

    // Task 2 (e.g. PLAYER_SELECTED broadcast): enqueued immediately after Task 1
    enqueueBackgroundBroadcast(async () => {
      executionLog.push('task2:start');
      await new Promise((resolve) => setTimeout(resolve, 10));
      executionLog.push('task2:end');
    });

    // Wait for the sequential queue to drain
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(executionLog).toEqual([
      'task1:start',
      'task1:end',
      'task2:start',
      'task2:end',
    ]);
  });

  it('preserves FIFO ordering even if an earlier task throws an error', async () => {
    const { enqueueBackgroundBroadcast, _resetBroadcastChainForTesting } = await import(
      '@/lib/auction/realtime'
    );
    _resetBroadcastChainForTesting();

    const executionLog: string[] = [];

    // Task 1 fails
    enqueueBackgroundBroadcast(async () => {
      executionLog.push('task1:start');
      throw new Error('Supabase network error');
    });

    // Task 2 must still run after Task 1 settles
    enqueueBackgroundBroadcast(async () => {
      executionLog.push('task2:start');
      executionLog.push('task2:end');
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(executionLog).toEqual([
      'task1:start',
      'task2:start',
      'task2:end',
    ]);
  });

  it('handles 5 concurrent enqueueBackgroundBroadcast calls preserving strict invocation order', async () => {
    const { enqueueBackgroundBroadcast, _resetBroadcastChainForTesting } = await import(
      '@/lib/auction/realtime'
    );
    _resetBroadcastChainForTesting();

    const executionLog: string[] = [];
    const delays = [25, 10, 20, 5, 15];

    // Enqueue 5 tasks concurrently
    for (let i = 1; i <= 5; i++) {
      enqueueBackgroundBroadcast(async () => {
        executionLog.push(`task${i}:start`);
        await new Promise((resolve) => setTimeout(resolve, delays[i - 1]));
        executionLog.push(`task${i}:end`);
      });
    }

    // Wait for all 5 to complete (25 + 10 + 20 + 5 + 15 = 75ms)
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(executionLog).toEqual([
      'task1:start',
      'task1:end',
      'task2:start',
      'task2:end',
      'task3:start',
      'task3:end',
      'task4:start',
      'task4:end',
      'task5:start',
      'task5:end',
    ]);
  });

  it('ensures broadcast failure does not throw to caller and allows subsequent queue operations', async () => {
    const { enqueueBackgroundBroadcast, _resetBroadcastChainForTesting } = await import(
      '@/lib/auction/realtime'
    );
    _resetBroadcastChainForTesting();

    let taskExecuted = false;

    // Caller should not receive an unhandled error
    expect(() => {
      enqueueBackgroundBroadcast(async () => {
        throw new Error('Realtime transport closed');
      });
    }).not.toThrow();

    // Subsequent enqueue still works
    enqueueBackgroundBroadcast(async () => {
      taskExecuted = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(taskExecuted).toBe(true);
  });
});
