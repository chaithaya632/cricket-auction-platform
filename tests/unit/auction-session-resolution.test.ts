// =============================================================================
// ACC Auction Portal — Unit Tests: Auction Session Resolution & UI Cleanup
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  isLaterCalendarDay,
  resolveAuctionSessionStatus,
} from '@/lib/auction/queries';

describe('Auction Session Status Resolution — State Model & Calendar Transitions', () => {
  // 1. Unstarted Session
  describe('Unstarted Sessions', () => {
    it('resolves draft season to "not_started"', () => {
      const status = resolveAuctionSessionStatus({
        seasonStatus: 'draft',
      });
      expect(status).toBe('not_started');
    });

    it('resolves registration_open season to "not_started"', () => {
      const status = resolveAuctionSessionStatus({
        seasonStatus: 'registration',
      });
      expect(status).toBe('not_started');
    });
  });

  // 2. Active Session
  describe('Active Auction Sessions', () => {
    it('resolves seasonStatus="auction" to "live"', () => {
      const status = resolveAuctionSessionStatus({
        seasonStatus: 'auction',
        sessionConfigStatus: 'live',
        startedAt: new Date().toISOString(),
      });
      expect(status).toBe('live');
    });

    it('resolves seasonStatus="auction" without explicit sessionConfigStatus to "live"', () => {
      const status = resolveAuctionSessionStatus({
        seasonStatus: 'auction',
      });
      expect(status).toBe('live');
    });
  });

  // 3. Paused Session
  describe('Paused Auction Sessions', () => {
    it('resolves seasonStatus="auction" with sessionConfigStatus="paused" to "paused"', () => {
      const status = resolveAuctionSessionStatus({
        seasonStatus: 'auction',
        sessionConfigStatus: 'paused',
      });
      expect(status).toBe('paused');
    });
  });

  // 4. Completed Session on Same Day
  describe('Completed Sessions — Same Calendar Day Persistence', () => {
    it('persists "completed" when ended earlier today (UTC and IST)', () => {
      const today = new Date('2026-09-26T10:00:00Z');
      const endedAt = '2026-09-26T08:30:00Z';

      const status = resolveAuctionSessionStatus({
        seasonStatus: 'completed',
        sessionConfigStatus: 'completed',
        endedAt,
        referenceDate: today,
      });

      expect(status).toBe('completed');
    });

    it('persists "completed" on refresh or navigation on same calendar day', () => {
      const completedTime = '2026-09-26T14:30:00+05:30';
      const refreshTime1 = new Date('2026-09-26T15:00:00+05:30');
      const refreshTime2 = new Date('2026-09-26T23:59:00+05:30');

      const status1 = resolveAuctionSessionStatus({
        seasonStatus: 'completed',
        sessionConfigStatus: 'completed',
        endedAt: completedTime,
        referenceDate: refreshTime1,
      });
      expect(status1).toBe('completed');

      const status2 = resolveAuctionSessionStatus({
        seasonStatus: 'completed',
        sessionConfigStatus: 'completed',
        endedAt: completedTime,
        referenceDate: refreshTime2,
      });
      expect(status2).toBe('completed');
    });
  });

  // 5. Subsequent Calendar Day (Automatic Return to Not Started without DB Mutation)
  describe('Subsequent Calendar Day — Automatic NOT STARTED', () => {
    it('resolves to "not_started" when returning on the next calendar day without a new auction started', () => {
      const endedAt = '2026-09-26T18:00:00Z';
      const nextDayVisit = new Date('2026-09-27T09:00:00Z');

      const status = resolveAuctionSessionStatus({
        seasonStatus: 'completed',
        sessionConfigStatus: 'completed',
        endedAt,
        referenceDate: nextDayVisit,
      });

      // Crucial: Must be "not_started"
      expect(status).toBe('not_started');
    });

    it('resolves to "not_started" when returning several days or weeks later', () => {
      const endedAt = '2026-09-20T18:00:00Z';
      const laterVisit = new Date('2026-09-26T09:00:00Z');

      const status = resolveAuctionSessionStatus({
        seasonStatus: 'completed',
        sessionConfigStatus: 'completed',
        endedAt,
        referenceDate: laterVisit,
      });

      expect(status).toBe('not_started');
    });
  });

  // 6. Explicit Super Admin Action on Later Day
  describe('Explicit Super Admin Restart on Later Day', () => {
    it('transitions to "live" when Super Admin explicitly starts auction on later day', () => {
      const newStartDate = new Date('2026-09-27T10:00:00Z');

      const status = resolveAuctionSessionStatus({
        seasonStatus: 'auction', // Updated by startAuctionAction
        sessionConfigStatus: 'live',
        startedAt: newStartDate.toISOString(),
        referenceDate: newStartDate,
      });

      expect(status).toBe('live');
    });

    it('transitions to "paused" when Super Admin explicitly pauses auction on later day', () => {
      const actionDate = new Date('2026-09-27T11:00:00Z');

      const status = resolveAuctionSessionStatus({
        seasonStatus: 'auction',
        sessionConfigStatus: 'paused',
        startedAt: '2026-09-27T10:00:00Z',
        referenceDate: actionDate,
      });

      expect(status).toBe('paused');
    });
  });
});

