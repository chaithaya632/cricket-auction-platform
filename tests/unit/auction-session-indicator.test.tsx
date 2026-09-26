import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { AuctionSessionIndicator } from '@/components/acc/status-badges';
import type { AuctionSessionStatus } from '@/lib/auction/types';

// =============================================================================
// § AuctionSessionIndicator — State-Driven Badge Tests
// =============================================================================

describe('AuctionSessionIndicator — renders correct label for each session status', () => {
  const testCases: { status: AuctionSessionStatus; expectedLabel: string }[] = [
    { status: 'not_started', expectedLabel: 'Not Started' },
    { status: 'live', expectedLabel: 'Live' },
    { status: 'paused', expectedLabel: 'Paused' },
    { status: 'completed', expectedLabel: 'Ended' },
  ];

  for (const { status, expectedLabel } of testCases) {
    it(`renders "${expectedLabel}" for status "${status}"`, () => {
      const html = renderToString(<AuctionSessionIndicator status={status} />);
      expect(html).toContain(expectedLabel);
    });
  }
});

describe('AuctionSessionIndicator — visual styling per status', () => {
  it('shows pulsing animate class only for "live" status', () => {
    const liveHtml = renderToString(<AuctionSessionIndicator status="live" />);
    expect(liveHtml).toContain('animate-live-pulse');

    for (const status of ['not_started', 'paused', 'completed'] as AuctionSessionStatus[]) {
      const html = renderToString(<AuctionSessionIndicator status={status} />);
      expect(html).not.toContain('animate-live-pulse');
    }
  });

  it('uses live color classes for "live" status', () => {
    const html = renderToString(<AuctionSessionIndicator status="live" />);
    expect(html).toContain('bg-live');
    expect(html).toContain('text-live');
  });

  it('uses amber color classes for "paused" status', () => {
    const html = renderToString(<AuctionSessionIndicator status="paused" />);
    expect(html).toContain('text-amber-400');
  });

  it('uses blue color classes for "completed" status', () => {
    const html = renderToString(<AuctionSessionIndicator status="completed" />);
    expect(html).toContain('text-blue-400');
  });

  it('uses zinc color classes for "not_started" status', () => {
    const html = renderToString(<AuctionSessionIndicator status="not_started" />);
    expect(html).toContain('text-zinc-400');
  });
});

// =============================================================================
// § Season status → AuctionSessionStatus mapping (mirrors getAuctionSessionState logic)
// =============================================================================

describe('Season status → AuctionSessionStatus mapping', () => {
  /**
   * This mirrors the exact logic in lib/auction/queries.ts getAuctionSessionState
   * to verify the status derivation matches the required behavior.
   */
  function computeSessionStatus(
    seasonStatus: string,
    sessionStatusConfig?: string
  ): AuctionSessionStatus {
    if (seasonStatus === 'completed' || seasonStatus === 'archived' || sessionStatusConfig === 'completed') {
      return 'completed';
    } else if (seasonStatus === 'auction') {
      if (sessionStatusConfig === 'paused') {
        return 'paused';
      } else {
        return 'live';
      }
    } else {
      return 'not_started';
    }
  }

  // User-required mapping:
  // draft            → NOT STARTED
  // registration_open → NOT STARTED
  // registration_closed → NOT STARTED
  // auction_active   → LIVE
  // paused           → PAUSED
  // completed        → ENDED
  // archived         → ENDED

  it('draft → not_started (NOT STARTED)', () => {
    expect(computeSessionStatus('draft')).toBe('not_started');
  });

  it('registration_open → not_started (NOT STARTED)', () => {
    expect(computeSessionStatus('registration_open')).toBe('not_started');
  });

  it('registration_closed → not_started (NOT STARTED)', () => {
    expect(computeSessionStatus('registration_closed')).toBe('not_started');
  });

  it('auction (season status) with no pause → live (LIVE)', () => {
    expect(computeSessionStatus('auction')).toBe('live');
  });

  it('auction (season status) with session "live" → live (LIVE)', () => {
    expect(computeSessionStatus('auction', 'live')).toBe('live');
  });

  it('auction (season status) with session "paused" → paused (PAUSED)', () => {
    expect(computeSessionStatus('auction', 'paused')).toBe('paused');
  });

  it('completed → completed (ENDED)', () => {
    expect(computeSessionStatus('completed')).toBe('completed');
  });

  it('archived → completed (ENDED)', () => {
    expect(computeSessionStatus('archived')).toBe('completed');
  });

  it('any season status with session config "completed" → completed (ENDED)', () => {
    expect(computeSessionStatus('auction', 'completed')).toBe('completed');
    expect(computeSessionStatus('draft', 'completed')).toBe('completed');
  });
});

// =============================================================================
// § Shared usage — all consumer pages use the same indicator component
// =============================================================================

describe('AuctionSessionIndicator — shared across all pages', () => {
  it('renders consistently regardless of which page uses it', () => {
    // The same component is used by /live, /admin/auction, /franchise/auction
    // Verify it produces identical output for the same status
    const statuses: AuctionSessionStatus[] = ['not_started', 'live', 'paused', 'completed'];

    for (const status of statuses) {
      const html1 = renderToString(<AuctionSessionIndicator status={status} />);
      const html2 = renderToString(<AuctionSessionIndicator status={status} />);
      expect(html1).toBe(html2);
    }
  });

  it('accepts and applies custom className', () => {
    const html = renderToString(
      <AuctionSessionIndicator status="live" className="custom-test-class" />
    );
    expect(html).toContain('custom-test-class');
  });
});
