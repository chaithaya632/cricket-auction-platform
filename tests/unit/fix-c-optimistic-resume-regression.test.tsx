// @vitest-environment jsdom
// =============================================================================
// ACC Auction Portal — Fix C Unit & Regression Tests
// Optimistic Resume on Admin Operator Controls (§Fix C)
// Verifies:
// 1. Immediate UI unpause & synthetic started_at anchor on Resume click
// 2. Rollback to paused session state & original lot on server failure
// 3. Prevention of duplicate resume clicks while action is in-flight
// 4. Reconciliation with authoritative server sessionState and startedAt
// 5. Clean resumption when no lot is active on the floor (between lots)
// =============================================================================

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, act, screen } from '@testing-library/react';
import { OperatorControls } from '@/components/auction/operator-controls';
import type { AuctionLotWithDetails, AuctionSessionState } from '@/lib/auction/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockResumeAuctionAction = vi.fn();
const mockPauseAuctionAction = vi.fn();

vi.mock('@/lib/auction/actions', () => ({
  resumeAuctionAction: (...args: any[]) => mockResumeAuctionAction(...args),
  pauseAuctionAction: (...args: any[]) => mockPauseAuctionAction(...args),
  startAuctionAction: vi.fn(),
  startAuctionAgainAction: vi.fn(),
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
  updateActiveBucketsAction: vi.fn(),
  drawRandomLotFromBucketsAction: vi.fn(),
  startNextBucketGroupAction: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/lib/auction/audio', () => ({
  getAudioEnabled: vi.fn(() => false),
  setAudioEnabled: vi.fn(),
}));

// Helper to construct a minimal sample lot
function createSampleLot(overrides: Partial<AuctionLotWithDetails> = {}): AuctionLotWithDetails {
  return {
    id: 'lot-sample-1',
    season_id: 'season-001',
    registration_id: 'reg-001',
    bucket: 'B3',
    draw_number: 14,
    base_price: 20,
    round: 1,
    status: 'in_progress',
    current_price: null,
    highest_bidder_franchise_id: null,
    started_at: '2026-10-10T12:00:00.000Z',
    ended_at: null,
    created_at: '2026-10-10T12:00:00.000Z',
    updated_at: '2026-10-10T12:00:00.000Z',
    player: {
      id: 'player-001',
      full_name: 'Rohit Sharma',
      photo_url: null,
    },
    registration: {
      id: 'reg-001',
      branch: 'CSE',
      academic_year: 4,
      programme: 'B.Tech',
      cricheroes_profile_url: null,
    },
    highest_bidder: null,
    ...overrides,
  };
}

// Helper to construct a paused session state
function createPausedSession(overrides: Partial<AuctionSessionState> = {}): AuctionSessionState {
  return {
    status: 'paused',
    seasonId: 'season-001',
    seasonName: 'ACC Premier League 2026',
    isLive: true,
    isPaused: true,
    isNotStarted: false,
    isCompleted: false,
    startedAt: null,
    activeLotId: 'lot-sample-1',
    pausedRemainingSeconds: 18,
    pausedAt: '2026-10-10T12:05:00.000Z',
    ...overrides,
  };
}