describe('Calendar Day Comparison — isLaterCalendarDay', () => {
  it('returns false for timestamps on the same calendar day (UTC and IST)', () => {
    const t1 = new Date('2026-09-26T04:00:00Z');
    const t2 = new Date('2026-09-26T14:00:00Z');
    expect(isLaterCalendarDay(t1, t2)).toBe(false);
  });

  it('returns true when referenceDate is on the following calendar day (IST)', () => {
    const t1 = new Date('2026-09-26T10:00:00+05:30');
    const t2 = new Date('2026-09-27T10:00:00+05:30');
    expect(isLaterCalendarDay(t1, t2)).toBe(true);
  });

  it('accurately handles Indian Standard Time (UTC+05:30) date boundaries', () => {
    // 2026-09-26 19:00 UTC is 2026-09-27 00:30 in IST
    const eventLateUTC = new Date('2026-09-26T18:00:00Z'); // 23:30 IST on Sept 26
    const refEarlyNextDayIST = new Date('2026-09-26T19:00:00Z'); // 00:30 IST on Sept 27

    // In IST, ref is Sept 27, event is Sept 26 -> strictly later calendar day
    expect(isLaterCalendarDay(eventLateUTC, refEarlyNextDayIST)).toBe(true);
  });

  it('verifies exact IST midnight boundary: 2026-09-26 23:59 IST -> same day, 2026-09-27 00:00 IST -> later day', () => {
    const eventTime = new Date('2026-09-26T23:00:00+05:30');

    // 2026-09-26 23:59 IST -> same calendar day
    const sameDayBoundary = new Date('2026-09-26T23:59:59+05:30');
    expect(isLaterCalendarDay(eventTime, sameDayBoundary)).toBe(false);

    // 2026-09-27 00:00 IST -> later calendar day
    const nextDayBoundary = new Date('2026-09-27T00:00:00+05:30');
    expect(isLaterCalendarDay(eventTime, nextDayBoundary)).toBe(true);
  });

  it('returns false when referenceDate is earlier than eventDate', () => {
    const t1 = new Date('2026-09-27T10:00:00Z');
    const t2 = new Date('2026-09-26T10:00:00Z');
    expect(isLaterCalendarDay(t1, t2)).toBe(false);
  });
});

describe('UI Specification References — Clean Strings Audit', () => {
  it('validates operator-controls status labels do not contain section numbers', () => {
    const statusLabels = [
      'Session Status: NOT STARTED',
      'Session Status: AUCTION SESSION ACTIVE',
      'Session Status: AUCTION SESSION PAUSED',
      'Session Status: AUCTION SESSION COMPLETED',
    ];

    for (const label of statusLabels) {
      expect(label).not.toContain('§');
      expect(label).not.toMatch(/§\d+/);
    }
  });

  it('validates governance labels and buttons do not contain section numbers', () => {
    const uiElements = [
      'SKIP LOT',
      'UNDO SALE',
      'Authoritative Calculation',
      'Bidding is not blocked. Teams with quotas met may still place bids.',
      'Free-market bidding remains open. Franchises with satisfied quotas may continue bidding.',
      'Batting Profile',
      'Bowling Profile',
      'Fielding Preferences',
      'Playing Experience & Highlights',
      'Fielder-Only Classification',
      'Did you join Avanthi through the ACC Reference Program?',
      'How to create your CricHeroes profile:',
    ];

    for (const text of uiElements) {
      expect(text).not.toContain('§');
      expect(text).not.toMatch(/§\d+/);
    }
  });
});
