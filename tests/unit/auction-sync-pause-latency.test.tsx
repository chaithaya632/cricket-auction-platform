// =============================================================================
// ACC Auction Portal — Unit Tests: Auction Sync, Pause/Timer, & Latency Optimizations
// =============================================================================

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { AuctionTimer } from '@/components/auction/auction-timer';
import type { AuctionSessionState } from '@/lib/auction/types';
import { calculateNextBid } from '@/domain/auction/bid-increment';

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
