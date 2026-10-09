// @vitest-environment jsdom
// =============================================================================
// ACC Auction Portal — Test Suite: Guest Draw Immediate Reveal & Floor Coordination
// Verifies that Guest Draw reveal starts immediately (0ms delay), stays visible
// for 3,000 ms, and cleanly updates the floor lot across all four coordinators.
// =============================================================================

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import {
  GuestDrawRevealOverlay,
  resetGuestDrawDeduplicationForTests,
} from '@/components/auction/guest-draw-reveal-overlay';
import { GuestDrawDialog } from '@/components/auction/guest-draw-dialog';
import { AuctionOperatorFloor } from '@/components/auction/auction-operator-floor';
import { FranchiseAuctionFloor } from '@/components/auction/franchise-auction-floor';
import { ProjectorAuctionFloor } from '@/components/auction/projector-auction-floor';
import { LiveAuctionRoomFloor } from '@/components/auction/live-auction-room-floor';
import {
  notifyAuctionDelta,
  resetClockCalibrationForTests,
} from '@/components/auction/auction-realtime-sync';
import type { AuctionLotWithDetails, AuctionSessionState, AuctionConfigDTO } from '@/lib/auction/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

describe('Guest Draw Immediate Start & Floor Coordination Verification', () => {
  const mockLotA: AuctionLotWithDetails = {
    id: 'lot-a',
    season_id: 'season-001',
    registration_id: 'reg-01',
    status: 'in_progress',
    base_price: 20,
    current_price: 100,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    highest_bidder_franchise_id: 'f-1',
    highest_bidder: null,
    draw_number: 1,
    bucket: 'B1',
    round: 1,
    started_at: new Date().toISOString(),
    ended_at: null,
    player: {
      id: 'p-01',
      full_name: 'Existing Floor Player',
      photo_url: null,
    },
    registration: {
      id: 'reg-01',
      programme: 'BTech',
      academic_year: 4,
      branch: 'CSE',
      cricheroes_profile_url: null,
    },
    skills: {
      derived_player_type: 'ALL_ROUNDER',
      is_batter: true,
      experience_years: 3,
    },
  };

  const mockGuestLot: AuctionLotWithDetails = {
    id: 'lot-guest-42',
    season_id: 'season-001',
    registration_id: 'reg-42',
    status: 'in_progress',
    base_price: 50,
    current_price: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    highest_bidder_franchise_id: null,
    highest_bidder: null,
    draw_number: 42,
    bucket: 'B3',
    round: 1,
    started_at: new Date().toISOString(),
    ended_at: null,
    player: {
      id: 'p-42',
      full_name: 'Immediate Guest Star',
      photo_url: null,
    },
    registration: {
      id: 'reg-42',
      programme: 'BTech',
      academic_year: 3,
      branch: 'ECE',
      cricheroes_profile_url: null,
    },
    skills: {
      derived_player_type: 'FAST_BOWLER',
      is_bowler: true,
      experience_years: 2,
    },
  };

  const mockSessionState: AuctionSessionState = {
    seasonId: 'season-001',
    seasonName: 'ACC 2026',
    status: 'live',
    isLive: true,
    isPaused: false,
    isCompleted: false,
    isNotStarted: false,
    startedAt: new Date().toISOString(),
    activeLotId: 'lot-a',
    pausedRemainingSeconds: null,
  };

  const mockConfig: AuctionConfigDTO = {
    firstBidTimerSeconds: 30,
    subsequentBidTimerSeconds: 15,
    minAuctionPurchases: 11,
    maxSquadSize: 15,
    minSquadSize: 11,
    defaultPurse: 1000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    resetGuestDrawDeduplicationForTests();
    resetClockCalibrationForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ===========================================================================
  // 1. IMMEDIATE ANIMATION START IN OVERLAY (ZERO PRE-DELAY)
  // ===========================================================================
  describe('1. Immediate Animation Start (No 3s Delay)', () => {
    it('GuestDrawRevealOverlay renders immediately at T = 0ms upon receiving PLAYER_SELECTED', () => {
      const onCompleteMock = vi.fn();
      render(<GuestDrawRevealOverlay seasonId="season-001" onTransitionComplete={onCompleteMock} />);

      // Realtime event arrives
      act(() => {
        notifyAuctionDelta({
          version: 2,
          type: 'PLAYER_SELECTED',
          seasonId: 'season-001',
          lotId: mockGuestLot.id,
          isGuestDraw: true,
          guestDrawCardNumber: 42,
          guestDrawBucket: 'B3',
          activeLot: mockGuestLot,
        });
      });

      // EXACT T = 0ms: Overlay is ALREADY visible with card back (no 3s delay before starting!)
      expect(screen.getByTestId('guest-draw-reveal-overlay')).toBeDefined();
      expect(screen.getByTestId('guest-draw-card-back')).toBeDefined();
      expect(screen.getByText('CARD #42')).toBeDefined();
      expect(screen.getByText(/REVEALING PLAYER/i)).toBeDefined();

      // At T = 600ms: Card flips to front details
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(screen.getByTestId('guest-draw-card-front')).toBeDefined();
      expect(screen.getByText('Immediate Guest Star')).toBeDefined();

      // At T = 2,900ms: Remains visible
      act(() => {
        vi.advanceTimersByTime(2300);
      });
      expect(screen.getByTestId('guest-draw-reveal-overlay')).toBeDefined();
      expect(onCompleteMock).not.toHaveBeenCalled();

      // At T = 3,000ms: Completes and notifies caller
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(onCompleteMock).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('guest-draw-reveal-overlay')).toBeNull();
    });
  });

  // ===========================================================================
  // 2. IMMEDIATE HANDOFF FROM GUEST DRAW DIALOG
  // ===========================================================================
  describe('2. Immediate Handoff from GuestDrawDialog', () => {
    it('closes GuestDrawDialog immediately when authoritative PLAYER_SELECTED event arrives via realtime', () => {
      const onCloseMock = vi.fn();
      render(
        <GuestDrawDialog
          isOpen={true}
          onClose={onCloseMock}
          seasonId="season-001"
          activeBuckets={['B3']}
        />
      );

      // Realtime event arrives while dialog is open
      act(() => {
        notifyAuctionDelta({
          version: 2,
          type: 'PLAYER_SELECTED',
          seasonId: 'season-001',
          lotId: mockGuestLot.id,
          isGuestDraw: true,
          guestDrawCardNumber: 42,
          guestDrawBucket: 'B3',
          activeLot: mockGuestLot,
        });
      });

      // Dialog must be instructed to close immediately so full-screen overlay takes over!
      expect(onCloseMock).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // 3. FLOOR COORDINATOR TRANSITIONS (ALL 4 SCREENS)
  // ===========================================================================
  describe('3. Synchronized Floor Coordination Across All 4 Screens', () => {
    it('AuctionOperatorFloor coordinates reveal overlay and updates active lot at 3,000 ms', () => {
      render(
        <AuctionOperatorFloor
          seasonId="season-001"
          initialActiveLot={mockLotA}
          initialUpcomingLots={[]}
          initialSessionState={mockSessionState}
          config={mockConfig}
        />
      );

      // Initially shows Lot A
      expect(screen.getByText('Existing Floor Player')).toBeDefined();

      act(() => {
        notifyAuctionDelta({
          version: 2,
          type: 'PLAYER_SELECTED',
          seasonId: 'season-001',
          lotId: mockGuestLot.id,
          isGuestDraw: true,
          guestDrawCardNumber: 42,
          guestDrawBucket: 'B3',
          activeLot: mockGuestLot,
        });
      });

      // Overlay starts immediately
      expect(screen.getByTestId('guest-draw-reveal-overlay')).toBeDefined();

      // Floor card retains Lot A during reveal at 1,500ms
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(screen.getByText('Existing Floor Player')).toBeDefined();

      // At 3,000ms: overlay finishes, floor updates to mockGuestLot
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(screen.queryByTestId('guest-draw-reveal-overlay')).toBeNull();
      expect(screen.getByText('Immediate Guest Star')).toBeDefined();
    });

    it('FranchiseAuctionFloor coordinates reveal overlay and updates active lot at 3,000 ms', () => {
      render(
        <FranchiseAuctionFloor
          seasonId="season-001"
          initialActiveLot={mockLotA}
          initialSessionState={mockSessionState}
          franchise={{
            id: 'f-1',
            name: 'Avanthi Titans',
            shortName: 'AT',
            remainingPurse: 500,
            squadCount: 8,
            maxSquadSize: 15,
            maxPermissibleBid: 200,
          }}
          config={mockConfig}
        />
      );

      expect(screen.getByText('Existing Floor Player')).toBeDefined();

      act(() => {
        notifyAuctionDelta({
          version: 2,
          type: 'PLAYER_SELECTED',
          seasonId: 'season-001',
          lotId: mockGuestLot.id,
          isGuestDraw: true,
          guestDrawCardNumber: 42,
          guestDrawBucket: 'B3',
          activeLot: mockGuestLot,
        });
      });

      expect(screen.getByTestId('guest-draw-reveal-overlay')).toBeDefined();

      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(screen.getByText('Existing Floor Player')).toBeDefined();

      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(screen.queryByTestId('guest-draw-reveal-overlay')).toBeNull();
      expect(screen.getByText('Immediate Guest Star')).toBeDefined();
    });

    it('ProjectorAuctionFloor coordinates reveal overlay and updates active lot at 3,000 ms', () => {
      render(
        <ProjectorAuctionFloor
          seasonId="season-001"
          initialActiveLot={mockLotA}
          initialSessionState={mockSessionState}
          config={mockConfig}
        />
      );

      expect(screen.getByText('Existing Floor Player')).toBeDefined();

      act(() => {
        notifyAuctionDelta({
          version: 2,
          type: 'PLAYER_SELECTED',
          seasonId: 'season-001',
          lotId: mockGuestLot.id,
          isGuestDraw: true,
          guestDrawCardNumber: 42,
          guestDrawBucket: 'B3',
          activeLot: mockGuestLot,
        });
      });

      expect(screen.getByTestId('guest-draw-reveal-overlay')).toBeDefined();

      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(screen.getByText('Existing Floor Player')).toBeDefined();

      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(screen.queryByTestId('guest-draw-reveal-overlay')).toBeNull();
      expect(screen.getByText('Immediate Guest Star')).toBeDefined();
    });

    it('LiveAuctionRoomFloor coordinates reveal overlay and updates active lot at 3,000 ms', () => {
      render(
        <LiveAuctionRoomFloor
          seasonId="season-001"
          initialActiveLot={mockLotA}
          initialSessionState={mockSessionState}
          config={mockConfig}
          franchiseBiddingData={null}
        />
      );

      expect(screen.getByText('Existing Floor Player')).toBeDefined();

      act(() => {
        notifyAuctionDelta({
          version: 2,
          type: 'PLAYER_SELECTED',
          seasonId: 'season-001',
          lotId: mockGuestLot.id,
          isGuestDraw: true,
          guestDrawCardNumber: 42,
          guestDrawBucket: 'B3',
          activeLot: mockGuestLot,
        });
      });

      expect(screen.getByTestId('guest-draw-reveal-overlay')).toBeDefined();

      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(screen.getByText('Existing Floor Player')).toBeDefined();

      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(screen.queryByTestId('guest-draw-reveal-overlay')).toBeNull();
      expect(screen.getByText('Immediate Guest Star')).toBeDefined();
    });
  });

  // ===========================================================================
  // 4. NORMAL NON-GUEST PLAYER PROGRESSION (PRESERVED)
  // ===========================================================================
  describe('4. Normal (Non-Guest) Selection Transitions Immediately', () => {
    it('ProjectorAuctionFloor transitions immediately on non-guest PLAYER_SELECTED when floor is idle', () => {
      const normalNextLot: AuctionLotWithDetails = {
        ...mockLotA,
        id: 'lot-normal-next',
        player: { id: 'p-normal', full_name: 'Normal Next Player', photo_url: null },
      };

      render(
        <ProjectorAuctionFloor
          seasonId="season-001"
          initialActiveLot={null}
          initialSessionState={mockSessionState}
          config={mockConfig}
        />
      );

      act(() => {
        notifyAuctionDelta({
          version: 2,
          type: 'PLAYER_SELECTED',
          seasonId: 'season-001',
          lotId: normalNextLot.id,
          isGuestDraw: false,
          activeLot: normalNextLot,
        });
      });

      // Does NOT show guest overlay and transitions to floor immediately
      expect(screen.queryByTestId('guest-draw-reveal-overlay')).toBeNull();
      expect(screen.getByText('Normal Next Player')).toBeDefined();
    });
  });

  // ===========================================================================
  // 5. SAFETY FALLBACK TIMER IN FLOOR COORDINATORS
  // ===========================================================================
  describe('5. Safety Fallback Timer When Overlay Fails or Unmounts Early', () => {
    it('AuctionOperatorFloor transitions at 3,500ms fallback if onTransitionComplete is delayed or absent', () => {
      // Render floor with initial lot
      render(
        <AuctionOperatorFloor
          seasonId="season-001"
          initialActiveLot={mockLotA}
          initialUpcomingLots={[]}
          initialSessionState={mockSessionState}
          config={mockConfig}
        />
      );

      expect(screen.getByText('Existing Floor Player')).toBeDefined();

      // Send event
      act(() => {
        notifyAuctionDelta({
          version: 2,
          type: 'PLAYER_SELECTED',
          seasonId: 'season-001',
          lotId: mockGuestLot.id,
          isGuestDraw: true,
          guestDrawCardNumber: 42,
          guestDrawBucket: 'B3',
          activeLot: mockGuestLot,
        });
      });

      // At 3,500ms, fallback timer guarantees floor lot is updated even if overlay failed
      act(() => {
        vi.advanceTimersByTime(3500);
      });
      expect(screen.getByText('Immediate Guest Star')).toBeDefined();
    });
  });
});
