// @vitest-environment jsdom
// =============================================================================
// ACC Auction Portal — Test Suite: Production Hotfix Verification
// Bug: Guest Draw Popup & Sold/Unsold Hammer Animations Runtime Execution
// =============================================================================

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import {
  GuestDrawRevealOverlay,
  resetGuestDrawDeduplicationForTests,
} from '@/components/auction/guest-draw-reveal-overlay';
import {
  AuctionHammerStamp,
  resetHammerAnimationDeduplicationForTests,
} from '@/components/auction/auction-hammer-stamp';
import { ActiveLotCard } from '@/components/auction/active-lot-card';
import { AuctionOperatorFloor } from '@/components/auction/auction-operator-floor';
import { FranchiseAuctionFloor } from '@/components/auction/franchise-auction-floor';
import { ProjectorAuctionFloor } from '@/components/auction/projector-auction-floor';
import { LiveAuctionRoomFloor } from '@/components/auction/live-auction-room-floor';
import {
  notifyAuctionDelta,
  resetClockCalibrationForTests,
  setServerClockOffsetForTests,
} from '@/components/auction/auction-realtime-sync';
import type { AuctionLotWithDetails, AuctionSessionState, AuctionConfigDTO } from '@/lib/auction/types';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

describe('Hotfix Verification: Guest Draw Popup & Hammer Runtime Execution', () => {
  const mockLotA: AuctionLotWithDetails = {
    id: 'lot-a',
    season_id: 'season-001',
    registration_id: 'reg-01',
    status: 'in_progress',
    base_price: 20,
    current_price: 150,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    highest_bidder_franchise_id: 'f-titans',
    highest_bidder: {
      id: 'f-titans',
      name: 'Avanthi Titans',
      short_name: 'AT',
      primary_color: '#10b981',
      secondary_color: null,
    },
    draw_number: 1,
    bucket: 'B1',
    round: 1,
    started_at: new Date().toISOString(),
    ended_at: null,
    player: {
      id: 'p-01',
      full_name: 'Player One',
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

  const mockLotB: AuctionLotWithDetails = {
    id: 'lot-b',
    season_id: 'season-001',
    registration_id: 'reg-02',
    status: 'in_progress',
    base_price: 30,
    current_price: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    highest_bidder_franchise_id: null,
    highest_bidder: null,
    draw_number: 2,
    bucket: 'B1',
    round: 1,
    started_at: new Date().toISOString(),
    ended_at: null,
    player: {
      id: 'p-02',
      full_name: 'Player Two',
      photo_url: null,
    },
    registration: {
      id: 'reg-02',
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
    resetHammerAnimationDeduplicationForTests();
    resetGuestDrawDeduplicationForTests();
    resetClockCalibrationForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ===========================================================================
  // 1. CLOCK SKEW RESILIENCE
  // ===========================================================================
  describe('1. Clock Skew Resilience in GuestDrawRevealOverlay', () => {
    it('accepts live Guest Draw event when client local clock is 15 seconds ahead of server UTC', () => {
      render(<GuestDrawRevealOverlay seasonId="season-001" />);

      // Server timestamp is 15 seconds in the past relative to client Date.now()
      const serverTimestamp = new Date(Date.now() - 15000).toISOString();

      act(() => {
        notifyAuctionDelta({
          version: 2,
          type: 'PLAYER_SELECTED',
          seasonId: 'season-001',
          lotId: 'lot-skew-01',
          serverTimestamp,
          correlationId: 'evt-test-live-skew-123',
          isGuestDraw: true,
          guestDrawCardNumber: 5,
          guestDrawBucket: 'B2',
          activeLot: {
            ...mockLotA,
            id: 'lot-skew-01',
            draw_number: 5,
            player: { id: 'p-skew', full_name: 'Clock Skew Star', photo_url: null },
          },
        });
      });

      // Overlay MUST be rendered despite the 15-second clock disparity
      expect(screen.getByTestId('guest-draw-reveal-overlay')).toBeDefined();
      expect(screen.getByTestId('guest-draw-card-back')).toBeDefined();
      expect(screen.getByText('CARD #05')).toBeDefined();

      // Advance to flip reveal
      act(() => {
        vi.advanceTimersByTime(700);
      });

      expect(screen.getByTestId('guest-draw-card-front')).toBeDefined();
      expect(screen.getByText('Clock Skew Star')).toBeDefined();
    });
  });

  // ===========================================================================
  // 2. ACTIVE LOT CARD RETENTION DURING RAPID PROGRESSION
  // ===========================================================================
  describe('2. ActiveLotCard Retention During Immediate Lot Progression', () => {
    it('holds sold lot and hammer stamp on screen when props.lot changes to next lot during animation', () => {
      const { rerender } = render(<ActiveLotCard lot={mockLotA} size="normal" />);

      // Trigger SALE delta on Lot A
      act(() => {
        notifyAuctionDelta({
          version: 2,
          type: 'SALE',
          seasonId: 'season-001',
          lotId: mockLotA.id,
          currentPrice: 150,
        });
      });

      // At 100ms, hammer is swinging on Lot A
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(screen.getByTestId('auction-hammer')).toBeDefined();
      expect(screen.getByText('Player One')).toBeDefined();

      // Rapid backend progression: parent immediately passes Lot B (at T = 150ms)
      rerender(<ActiveLotCard lot={mockLotB} size="normal" />);

      // ActiveLotCard MUST retain Lot A to allow hammer animation to complete!
      expect(screen.getByText('Player One')).toBeDefined();
      expect(screen.queryByText('Player Two')).toBeNull();

      // At 350ms, impact contact occurs on Lot A
      act(() => {
        vi.advanceTimersByTime(250);
      });
      expect(screen.getByTestId('sold-stamp')).toBeDefined();
      expect(screen.getAllByText('SOLD').length).toBeGreaterThan(0);
      expect(screen.getByText('Player One')).toBeDefined();

      // Advance past the 2.2s hold duration
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      // Now it transitions to Lot B
      expect(screen.getByText('Player Two')).toBeDefined();
      expect(screen.queryByTestId('sold-stamp')).toBeNull();
    });

    it('holds unsold lot on screen when props.lot changes to next lot during animation', () => {
      const { rerender } = render(<ActiveLotCard lot={mockLotA} size="normal" />);

      // Trigger UNSOLD delta on Lot A
      act(() => {
        notifyAuctionDelta({
          version: 2,
          type: 'UNSOLD',
          seasonId: 'season-001',
          lotId: mockLotA.id,
        });
      });

      // Rapid parent update to Lot B at 100ms
      act(() => {
        vi.advanceTimersByTime(100);
      });
      rerender(<ActiveLotCard lot={mockLotB} size="normal" />);

      // Still displays Lot A
      expect(screen.getByText('Player One')).toBeDefined();
      expect(screen.queryByText('Player Two')).toBeNull();

      // At 400ms, UNSOLD stamp is visible on Lot A
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(screen.getByTestId('unsold-stamp')).toBeDefined();
      expect(screen.getAllByText('UNSOLD').length).toBeGreaterThan(0);

      // Advance past 2.2s
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      // Now transitions to Lot B
      expect(screen.getByText('Player Two')).toBeDefined();
      expect(screen.queryByTestId('unsold-stamp')).toBeNull();
    });
  });

  // ===========================================================================
  // 3. OVERLAY MOUNTING ON OPERATOR & FRANCHISE FLOORS
  // ===========================================================================
  describe('3. Guest Draw Overlay Mounted on Operator & Franchise Floors', () => {
    it('displays Guest Draw popup on AuctionOperatorFloor (/admin/auction)', () => {
      render(
        <AuctionOperatorFloor
          seasonId="season-001"
          initialActiveLot={mockLotA}
          initialUpcomingLots={[mockLotB]}
          initialSessionState={mockSessionState}
          config={mockConfig}
        />
      );

      act(() => {
        notifyAuctionDelta({
          version: 2,
          type: 'PLAYER_SELECTED',
          seasonId: 'season-001',
          lotId: 'lot-op-guest',
          isGuestDraw: true,
          guestDrawCardNumber: 8,
          guestDrawBucket: 'B3',
          activeLot: {
            ...mockLotA,
            id: 'lot-op-guest',
            draw_number: 8,
            player: { id: 'p-guest-op', full_name: 'Admin Guest Hero', photo_url: null },
          },
        });
      });

      expect(screen.getByTestId('guest-draw-reveal-overlay')).toBeDefined();
      expect(screen.getByText('CARD #08')).toBeDefined();
    });

    it('displays Guest Draw popup on FranchiseAuctionFloor (/franchise/auction)', () => {
      render(
        <FranchiseAuctionFloor
          seasonId="season-001"
          initialActiveLot={mockLotA}
          initialSessionState={mockSessionState}
          franchise={{
            id: 'f-titans',
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

      act(() => {
        notifyAuctionDelta({
          version: 2,
          type: 'PLAYER_SELECTED',
          seasonId: 'season-001',
          lotId: 'lot-fr-guest',
          isGuestDraw: true,
          guestDrawCardNumber: 9,
          guestDrawBucket: 'B1',
          activeLot: {
            ...mockLotA,
            id: 'lot-fr-guest',
            draw_number: 9,
            player: { id: 'p-guest-fr', full_name: 'Franchise Guest Star', photo_url: null },
          },
        });
      });

      expect(screen.getByTestId('guest-draw-reveal-overlay')).toBeDefined();
      expect(screen.getByText('CARD #09')).toBeDefined();
    });
  });

  // ===========================================================================
  // 4. FLOOR-LEVEL BUFFERING ON PROJECTOR & SPECTATOR SCREENS
  // ===========================================================================
  describe('4. Projector & Live Room Progression Buffering', () => {
    it('ProjectorAuctionFloor holds sold lot before transitioning on PLAYER_SELECTED', () => {
      render(
        <ProjectorAuctionFloor
          seasonId="season-001"
          initialActiveLot={mockLotA}
          initialSessionState={mockSessionState}
          config={mockConfig}
        />
      );

      // 1. SALE arrives for Lot A
      act(() => {
        notifyAuctionDelta({
          version: 2,
          type: 'SALE',
          seasonId: 'season-001',
          lotId: mockLotA.id,
          currentPrice: 150,
        });
      });

      // 2. 50ms later, autoAdvanceToNextLot delivers PLAYER_SELECTED for Lot B
      act(() => {
        vi.advanceTimersByTime(50);
        notifyAuctionDelta({
          version: 2,
          type: 'PLAYER_SELECTED',
          seasonId: 'season-001',
          lotId: mockLotB.id,
          activeLot: mockLotB,
        });
      });

      // Lot A is held on floor during the hammer animation
      expect(screen.getByText('Player One')).toBeDefined();
      expect(screen.queryByText('Player Two')).toBeNull();

      // At 400ms, SOLD stamp is displayed on Lot A
      act(() => {
        vi.advanceTimersByTime(350);
      });
      expect(screen.getByTestId('sold-stamp')).toBeDefined();

      // After 2200ms delay, transitions to Lot B
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(screen.getByText('Player Two')).toBeDefined();
    });

    it('LiveAuctionRoomFloor holds unsold lot before transitioning on PLAYER_SELECTED', () => {
      render(
        <LiveAuctionRoomFloor
          seasonId="season-001"
          initialActiveLot={mockLotA}
          initialSessionState={mockSessionState}
          config={mockConfig}
          franchiseBiddingData={null}
        />
      );

      // 1. UNSOLD arrives for Lot A
      act(() => {
        notifyAuctionDelta({
          version: 2,
          type: 'UNSOLD',
          seasonId: 'season-001',
          lotId: mockLotA.id,
        });
      });

      // 2. 50ms later, PLAYER_SELECTED arrives for Lot B
      act(() => {
        vi.advanceTimersByTime(50);
        notifyAuctionDelta({
          version: 2,
          type: 'PLAYER_SELECTED',
          seasonId: 'season-001',
          lotId: mockLotB.id,
          activeLot: mockLotB,
        });
      });

      // Lot A is held on floor
      expect(screen.getByText('Player One')).toBeDefined();
      expect(screen.queryByText('Player Two')).toBeNull();

      // Advance past delay -> transitions to Lot B
      act(() => {
        vi.advanceTimersByTime(2300);
      });
      expect(screen.getByText('Player Two')).toBeDefined();
    });
  });

  // ===========================================================================
  // 5. GUEST DRAW SYNCHRONIZED 3,000 MS REVEAL & FLOOR COORDINATION
  // ===========================================================================
  describe('5. Guest Draw Synchronized 3,000 ms Reveal & Floor Coordination', () => {
    it('overlay remains visible for full 3,000 ms and completes at the 3,000 ms boundary', () => {
      const onCompleteMock = vi.fn();
      render(<GuestDrawRevealOverlay seasonId="season-001" onTransitionComplete={onCompleteMock} />);

      act(() => {
        notifyAuctionDelta({
          version: 2,
          type: 'PLAYER_SELECTED',
          seasonId: 'season-001',
          lotId: 'lot-gd-3000',
          isGuestDraw: true,
          guestDrawCardNumber: 7,
          guestDrawBucket: 'B3',
          activeLot: {
            ...mockLotA,
            id: 'lot-gd-3000',
            draw_number: 7,
            player: { id: 'p-7', full_name: 'Three Thousand Milliseconds Star', photo_url: null },
          },
        });
      });

      // T = 0ms: Card-back visible
      expect(screen.getByTestId('guest-draw-card-back')).toBeDefined();
      expect(screen.getByText('CARD #07')).toBeDefined();

      // T = 700ms: Card front revealed
      act(() => {
        vi.advanceTimersByTime(700);
      });
      expect(screen.getByTestId('guest-draw-card-front')).toBeDefined();
      expect(screen.getByText('Three Thousand Milliseconds Star')).toBeDefined();

      // T = 2,900ms (700 + 2200): Front MUST still be rendered and visible
      act(() => {
        vi.advanceTimersByTime(2200);
      });
      expect(screen.getByTestId('guest-draw-reveal-overlay')).toBeDefined();
      expect(screen.getByTestId('guest-draw-card-front')).toBeDefined();
      expect(onCompleteMock).not.toHaveBeenCalled();

      // T = 3,000ms (+ 100ms): Lifecycle completes cleanly
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(onCompleteMock).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('guest-draw-reveal-overlay')).toBeNull();
    });

    it('overlay in reduced-motion mode remains visible until 3,000 ms boundary', () => {
      const originalMatchMedia = window.matchMedia;
      window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      const onCompleteMock = vi.fn();
      render(<GuestDrawRevealOverlay seasonId="season-001" onTransitionComplete={onCompleteMock} />);

      act(() => {
        notifyAuctionDelta({
          version: 2,
          type: 'PLAYER_SELECTED',
          seasonId: 'season-001',
          lotId: 'lot-gd-reduced',
          isGuestDraw: true,
          guestDrawCardNumber: 9,
          guestDrawBucket: 'B1',
          activeLot: {
            ...mockLotA,
            id: 'lot-gd-reduced',
            draw_number: 9,
            player: { id: 'p-9', full_name: 'Reduced Motion Hero', photo_url: null },
          },
        });
      });

      // Front displayed immediately without flip
      expect(screen.getByTestId('guest-draw-card-front')).toBeDefined();
      expect(screen.getByText('Reduced Motion Hero')).toBeDefined();

      // At 2,900ms, still visible
      act(() => {
        vi.advanceTimersByTime(2900);
      });
      expect(screen.getByTestId('guest-draw-reveal-overlay')).toBeDefined();
      expect(onCompleteMock).not.toHaveBeenCalled();

      // At 3,000ms, completes
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(onCompleteMock).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('guest-draw-reveal-overlay')).toBeNull();

      window.matchMedia = originalMatchMedia;
    });

    it('ProjectorAuctionFloor holds floor card for 3,000 ms on isGuestDraw to prevent premature replacement', () => {
      render(
        <ProjectorAuctionFloor
          seasonId="season-001"
          initialActiveLot={mockLotA}
          initialSessionState={mockSessionState}
          config={mockConfig}
        />
      );

      // Initially shows Lot A
      expect(screen.getByText('Player One')).toBeDefined();
      expect(screen.getByText('LOT #1')).toBeDefined();

      // PLAYER_SELECTED arrives with isGuestDraw: true for Lot B
      act(() => {
        notifyAuctionDelta({
          version: 2,
          type: 'PLAYER_SELECTED',
          seasonId: 'season-001',
          lotId: mockLotB.id,
          isGuestDraw: true,
          guestDrawCardNumber: 2,
          guestDrawBucket: 'B2',
          activeLot: mockLotB,
        });
      });

      // Overlay is mounted
      expect(screen.getByTestId('guest-draw-reveal-overlay')).toBeDefined();

      // Floor card MUST NOT replace Lot A prematurely at 1,000ms
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.getByText('LOT #1')).toBeDefined();
      expect(screen.queryByText('LOT #2')).toBeNull();

      // Floor card MUST NOT replace Lot A prematurely at 2,500ms
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(screen.getByText('LOT #1')).toBeDefined();
      expect(screen.queryByText('LOT #2')).toBeNull();

      // At 3,000ms, overlay unmounts and floor card transitions to Lot B
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(screen.queryByTestId('guest-draw-reveal-overlay')).toBeNull();
      expect(screen.getByText('LOT #2')).toBeDefined();
      expect(screen.getByText('Player Two')).toBeDefined();
    });

    it('subsequent legitimate Guest Draw triggers new reveal without stuck state', () => {
      resetGuestDrawDeduplicationForTests();
      render(<GuestDrawRevealOverlay seasonId="season-001" />);

      // First Guest Draw: Lot 1
      act(() => {
        notifyAuctionDelta({
          version: 2,
          type: 'PLAYER_SELECTED',
          seasonId: 'season-001',
          lotId: 'lot-first-draw',
          isGuestDraw: true,
          guestDrawCardNumber: 1,
          guestDrawBucket: 'B3',
          activeLot: {
            ...mockLotA,
            id: 'lot-first-draw',
            draw_number: 1,
            player: { id: 'p-1', full_name: 'First Drawn Player', photo_url: null },
          },
        });
      });

      expect(screen.getByText('CARD #01')).toBeDefined();

      // Complete first draw at 3,500ms
      act(() => {
        vi.advanceTimersByTime(3500);
      });
      expect(screen.queryByTestId('guest-draw-reveal-overlay')).toBeNull();

      // Second legitimate Guest Draw: Lot 2
      act(() => {
        notifyAuctionDelta({
          version: 2,
          type: 'PLAYER_SELECTED',
          seasonId: 'season-001',
          lotId: 'lot-second-draw',
          isGuestDraw: true,
          guestDrawCardNumber: 2,
          guestDrawBucket: 'B3',
          activeLot: {
            ...mockLotB,
            id: 'lot-second-draw',
            draw_number: 2,
            player: { id: 'p-2', full_name: 'Second Drawn Player', photo_url: null },
          },
        });
      });

      // Second draw MUST open and run its reveal!
      expect(screen.getByTestId('guest-draw-reveal-overlay')).toBeDefined();
      expect(screen.getByText('CARD #02')).toBeDefined();

      act(() => {
        vi.advanceTimersByTime(700);
      });
      expect(screen.getByText('Second Drawn Player')).toBeDefined();

      act(() => {
        vi.advanceTimersByTime(2800);
      });
      expect(screen.queryByTestId('guest-draw-reveal-overlay')).toBeNull();
    });
  });
});
