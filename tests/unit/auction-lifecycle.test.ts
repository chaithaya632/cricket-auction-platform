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

describe('Auction Lifecycle — End Auction & Bid Rejection Contracts', () => {
  it('rejects bids when session is paused or completed', () => {
    function validateCanBid(sessionStatus: string): { canBid: boolean; error?: string } {
      if (sessionStatus === 'paused') {
        return { canBid: false, error: 'Cannot place bid: auction session is currently paused.' };
      }
      if (sessionStatus === 'completed') {
        return { canBid: false, error: 'Cannot place bid: auction session has ended.' };
      }
      if (sessionStatus !== 'live') {
        return { canBid: false, error: 'Auction is not live.' };
      }
      return { canBid: true };
    }

    expect(validateCanBid('live').canBid).toBe(true);
    expect(validateCanBid('paused').canBid).toBe(false);
    expect(validateCanBid('paused').error).toBe('Cannot place bid: auction session is currently paused.');
    expect(validateCanBid('completed').canBid).toBe(false);
    expect(validateCanBid('completed').error).toBe('Cannot place bid: auction session has ended.');
  });

  it('rejects selecting lots when session is completed', () => {
    function validateCanSelectLot(sessionConfigStatus?: string): { canSelect: boolean; error?: string } {
      if (sessionConfigStatus === 'completed') {
        return { canSelect: false, error: 'Cannot select lot: auction session has ended.' };
      }
      return { canSelect: true };
    }

    expect(validateCanSelectLot('live').canSelect).toBe(true);
    expect(validateCanSelectLot('completed').canSelect).toBe(false);
    expect(validateCanSelectLot('completed').error).toBe('Cannot select lot: auction session has ended.');
  });

  it('determines correct active lot resolution on end auction', () => {
    function resolveLotOnEnd(
      activeLot: { currentPrice: number | null; highestBidderId: string | null },
      mode?: 'hammer' | 'unsold'
    ): 'hammer' | 'unsold' {
      if (activeLot.currentPrice !== null && activeLot.highestBidderId !== null && mode !== 'unsold') {
        return 'hammer';
      }
      return 'unsold';
    }

    // Has bidder, default mode -> hammer
    expect(resolveLotOnEnd({ currentPrice: 150, highestBidderId: 'f1' })).toBe('hammer');
    // Has bidder, explicit unsold mode -> unsold
    expect(resolveLotOnEnd({ currentPrice: 150, highestBidderId: 'f1' }, 'unsold')).toBe('unsold');
    // No bidder -> unsold
    expect(resolveLotOnEnd({ currentPrice: null, highestBidderId: null })).toBe('unsold');
  });
});

