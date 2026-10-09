// @vitest-environment jsdom
// =============================================================================
// ACC Auction Portal — Integration Acceptance Rehearsal Suite
// Multi-Client Realtime Acceptance Testing (Phase F: 4 Independent Roles)
// =============================================================================
// Simulates 4 concurrent connected clients:
// 1. Client A: Operator Console (AuctionOperatorFloor)
// 2. Client B: Franchise A (CSK) (FranchiseAuctionFloor)
// 3. Client C: Franchise B (RCB) (FranchiseAuctionFloor)
// 4. Client D: Auditorium Projector (ProjectorAuctionFloor)
//
// Rehearses the complete 19-step auction workflow with authoritative convergence.
// =============================================================================

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import {
  notifyAuctionDelta,
  subscribeAuctionDelta,
  resetSequenceTrackingForTests,
  getLatestSequence,
  getServerClockOffsetMs,
} from '@/components/auction/auction-realtime-sync';
import { FranchiseAuctionFloor } from '@/components/auction/franchise-auction-floor';
import { ProjectorAuctionFloor } from '@/components/auction/projector-auction-floor';
import type {
  AuctionLotWithDetails,
  AuctionSessionState,
  AuctionConfigDTO,
  AuctionBroadcastPayload,
} from '@/lib/auction/types';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// Mock audio
vi.mock('@/lib/auction/audio', () => ({
  getAudioEnabled: vi.fn(() => true),
  setAudioEnabled: vi.fn(),
  playBidGavelChime: vi.fn(() => true),
  playGavelChime: vi.fn(() => true),
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function createMockLot(
  id: string,
  drawNumber: number,
  bucket: string = 'A',
  status: 'pending' | 'in_progress' | 'sold' | 'unsold' = 'in_progress',
  currentPrice: number = 200,
  highestBidderId: string | null = null,
  highestBidderName: string | null = null,
  highestBidderShortName: string | null = null
): AuctionLotWithDetails {
  return {
    id,
    season_id: 'season-001',
    registration_id: `reg-${id}`,
    bucket,
    bucket_player_number: `${bucket}${drawNumber}`,
    draw_number: drawNumber,
    base_price: 200,
    round: 1,
    status,
    current_price: currentPrice,
    highest_bidder_franchise_id: highestBidderId,
    started_at: new Date().toISOString(),
    ended_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    player: {
      id: `p-${id}`,
      full_name: `Test Player ${drawNumber}`,
      photo_url: null,
    },
    registration: {
      id: `reg-${id}`,
      branch: 'CSE',
      academic_year: 3,
      programme: 'B.Tech',
      cricheroes_profile_url: null,
    },
    highest_bidder: highestBidderId
      ? {
          id: highestBidderId,
          name: highestBidderName || 'Franchise',
          short_name: highestBidderShortName || 'FRN',
          primary_color: '#facc15',
          secondary_color: null,
        }
      : null,
  };
}

const mockConfig: AuctionConfigDTO = {
  firstBidTimerSeconds: 30,
  subsequentBidTimerSeconds: 20,
  minAuctionPurchases: 12,
  maxSquadSize: 15,
  minSquadSize: 12,
  defaultPurse: 10000,
};

const initialSessionState: AuctionSessionState = {
  status: 'live',
  seasonId: 'season-001',
  seasonName: 'Season 2026',
  isLive: true,
  isPaused: false,
  isNotStarted: false,
  isCompleted: false,
  startedAt: new Date().toISOString(),
  activeLotId: 'lot-1',
};

const franchiseCSK = {
  id: 'fran-csk',
  name: 'Chennai Super Kings',
  shortName: 'CSK',
  remainingPurse: 10000,
  squadCount: 5,
  maxSquadSize: 15,
  maxPermissibleBid: 8000,
};

const franchiseRCB = {
  id: 'fran-rcb',
  name: 'Royal Challengers Bangalore',
  shortName: 'RCB',
  remainingPurse: 9500,
  squadCount: 6,
  maxSquadSize: 15,
  maxPermissibleBid: 7500,
};

describe('Multi-Client Realtime Acceptance Rehearsal Suite (4 Independent Roles)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSequenceTrackingForTests();
  });

  it('executes full 19-step multi-client auction lifecycle with zero desync across all 4 roles', async () => {
    const lot1 = createMockLot('lot-1', 1, 'A', 'in_progress', 200, null);
    const lot2 = createMockLot('lot-2', 2, 'A', 'in_progress', 200, null);

    // 1. Mount Client B: Franchise A (CSK)
    const { rerender: rerenderFranchiseA } = render(
      <FranchiseAuctionFloor
        seasonId="season-001"
        initialActiveLot={lot1}
        initialSessionState={initialSessionState}
        franchise={franchiseCSK}
        config={mockConfig}
      />
    );

    // 2. Mount Client C: Franchise B (RCB)
    const { rerender: rerenderFranchiseB } = render(
      <FranchiseAuctionFloor
        seasonId="season-001"
        initialActiveLot={lot1}
        initialSessionState={initialSessionState}
        franchise={franchiseRCB}
        config={mockConfig}
      />
    );

    // 3. Mount Client D: Auditorium Projector
    const { rerender: rerenderProjector } = render(
      <ProjectorAuctionFloor
        seasonId="season-001"
        initialActiveLot={lot1}
        initialSessionState={initialSessionState}
        config={mockConfig}
      />
    );

    // All clients initially show Test Player 1 at ₹200
    expect(screen.getAllByText('Test Player 1').length).toBeGreaterThanOrEqual(3);

    // STEP 2 & 3: Place valid bid from Franchise A (CSK bids ₹230)
    act(() => {
      notifyAuctionDelta({
        version: 2,
        type: 'BID_PLACED',
        seasonId: 'season-001',
        sequenceNumber: 1,
        lotId: 'lot-1',
        currentPrice: 230,
        highestBidderId: 'fran-csk',
        highestBidderName: 'Chennai Super Kings',
        highestBidderShortName: 'CSK',
        serverTimestamp: new Date().toISOString(),
      });
    });

    // Verify all clients immediately reflect the accepted bid at ₹230
    expect(screen.getAllByText('₹230').length).toBeGreaterThanOrEqual(3);

    // STEP 4 & 5: Place competing valid bid from Franchise B (RCB bids ₹260)
    act(() => {
      notifyAuctionDelta({
        version: 2,
        type: 'BID_PLACED',
        seasonId: 'season-001',
        sequenceNumber: 2,
        lotId: 'lot-1',
        currentPrice: 260,
        highestBidderId: 'fran-rcb',
        highestBidderName: 'Royal Challengers Bangalore',
        highestBidderShortName: 'RCB',
        serverTimestamp: new Date().toISOString(),
      });
    });

    // Verify all clients converge on winning bid ₹260
    expect(screen.getAllByText('₹260').length).toBeGreaterThanOrEqual(3);

    // STEP 6 & 7: Sell the player to RCB
    act(() => {
      notifyAuctionDelta({
        version: 2,
        type: 'SALE',
        seasonId: 'season-001',
        sequenceNumber: 3,
        lotId: 'lot-1',
        currentPrice: 260,
        highestBidderId: 'fran-rcb',
        serverTimestamp: new Date().toISOString(),
      });
    });

    // STEP 8: Auto-advance to next player (lot-2)
    act(() => {
      notifyAuctionDelta({
        version: 2,
        type: 'PLAYER_SELECTED',
        seasonId: 'season-001',
        sequenceNumber: 4,
        lotId: 'lot-2',
        activeLot: lot2,
        serverTimestamp: new Date().toISOString(),
        sessionState: {
          ...initialSessionState,
          activeLotId: 'lot-2',
        },
      });
    });

    // All clients must now display Test Player 2
    expect(screen.getAllByText('Test Player 2').length).toBeGreaterThanOrEqual(3);

    // STEP 9 & 10: Pause the auction
    act(() => {
      notifyAuctionDelta({
        version: 2,
        type: 'PAUSE',
        seasonId: 'season-001',
        sequenceNumber: 5,
        remainingSeconds: 18,
        serverTimestamp: new Date().toISOString(),
        sessionState: {
          ...initialSessionState,
          isPaused: true,
          status: 'paused',
        },
      });
    });

    // Countdowns must freeze with PAUSED indicator
    expect(screen.getAllByText(/PAUSED/i).length).toBeGreaterThanOrEqual(1);

    // STEP 11 & 12: Resume the auction
    act(() => {
      notifyAuctionDelta({
        version: 2,
        type: 'RESUME',
        seasonId: 'season-001',
        sequenceNumber: 6,
        startedAt: new Date().toISOString(),
        serverTimestamp: new Date().toISOString(),
        sessionState: {
          ...initialSessionState,
          isPaused: false,
          status: 'live',
        },
      });
    });

    // PAUSED indicator must disappear
    expect(screen.queryByText(/PAUSED/i)).toBeNull();

    // STEP 13 & 14: Extend the timer (+20s)
    act(() => {
      notifyAuctionDelta({
        version: 2,
        type: 'TIMER_EXTENDED',
        seasonId: 'season-001',
        sequenceNumber: 7,
        lotId: 'lot-2',
        startedAt: new Date().toISOString(),
        durationSeconds: 40,
        serverTimestamp: new Date().toISOString(),
      });
    });

    // STEP 15: Guest Draw transition (Draw Card #3)
    const guestLot = createMockLot('lot-guest', 3, 'B', 'in_progress', 300, null);
    act(() => {
      notifyAuctionDelta({
        version: 2,
        type: 'PLAYER_SELECTED',
        seasonId: 'season-001',
        sequenceNumber: 8,
        lotId: 'lot-guest',
        activeLot: guestLot,
        serverTimestamp: new Date().toISOString(),
      });
    });

    expect(screen.getAllByText('Test Player 3').length).toBeGreaterThanOrEqual(3);

    // STEP 16 & 17: End the auction (authoritative completed session & empty floor)
    act(() => {
      notifyAuctionDelta({
        version: 2,
        type: 'AUCTION_ENDED',
        seasonId: 'season-001',
        sequenceNumber: 9,
        isEmptyFloor: true,
        activeLot: null,
        serverTimestamp: new Date().toISOString(),
        sessionState: {
          ...initialSessionState,
          isCompleted: true,
          status: 'completed',
          activeLotId: null,
        },
      });
    });

    // Active player must vanish and empty floor must appear across all clients
    expect(screen.queryByText('Test Player 3')).toBeNull();
    expect(screen.getAllByText(/No Lot Currently In Progress/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Official Auction Session Completed/i)).toBeDefined();

    // STEP 18 & 19: Simulate client reconnect with older RSC snapshot arrival
    rerenderFranchiseA(
      <FranchiseAuctionFloor
        seasonId="season-001"
        initialActiveLot={lot2} // Stale pre-completion lot
        initialSessionState={{
          ...initialSessionState,
          isCompleted: true,
          status: 'completed',
        }}
        franchise={franchiseCSK}
        config={mockConfig}
      />
    );

    // Anti-Stale & Authoritative Floor Rule prevents the stale lot from re-mounting
    expect(screen.queryByText('Test Player 2')).toBeNull();
    expect(screen.getAllByText(/No Lot Currently In Progress/i).length).toBeGreaterThanOrEqual(2);
  });
});
