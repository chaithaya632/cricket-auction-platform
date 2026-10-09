// @vitest-environment jsdom
// =============================================================================
// ACC Auction Portal — Unit & Integration Test Suite
// Global Realtime Synchronization (Operator, Franchise, Projector, Live View)
// =============================================================================

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import {
  notifyAuctionDelta,
  subscribeAuctionDelta,
  getLatestSequence,
  setLatestSequence,
  resetSequenceTrackingForTests,
  getServerClockOffsetMs,
  getCalibratedNow,
  setServerClockOffsetForTests,
  resetClockCalibrationForTests,
} from '@/components/auction/auction-realtime-sync';
import { FranchiseAuctionFloor } from '@/components/auction/franchise-auction-floor';
import { ProjectorAuctionFloor } from '@/components/auction/projector-auction-floor';
import { LiveAuctionRoomFloor } from '@/components/auction/live-auction-room-floor';
import { BiddingControl } from '@/components/auction/bidding-control';
import { AuctionTimer } from '@/components/auction/auction-timer';
import { broadcastAuctionUpdate } from '@/lib/auction/realtime';
import * as supabaseAdmin from '@/lib/supabase/admin';
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
  highestBidderId: string | null = null
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
          name: 'Chennai Super Kings',
          short_name: 'CSK',
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

