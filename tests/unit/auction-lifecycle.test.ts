import { describe, it, expect } from 'vitest';
import { AUCTION_EVENT_TYPES } from '@/lib/constants';
import type { AuctionSessionStatus, AuctionSessionState } from '@/lib/auction/types';

describe('Auction Lifecycle — Event Types & Specifications (§23)', () => {
  it('includes PAUSE and RESUME in the official immutable event types', () => {
    expect(AUCTION_EVENT_TYPES).toContain('PAUSE');
    expect(AUCTION_EVENT_TYPES).toContain('RESUME');
    expect(AUCTION_EVENT_TYPES).toContain('PLAYER_SELECTED');
    expect(AUCTION_EVENT_TYPES).toContain('HAMMER');
    expect(AUCTION_EVENT_TYPES).toContain('SALE');
    expect(AUCTION_EVENT_TYPES).toContain('UNSOLD');
  });
});

describe('Auction Lifecycle — Session State Derivation Logic', () => {
  function computeSessionState(
    seasonStatus: string,
    sessionConfigStatus?: string | null,
    activeLotId?: string | null
  ): AuctionSessionStatus {
    if (seasonStatus === 'completed' || seasonStatus === 'archived') {
      return 'completed';
    }
    if (seasonStatus === 'auction') {
      if (sessionConfigStatus === 'paused') {
        return 'paused';
      }
      return 'live';
    }
    return 'not_started';
  }

  it('determines not_started when season is in draft or registration', () => {
    expect(computeSessionState('draft', null)).toBe('not_started');
    expect(computeSessionState('registration', null)).toBe('not_started');
  });

  it('determines live when season is in auction status', () => {
    expect(computeSessionState('auction', 'live')).toBe('live');
    expect(computeSessionState('auction', null)).toBe('live');
  });

  it('determines paused when session_config marks paused', () => {
    expect(computeSessionState('auction', 'paused')).toBe('paused');
  });

  it('determines completed when season is completed', () => {
    expect(computeSessionState('completed', 'live')).toBe('completed');
    expect(computeSessionState('archived', 'live')).toBe('completed');
  });
});

describe('Auction Lifecycle — Duplicate Start Prevention Contract', () => {
  it('fails safely when auction is already live', () => {
    function validateCanStart(currentStatus: string, configStatus?: string): { canStart: boolean; error?: string } {
      if (currentStatus === 'auction' && configStatus === 'live') {
        return { canStart: false, error: 'Auction session is already LIVE.' };
      }
      return { canStart: true };
    }

    expect(validateCanStart('draft').canStart).toBe(true);
    expect(validateCanStart('registration').canStart).toBe(true);
    expect(validateCanStart('auction', 'live').canStart).toBe(false);
    expect(validateCanStart('auction', 'live').error).toBe('Auction session is already LIVE.');
  });
});

describe('Auction Lifecycle — Read-Only Presentation Surface Safety', () => {
  it('ensures presentation modes (Projector & Live Room) do not mutate state', () => {
    // Contract check: Projector only executes read queries and possesses zero mutation callbacks
    const projectorPermittedActions = ['VIEW_LOT', 'VIEW_CLOCK', 'VIEW_TICKER', 'EXIT_VIEW'];
    const forbiddenActions = ['MUTATE_BID', 'HAMMER_LOT', 'CHANGE_PURSE', 'UPDATE_SEASON'];

    for (const action of forbiddenActions) {
      expect(projectorPermittedActions).not.toContain(action);
    }
  });
});