describe('Fix C — Optimistic Resume on Admin Operator Controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Immediate UI Response
  // -------------------------------------------------------------------------
  it('1. Immediately unfreezes Admin sessionState and lot started_at optimistically upon Resume click', async () => {
    let resolveResume!: (val: any) => void;
    mockResumeAuctionAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveResume = resolve;
        })
    );

    const onSessionStateChange = vi.fn();
    const onActiveLotChange = vi.fn();
    const pausedSession = createPausedSession({ pausedRemainingSeconds: 22 });
    const sampleLot = createSampleLot({ started_at: '2026-10-10T12:00:00.000Z' });

    render(
      <OperatorControls
        activeLot={sampleLot}
        upcomingLots={[]}
        sessionState={pausedSession}
        onSessionStateChange={onSessionStateChange}
        onActiveLotChange={onActiveLotChange}
      />
    );

    const resumeBtn = screen.getByRole('button', { name: /RESUME AUCTION/i });
    expect(resumeBtn).toBeDefined();

    // Click Resume
    await act(async () => {
      fireEvent.click(resumeBtn);
    });

    // Invariant: Server action was initiated
    expect(mockResumeAuctionAction).toHaveBeenCalledTimes(1);

    // Invariant 1A: onSessionStateChange called SYNCHRONOUSLY before server returns
    expect(onSessionStateChange).toHaveBeenCalledTimes(1);
    const optimisticState: AuctionSessionState = onSessionStateChange.mock.calls[0][0];
    expect(optimisticState.status).toBe('live');
    expect(optimisticState.isLive).toBe(true);
    expect(optimisticState.isPaused).toBe(false);
    expect(optimisticState.pausedRemainingSeconds).toBeNull();
    expect(optimisticState.pausedAt).toBeNull();
    expect(typeof optimisticState.startedAt).toBe('string');

    // Invariant 1B: onActiveLotChange called with synthetic started_at anchor derived from remaining
    expect(onActiveLotChange).toHaveBeenCalledTimes(1);
    const optimisticLot: AuctionLotWithDetails = onActiveLotChange.mock.calls[0][0];
    expect(optimisticLot.id).toBe(sampleLot.id);
    expect(typeof optimisticLot.started_at).toBe('string');
    // First bid timer is 30s; remaining 22s -> elapsed 8s -> synthetic started_at ~ 8s in past
    const syntheticDate = new Date(optimisticLot.started_at!).getTime();
    const now = Date.now();
    const diffSeconds = Math.round((now - syntheticDate) / 1000);
    expect(diffSeconds).toBeGreaterThanOrEqual(7);
    expect(diffSeconds).toBeLessThanOrEqual(9);

    // Cleanup promise
    await act(async () => {
      resolveResume({ success: true, data: { status: 'live', sessionState: optimisticState } });
    });
  });

  // -------------------------------------------------------------------------
  // 2. Server Failure Rollback
  // -------------------------------------------------------------------------
  it('2. Rolls back sessionState and activeLot to paused state if resume server action fails', async () => {
    let rejectResume!: (val: any) => void;
    mockResumeAuctionAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          rejectResume = resolve;
        })
    );

    const onSessionStateChange = vi.fn();
    const onActiveLotChange = vi.fn();
    const pausedSession = createPausedSession({ pausedRemainingSeconds: 15 });
    const sampleLot = createSampleLot();

    render(
      <OperatorControls
        activeLot={sampleLot}
        upcomingLots={[]}
        sessionState={pausedSession}
        onSessionStateChange={onSessionStateChange}
        onActiveLotChange={onActiveLotChange}
      />
    );

    const resumeBtn = screen.getByRole('button', { name: /RESUME AUCTION/i });

    await act(async () => {
      fireEvent.click(resumeBtn);
    });

    // 1st call: optimistic live state
    expect(onSessionStateChange).toHaveBeenCalledTimes(1);
    expect(onSessionStateChange.mock.calls[0][0].isPaused).toBe(false);

    // Server returns failure
    await act(async () => {
      rejectResume({
        success: false,
        error: 'Database connection failed while resuming session.',
      });
    });

    // 2nd call: ROLLBACK back to pausedSession
    expect(onSessionStateChange).toHaveBeenCalledTimes(2);
    expect(onSessionStateChange.mock.calls[1][0]).toEqual(pausedSession);

    // activeLot rolled back to original
    expect(onActiveLotChange).toHaveBeenCalledTimes(2);
    expect(onActiveLotChange.mock.calls[1][0]).toEqual(sampleLot);

    // Error message rendered
    expect(screen.getByText(/Database connection failed while resuming session/i)).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 3. Prevent Duplicate Clicks
  // -------------------------------------------------------------------------
  it('3. Prevents duplicate resume requests while action is in-flight or session is not paused', async () => {
    let resolveResume!: (val: any) => void;
    mockResumeAuctionAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveResume = resolve;
        })
    );

    const onSessionStateChange = vi.fn();
    const onActiveLotChange = vi.fn();
    const pausedSession = createPausedSession();
    const sampleLot = createSampleLot();

    render(
      <OperatorControls
        activeLot={sampleLot}
        upcomingLots={[]}
        sessionState={pausedSession}
        onSessionStateChange={onSessionStateChange}
        onActiveLotChange={onActiveLotChange}
      />
    );

    const resumeBtn = screen.getByRole('button', { name: /RESUME AUCTION/i });

    // First click: triggers resume
    await act(async () => {
      fireEvent.click(resumeBtn);
    });

    expect(mockResumeAuctionAction).toHaveBeenCalledTimes(1);

    // Second click while in-flight: MUST BE IGNORED
    await act(async () => {
      fireEvent.click(resumeBtn);
    });

    // Still exactly 1 call to the server
    expect(mockResumeAuctionAction).toHaveBeenCalledTimes(1);

    // Clean up in-flight promise
    await act(async () => {
      resolveResume({
        success: true,
        data: {
          status: 'live',
          sessionState: { ...pausedSession, status: 'live', isPaused: false },
        },
      });
    });
  });

  // -------------------------------------------------------------------------
  // 4. State Reconciliation with Authoritative Server State
  // -------------------------------------------------------------------------
  it('4. Reconciles optimistic UI with authoritative server sessionState and startedAt upon success', async () => {
    let resolveResume!: (val: any) => void;
    mockResumeAuctionAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveResume = resolve;
        })
    );

    const onSessionStateChange = vi.fn();
    const onActiveLotChange = vi.fn();
    const pausedSession = createPausedSession({ pausedRemainingSeconds: 20 });
    const sampleLot = createSampleLot();

    render(
      <OperatorControls
        activeLot={sampleLot}
        upcomingLots={[]}
        sessionState={pausedSession}
        onSessionStateChange={onSessionStateChange}
        onActiveLotChange={onActiveLotChange}
      />
    );

    const resumeBtn = screen.getByRole('button', { name: /RESUME AUCTION/i });

    await act(async () => {
      fireEvent.click(resumeBtn);
    });

    // Optimistic call fired
    expect(onSessionStateChange).toHaveBeenCalledTimes(1);

    // Server returns authoritative state with exact server timestamp
    const authoritativeStartedAt = '2026-10-10T12:05:10.500Z';
    const authoritativeServerState: AuctionSessionState = {
      status: 'live',
      seasonId: 'season-001',
      seasonName: 'ACC Premier League 2026',
      isLive: true,
      isPaused: false,
      isNotStarted: false,
      isCompleted: false,
      startedAt: authoritativeStartedAt,
      activeLotId: sampleLot.id,
      pausedRemainingSeconds: null,
      pausedAt: null,
    };

    await act(async () => {
      resolveResume({
        success: true,
        data: {
          status: 'live',
          sessionState: authoritativeServerState,
        },
      });
    });

    // Final reconciliation call MUST have authoritative server state
    expect(onSessionStateChange).toHaveBeenLastCalledWith(authoritativeServerState);
    expect(onActiveLotChange).toHaveBeenLastCalledWith({
      ...sampleLot,
      started_at: authoritativeStartedAt,
    });

    // Success feedback displayed
    expect(screen.getByText(/Auction session RESUMED and LIVE/i)).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 5. Resume Between Lots (activeLot is null)
  // -------------------------------------------------------------------------
  it('5. Resumes cleanly when no active lot is on floor without calling onActiveLotChange', async () => {
    mockResumeAuctionAction.mockResolvedValue({
      success: true,
      data: {
        status: 'live',
        sessionState: {
          status: 'live',
          seasonId: 'season-001',
          seasonName: 'ACC Premier League 2026',
          isLive: true,
          isPaused: false,
          isNotStarted: false,
          isCompleted: false,
          startedAt: null,
          activeLotId: null,
          pausedRemainingSeconds: null,
          pausedAt: null,
        },
      },
    });

    const onSessionStateChange = vi.fn();
    const onActiveLotChange = vi.fn();
    const pausedSessionWithoutLot = createPausedSession({ activeLotId: null });

    render(
      <OperatorControls
        activeLot={null}
        upcomingLots={[]}
        sessionState={pausedSessionWithoutLot}
        onSessionStateChange={onSessionStateChange}
        onActiveLotChange={onActiveLotChange}
      />
    );

    const resumeBtn = screen.getByRole('button', { name: /RESUME AUCTION/i });

    await act(async () => {
      fireEvent.click(resumeBtn);
    });

    // Optimistic state set to live
    expect(onSessionStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'live',
        isPaused: false,
      })
    );

    // onActiveLotChange must NOT be called when activeLot was null
    expect(onActiveLotChange).not.toHaveBeenCalled();
  });
});