const mockInitialSession: AuctionSessionState = {
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

const mockFranchise = {
  id: 'fran-csk',
  name: 'Chennai Super Kings',
  shortName: 'CSK',
  remainingPurse: 10000,
  squadCount: 5,
  maxSquadSize: 15,
  maxPermissibleBid: 8000,
};

describe('ACC Auction — Global Realtime Synchronization Hotfix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSequenceTrackingForTests();
  });

  describe('1. Version 2 Broadcast Payload Contract & httpSend Dispatch', () => {
    it('dispatches version 2 broadcast payloads via direct httpSend to bypass WebSocket latency', async () => {
      const mockHttpSend = vi.fn().mockResolvedValue('ok');
      const mockChannel = {
        httpSend: mockHttpSend,
        send: vi.fn(),
      };
      const mockAdminClient = {
        channel: vi.fn(() => mockChannel),
        removeChannel: vi.fn(),
      };

      vi.spyOn(supabaseAdmin, 'createAdminClient').mockReturnValue(mockAdminClient as any);

      await broadcastAuctionUpdate('season-001', 'BID_PLACED', {
        sequenceNumber: 105,
        lotId: 'lot-1',
        currentPrice: 250,
        highestBidderId: 'fran-rcb',
      });

      expect(mockAdminClient.channel).toHaveBeenCalledWith('acc-auction-season-001');
      expect(mockHttpSend).toHaveBeenCalledWith('auction_update', expect.objectContaining({
        version: 2,
        type: 'BID_PLACED',
        sequenceNumber: 105,
        currentPrice: 250,
      }));
      expect(mockAdminClient.removeChannel).toHaveBeenCalledWith(mockChannel);
    });
  });

  describe('2. Monotonic Sequence Deduplication & Stale Packet Protection', () => {
    it('accepts strictly monotonically increasing event sequence numbers', () => {
      const listener = vi.fn();
      const unsubscribe = subscribeAuctionDelta(listener);

      const event1: AuctionBroadcastPayload = {
        version: 2,
        type: 'BID_PLACED',
        seasonId: 'season-001',
        sequenceNumber: 10,
        currentPrice: 220,
      };

      const event2: AuctionBroadcastPayload = {
        version: 2,
        type: 'BID_PLACED',
        seasonId: 'season-001',
        sequenceNumber: 11,
        currentPrice: 240,
      };

      const accepted1 = notifyAuctionDelta(event1);
      const accepted2 = notifyAuctionDelta(event2);

      expect(accepted1).toBe(true);
      expect(accepted2).toBe(true);
      expect(listener).toHaveBeenCalledTimes(2);
      expect(getLatestSequence('season-001')).toBe(11);

      unsubscribe();
    });

    it('rejects stale or duplicate out-of-order event sequence numbers', () => {
      const listener = vi.fn();
      const unsubscribe = subscribeAuctionDelta(listener);

      setLatestSequence('season-001', 50);

      const duplicateEvent: AuctionBroadcastPayload = {
        version: 2,
        type: 'BID_PLACED',
        seasonId: 'season-001',
        sequenceNumber: 50,
        currentPrice: 240,
      };

      const staleEvent: AuctionBroadcastPayload = {
        version: 2,
        type: 'BID_PLACED',
        seasonId: 'season-001',
        sequenceNumber: 49,
        currentPrice: 220,
      };

      const acceptedDup = notifyAuctionDelta(duplicateEvent);
      const acceptedStale = notifyAuctionDelta(staleEvent);

      expect(acceptedDup).toBe(false);
      expect(acceptedStale).toBe(false);
      expect(listener).not.toHaveBeenCalled();
      expect(getLatestSequence('season-001')).toBe(50);

      unsubscribe();
    });
  });

  describe('3. Franchise Auction Floor Instant Convergence', () => {
    it('instantly reflects competing bids without waiting for router.refresh', async () => {
      const initialLot = createMockLot('lot-1', 1, 'A', 'in_progress', 200, null);

      render(
        <FranchiseAuctionFloor
          seasonId="season-001"
          initialActiveLot={initialLot}
          initialSessionState={mockInitialSession}
          franchise={mockFranchise}
          config={mockConfig}
        />
      );

      expect(screen.getByText('Test Player 1')).toBeDefined();
      expect(screen.getByText('₹200')).toBeDefined();

      // Competing franchise places bid of ₹250
      act(() => {
        notifyAuctionDelta({
          version: 2,
          type: 'BID_PLACED',
          seasonId: 'season-001',
          sequenceNumber: 1,
          lotId: 'lot-1',
          currentPrice: 250,
          highestBidderId: 'fran-mi',
          highestBidderName: 'Mumbai Indians',
        });
      });

      // Price must immediately update to ₹250 on the franchise floor
      expect(screen.getByText('₹250')).toBeDefined();
    });

    it('instantly advances to next player when PLAYER_SELECTED arrives', async () => {
      const lot1 = createMockLot('lot-1', 1, 'A', 'in_progress', 200, null);
      const lot2 = createMockLot('lot-2', 2, 'A', 'in_progress', 200, null);

      render(
        <FranchiseAuctionFloor
          seasonId="season-001"
          initialActiveLot={lot1}
          initialSessionState={mockInitialSession}
          franchise={mockFranchise}
          config={mockConfig}
        />
      );

      expect(screen.getByText('Test Player 1')).toBeDefined();

      act(() => {
        notifyAuctionDelta({
          version: 2,
          type: 'PLAYER_SELECTED',
          seasonId: 'season-001',
          sequenceNumber: 2,
          lotId: 'lot-2',
          activeLot: lot2,
          sessionState: {
            ...mockInitialSession,
            activeLotId: 'lot-2',
          },
        });
      });

      expect(screen.getByText('Test Player 2')).toBeDefined();
    });

    it('instantly displays Empty Floor when AUCTION_ENDED arrives', async () => {
      const lot1 = createMockLot('lot-1', 1, 'A', 'in_progress', 200, null);

      render(
        <FranchiseAuctionFloor
          seasonId="season-001"
          initialActiveLot={lot1}
          initialSessionState={mockInitialSession}
          franchise={mockFranchise}
          config={mockConfig}
        />
      );

      expect(screen.getByText('Test Player 1')).toBeDefined();

      act(() => {
        notifyAuctionDelta({
          version: 2,
          type: 'AUCTION_ENDED',
          seasonId: 'season-001',
          sequenceNumber: 3,
          isEmptyFloor: true,
          activeLot: null,
          sessionState: {
            ...mockInitialSession,
            status: 'completed',
            activeLotId: null,
          },
        });
      });

      // Player 1 must disappear from active floor
      expect(screen.queryByText('Test Player 1')).toBeNull();
      expect(screen.getByText(/No Lot Currently In Progress/i)).toBeDefined();
    });
  });

  describe('4. Projector Auction Floor Instant Convergence', () => {
    it('instantly clears active lot and shows completed state on AUCTION_ENDED', () => {
      const lot1 = createMockLot('lot-1', 1, 'A', 'in_progress', 200, null);

      render(
        <ProjectorAuctionFloor
          seasonId="season-001"
          initialActiveLot={lot1}
          initialSessionState={mockInitialSession}
          config={mockConfig}
        />
      );

      expect(screen.getByText('Test Player 1')).toBeDefined();

      act(() => {
        notifyAuctionDelta({
          version: 2,
          type: 'AUCTION_ENDED',
          seasonId: 'season-001',
          sequenceNumber: 10,
          isEmptyFloor: true,
          activeLot: null,
          sessionState: {
            ...mockInitialSession,
            isCompleted: true,
            status: 'completed',
            activeLotId: null,
          },
        });
      });

      expect(screen.queryByText('Test Player 1')).toBeNull();
      expect(screen.getByText(/Official Auction Session Completed/i)).toBeDefined();
    });

    it('instantly pauses and resumes projector stage timer via broadcast delta', () => {
      const lot1 = createMockLot('lot-1', 1, 'A', 'in_progress', 200, null);

      render(
        <ProjectorAuctionFloor
          seasonId="season-001"
          initialActiveLot={lot1}
          initialSessionState={mockInitialSession}
          config={mockConfig}
        />
      );

      // Send PAUSE broadcast delta
      act(() => {
        notifyAuctionDelta({
          version: 2,
          type: 'PAUSE',
          seasonId: 'season-001',
          sequenceNumber: 11,
          sessionState: {
            ...mockInitialSession,
            isPaused: true,
          },
        });
      });

      expect(screen.getByText(/PAUSED/i)).toBeDefined();

      // Send RESUME broadcast delta
      act(() => {
        notifyAuctionDelta({
          version: 2,
          type: 'RESUME',
          seasonId: 'season-001',
          sequenceNumber: 12,
          sessionState: {
            ...mockInitialSession,
            isPaused: false,
          },
        });
      });

      expect(screen.queryByText(/PAUSED/i)).toBeNull();
    });
  });

  describe('5. Bidding Control Immediate Increment & Highest Bidder State', () => {
    it('recalculates next legal bid instantly when a competing bid is broadcasted', () => {
      const lot = createMockLot('lot-1', 1, 'A', 'in_progress', 200, null);

      render(
        <BiddingControl
          lot={lot}
          franchise={mockFranchise}
        />
      );

      // Current price is 200, next legal bid is 230
      const bidButton = screen.getByRole('button', { name: /Place Bid for ₹230/i });
      expect(bidButton).toBeDefined();

      // Competing franchise bids 230
      act(() => {
        notifyAuctionDelta({
          version: 2,
          type: 'BID_PLACED',
          seasonId: 'season-001',
          sequenceNumber: 15,
          lotId: 'lot-1',
          currentPrice: 230,
          highestBidderId: 'fran-rcb',
        });
      });

      // Next bid should automatically recalculate to ₹260 (230 + 30)
      expect(screen.getByRole('button', { name: /Place Bid for ₹260/i })).toBeDefined();

      // If CSK bids 260 and becomes highest bidder
      act(() => {
        notifyAuctionDelta({
          version: 2,
          type: 'BID_PLACED',
          seasonId: 'season-001',
          sequenceNumber: 16,
          lotId: 'lot-1',
          currentPrice: 260,
          highestBidderId: 'fran-csk',
        });
      });

      // Button should now show "Leading Bidder" and be disabled
      expect(screen.getByText(/Leading Bidder/i)).toBeDefined();
      expect(screen.getByText(/Your franchise currently holds the highest bid/i)).toBeDefined();
      expect(screen.getByRole('button')).toHaveProperty('disabled', true);
    });
  });

  describe('6. Anti-Stale RSC Guard Invariants (Race Condition Immunity)', () => {
    it('prevents older RSC snapshots from downgrading an in-memory price update', () => {
      const initialLot = createMockLot('lot-1', 1, 'A', 'in_progress', 200, null);

      const { rerender } = render(
        <FranchiseAuctionFloor
          seasonId="season-001"
          initialActiveLot={initialLot}
          initialSessionState={mockInitialSession}
          franchise={mockFranchise}
          config={mockConfig}
        />
      );

      // In-memory delta arrives: price rises to ₹300
      act(() => {
        notifyAuctionDelta({
          version: 2,
          type: 'BID_PLACED',
          seasonId: 'season-001',
          sequenceNumber: 20,
          lotId: 'lot-1',
          currentPrice: 300,
          highestBidderId: 'fran-rcb',
        });
      });

      expect(screen.getByText('₹300')).toBeDefined();

      // Later, a delayed RSC re-render delivers the older snapshot (₹200)
      const staleRscLot = createMockLot('lot-1', 1, 'A', 'in_progress', 200, null);
      rerender(
        <FranchiseAuctionFloor
          seasonId="season-001"
          initialActiveLot={staleRscLot}
          initialSessionState={mockInitialSession}
          franchise={mockFranchise}
          config={mockConfig}
        />
      );

      // The Anti-Stale RSC Guard MUST reject the older snapshot and preserve ₹300!
      expect(screen.getByText('₹300')).toBeDefined();
    });

    it('prevents older RSC snapshots from regressing a sold player back to in_progress', () => {
      const initialLot = createMockLot('lot-1', 1, 'A', 'in_progress', 200, null);

      const { rerender } = render(
        <FranchiseAuctionFloor
          seasonId="season-001"
          initialActiveLot={initialLot}
          initialSessionState={mockInitialSession}
          franchise={mockFranchise}
          config={mockConfig}
        />
      );

      // Broadcast arrives: player SOLD
      act(() => {
        notifyAuctionDelta({
          version: 2,
          type: 'SALE',
          seasonId: 'season-001',
          sequenceNumber: 21,
          lotId: 'lot-1',
          currentPrice: 500,
        });
      });

      // Older RSC arrives with lot still 'in_progress'
      const staleRscLot = createMockLot('lot-1', 1, 'A', 'in_progress', 200, null);
      rerender(
        <FranchiseAuctionFloor
          seasonId="season-001"
          initialActiveLot={staleRscLot}
          initialSessionState={mockInitialSession}
          franchise={mockFranchise}
          config={mockConfig}
        />
      );

      // Status must not regress
      expect(screen.queryByText('in_progress')).toBeNull();
    });
  });

  describe('7. Server Clock Skew Calibration & Zero-Drift Timer Synchronization', () => {
    it('calibrates client clock offset from authoritative server timestamps', () => {
      resetClockCalibrationForTests();

      // Simulate client clock that is 3 seconds BEHIND server time
      const realNow = Date.now();
      const serverAnchorTime = new Date(realNow + 3000).toISOString();

      notifyAuctionDelta({
        version: 2,
        type: 'BID_PLACED',
        seasonId: 'season-001',
        sequenceNumber: 30,
        serverTimestamp: serverAnchorTime,
      });

      // Offset must calibrate to approximately +3000ms
      const offset = getServerClockOffsetMs();
      expect(offset).toBeGreaterThanOrEqual(2900);
      expect(offset).toBeLessThanOrEqual(3100);
    });

    it('calculates countdown accurately using calibrated server time', () => {
      // Simulate client clock with 5000ms positive offset
      setServerClockOffsetForTests(5000);

      // Lot started 10s ago in server time. Duration = 30s. Remaining should be exactly 20s.
      const serverStartedAt = new Date(Date.now() + 5000 - 10000).toISOString();

      render(
        <AuctionTimer
          startedAt={serverStartedAt}
          durationSeconds={30}
          isActive={true}
          isPaused={false}
        />
      );

      // With 5s offset calibrated, remaining must be exactly 20s (not 25s or 15s)
      expect(screen.getByText('20s')).toBeDefined();
    });
  });

  describe('8. Sequence Gap Detection & Background Reconciliation', () => {
    it('detects missing sequence numbers and triggers background reconciliation', () => {
      const listener = vi.fn();
      const unsubscribe = subscribeAuctionDelta(listener);

      setLatestSequence('season-001', 5);

      // Packet arrives with sequenceNumber = 8 (missed 6 and 7!)
      const gapPayload: AuctionBroadcastPayload = {
        version: 2,
        type: 'BID_PLACED',
        seasonId: 'season-001',
        sequenceNumber: 8,
        currentPrice: 400,
      };

      const accepted = notifyAuctionDelta(gapPayload);

      // The new authoritative packet must still be accepted
      expect(accepted).toBe(true);
      expect(getLatestSequence('season-001')).toBe(8);
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ sequenceNumber: 8 }));

      unsubscribe();
    });
  });
});
