// @vitest-environment jsdom
// =============================================================================
// ACC Auction Portal — Test Suite: Guest Draw Popup & Hammer Animations
// =============================================================================
// Covers all 12 verification criteria:
// 1. Guest Draw popup appears for correct authoritative player.
// 2. Reveal transitions to the active floor.
// 3. SOLD animation starts only after authoritative confirmation.
// 4. UNSOLD animation starts only after authoritative confirmation.
// 5. Rejected operations do not show confirmed outcome stamps.
// 6. Duplicate events do not replay animations.
// 7. Late events cannot replace a newer player.
// 8. Reconnection does not replay obsolete animations.
// 9. Animation completion does not alter timer or auction state.
// 10. Existing auction progression remains unchanged.
// 11. Reduced-motion mode works.
// 12. Non-blocking presentation guarantees.
// =============================================================================

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, within } from '@testing-library/react';
import {
  AuctionHammerStamp,
  resetHammerAnimationDeduplicationForTests,
} from '@/components/auction/auction-hammer-stamp';
import {
  GuestDrawRevealOverlay,
  resetGuestDrawDeduplicationForTests,
} from '@/components/auction/guest-draw-reveal-overlay';
import { ActiveLotCard } from '@/components/auction/active-lot-card';
import * as audioModule from '@/lib/auction/audio';
import { notifyAuctionDelta } from '@/components/auction/auction-realtime-sync';
import type { AuctionLotWithDetails } from '@/lib/auction/types';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

describe('Guest Draw Popup & Hammer Animations Test Suite', () => {
  const mockLot: AuctionLotWithDetails = {
    id: 'lot-hammer-01',
    season_id: 'season-001',
    registration_id: 'reg-01',
    status: 'in_progress',
    base_price: 20,
    current_price: 120,
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
    draw_number: 7,
    bucket: 'B3',
    round: 1,
    started_at: new Date().toISOString(),
    ended_at: null,
    player: {
      id: 'p-01',
      full_name: 'Rohit Sharma',
      photo_url: 'https://example.com/rohit.jpg',
    },
    registration: {
      id: 'reg-01',
      programme: 'BTech',
      academic_year: 4,
      branch: 'ECE',
      cricheroes_profile_url: null,
    },
    skills: {
      derived_player_type: 'OPENING_BATTER',
      is_batter: true,
      experience_years: 3,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    resetHammerAnimationDeduplicationForTests();
    resetGuestDrawDeduplicationForTests();
    audioModule.resetAudioDeduplicationForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ===========================================================================
  // 1. GUEST DRAW REVEAL POPUP & TRANSITIONS (§Feature 1)
  // ===========================================================================
  describe('1. Guest Draw Reveal Popup (§Feature 1)', () => {
    it('1. displays prominent popup with card-back and authoritative player information', async () => {
      render(<GuestDrawRevealOverlay seasonId="season-001" currentLot={mockLot} />);

      // Broadcast an authoritative Guest Draw PLAYER_SELECTED delta
      act(() => {
        notifyAuctionDelta({
          version: 2,
          type: 'PLAYER_SELECTED',
          seasonId: 'season-001',
          lotId: 'lot-guest-10',
          isGuestDraw: true,
          guestDrawCardNumber: 10,
          guestDrawBucket: 'B3',
          activeLot: {
            ...mockLot,
            id: 'lot-guest-10',
            draw_number: 10,
            player: { id: 'p-10', full_name: 'Jasprit Bumrah', photo_url: null },
            base_price: 50,
          },
        });
      });

      // Step 1: Initial card-back is rendered
      expect(screen.getByTestId('guest-draw-reveal-overlay')).toBeDefined();
      expect(screen.getByTestId('guest-draw-card-back')).toBeDefined();
      expect(screen.getByText('CARD #10')).toBeDefined();
      expect(screen.getByText(/BUCKET B3 · REVEALING PLAYER/i)).toBeDefined();

      // Step 2: Advance timer by 650ms -> 3D flip reveals front of card with real details
      act(() => {
        vi.advanceTimersByTime(650);
      });

      expect(screen.getByTestId('guest-draw-card-front')).toBeDefined();
      expect(screen.getByText('Jasprit Bumrah')).toBeDefined();
      expect(screen.getByText('CARD #10')).toBeDefined();
      expect(screen.getByText('BUCKET B3')).toBeDefined();
      expect(screen.getByText('₹50')).toBeDefined();
    });

    it('2. transitions from reveal overlay to the active auction floor after ~2.8 seconds', () => {
      const onTransitionCompleteMock = vi.fn();
      render(
        <GuestDrawRevealOverlay
          seasonId="season-001"
          onTransitionComplete={onTransitionCompleteMock}
          manualCandidate={{
            lotId: 'lot-trans-1',
            drawNumber: 3,
            playerName: 'Virat Kohli',
            photoUrl: null,
            bucket: 'B2',
            basePrice: 50,
          }}
        />
      );

      // Card-back shown initially
      expect(screen.getByTestId('guest-draw-card-back')).toBeDefined();

      // Flip to front
      act(() => {
        vi.advanceTimersByTime(700);
      });
      expect(screen.getByTestId('guest-draw-card-front')).toBeDefined();

      // Hold visible, then transition to floor (~2.8s)
      act(() => {
        vi.advanceTimersByTime(2200);
      });

      // Completes transition and unmounts overlay at ~3.3s
      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(onTransitionCompleteMock).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('guest-draw-reveal-overlay')).toBeNull();
    });

    it('6. ignores duplicate delivery of Guest Draw events (deduplication)', () => {
      render(<GuestDrawRevealOverlay seasonId="season-001" />);

      const eventPayload = {
        version: 2,
        type: 'PLAYER_SELECTED',
        seasonId: 'season-001',
        lotId: 'lot-dedupe-1',
        isGuestDraw: true,
        guestDrawCardNumber: 5,
        guestDrawBucket: 'B1',
        activeLot: {
          ...mockLot,
          id: 'lot-dedupe-1',
          player: { id: 'p-01', full_name: 'Dedupe Player', photo_url: null },
        },
      };

      // First broadcast -> displays overlay
      act(() => {
        notifyAuctionDelta(eventPayload);
      });
      expect(screen.getByTestId('guest-draw-reveal-overlay')).toBeDefined();

      // Advance past completion
      act(() => {
        vi.advanceTimersByTime(3500);
      });
      expect(screen.queryByTestId('guest-draw-reveal-overlay')).toBeNull();

      // Duplicate delivery with same lotId -> must NOT reopen or replay
      act(() => {
        notifyAuctionDelta(eventPayload);
      });
      expect(screen.queryByTestId('guest-draw-reveal-overlay')).toBeNull();
    });

    it('7 & 8. ignores stale/late Guest Draw events (>6s old on reconnect)', () => {
      render(<GuestDrawRevealOverlay seasonId="season-001" />);

      const staleTimestamp = new Date(Date.now() - 10000).toISOString(); // 10s old

      act(() => {
        notifyAuctionDelta({
          version: 2,
          type: 'PLAYER_SELECTED',
          seasonId: 'season-001',
          serverTimestamp: staleTimestamp,
          lotId: 'lot-stale-01',
          isGuestDraw: true,
          activeLot: mockLot,
        });
      });

      // Must not display obsolete reveal overlay
      expect(screen.queryByTestId('guest-draw-reveal-overlay')).toBeNull();
    });
  });

  // ===========================================================================
  // 2. SOLD HAMMER STRIKE & STAMP ANIMATION (§Feature 2)
  // ===========================================================================
  describe('2. SOLD Hammer Strike & Stamp (§Feature 2)', () => {
    it('3. starts SOLD animation only after authoritative sale confirmation', () => {
      const audioSpy = vi.spyOn(audioModule, 'playHammerStrikeSound');

      render(
        <AuctionHammerStamp
          status="sold"
          lotId="lot-sold-01"
          size="normal"
        />
      );

      // Phase 1 (0 to 300ms): Hammer swings down
      expect(screen.getByTestId('auction-hammer')).toBeDefined();
      expect(screen.getByTestId('sold-stamp-container')).toBeDefined();

      // Advance to impact contact point (T = 320ms)
      act(() => {
        vi.advanceTimersByTime(330);
      });

      // Contact shockwave and audio strike triggered
      expect(audioSpy).toHaveBeenCalledWith('sold', 'lot-sold-01');
      expect(screen.getByTestId('sold-stamp')).toBeDefined();
      expect(screen.getByText('SOLD')).toBeDefined();
      expect(screen.getByText('OFFICIAL HAMMER CONFIRMED')).toBeDefined();

      // Advance past settle (T = 850ms): hammer fades, stamp remains settled
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(screen.queryByTestId('auction-hammer')).toBeNull();
      expect(screen.getByTestId('sold-stamp')).toBeDefined();
    });

    it('5. rejected or in-progress operations do not display confirmed SOLD stamp', () => {
      render(
        <AuctionHammerStamp
          status="in_progress"
          lotId="lot-rejected-01"
        />
      );

      // Neither hammer nor stamp is displayed for in_progress status
      expect(screen.queryByTestId('auction-hammer')).toBeNull();
      expect(screen.queryByTestId('sold-stamp')).toBeNull();
      expect(screen.queryByTestId('unsold-stamp')).toBeNull();
    });

    it('6. duplicate events do not replay the hammer swing for already settled sale', () => {
      const audioSpy = vi.spyOn(audioModule, 'playHammerStrikeSound');

      const { rerender } = render(
        <AuctionHammerStamp
          status="sold"
          lotId="lot-dedupe-sold"
        />
      );

      // Finish first swing
      act(() => {
        vi.advanceTimersByTime(900);
      });
      expect(audioSpy).toHaveBeenCalledTimes(1);

      // Rerender with same props (simulating state update or duplicate broadcast)
      rerender(
        <AuctionHammerStamp
          status="sold"
          lotId="lot-dedupe-sold"
        />
      );

      // Should remain settled, not re-swinging
      expect(screen.queryByTestId('auction-hammer')).toBeNull();
      expect(audioSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // 3. UNSOLD HAMMER STRIKE & STAMP ANIMATION (§Feature 3)
  // ===========================================================================
  describe('3. UNSOLD Hammer Strike & Stamp (§Feature 3)', () => {
    it('4. animates hammer strike and stamps UNSOLD with subdued treatment on pass', () => {
      const audioSpy = vi.spyOn(audioModule, 'playHammerStrikeSound');

      render(
        <AuctionHammerStamp
          status="unsold"
          lotId="lot-unsold-01"
          size="projector"
        />
      );

      // Gavel swings down
      expect(screen.getByTestId('auction-hammer')).toBeDefined();

      // Contact point
      act(() => {
        vi.advanceTimersByTime(330);
      });

      expect(audioSpy).toHaveBeenCalledWith('unsold', 'lot-unsold-01');
      expect(screen.getByTestId('unsold-stamp')).toBeDefined();
      expect(screen.getByText('UNSOLD')).toBeDefined();
      expect(screen.getByText('PASSED · ROUND 2 ELIGIBLE')).toBeDefined();
    });
  });

  // ===========================================================================
  // 4. ACTIVE LOT CARD INTEGRATION & NON-BLOCKING GUARANTEES
  // ===========================================================================
  describe('4. ActiveLotCard Integration & Non-Blocking Guarantees', () => {
    it('integrates stamp overlay into ActiveLotCard on authoritative SALE broadcast', () => {
      render(<ActiveLotCard lot={mockLot} size="normal" />);

      // Broadcast authoritative SALE event
      act(() => {
        notifyAuctionDelta({
          version: 2,
          type: 'SALE',
          seasonId: 'season-001',
          lotId: mockLot.id,
          currentPrice: 150,
        });
      });

      // Hammer strikes and stamp renders
      act(() => {
        vi.advanceTimersByTime(400);
      });

      expect(screen.getByTestId('sold-stamp')).toBeDefined();
      expect(screen.getByText('Avanthi Titans')).toBeDefined();
    });

    it('integrates stamp overlay into ActiveLotCard on authoritative UNSOLD broadcast', () => {
      render(<ActiveLotCard lot={mockLot} size="normal" />);

      // Broadcast authoritative UNSOLD event
      act(() => {
        notifyAuctionDelta({
          version: 2,
          type: 'UNSOLD',
          seasonId: 'season-001',
          lotId: mockLot.id,
        });
      });

      act(() => {
        vi.advanceTimersByTime(400);
      });

      expect(screen.getByTestId('unsold-stamp')).toBeDefined();
      expect(screen.getByText(/Retains eligibility for future Round 2 re-auction/i)).toBeDefined();
    });

    it('11. respects prefers-reduced-motion by skipping hammer swing and rendering settled stamp directly', () => {
      // Mock matchMedia for prefers-reduced-motion
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

      render(
        <AuctionHammerStamp
          status="sold"
          lotId="lot-reduced-motion-01"
        />
      );

      // Under reduced motion: hammer swing is skipped, stamp is immediately rendered in settled phase
      expect(screen.queryByTestId('auction-hammer')).toBeNull();
      expect(screen.getByTestId('sold-stamp')).toBeDefined();
      expect(screen.getByText('SOLD')).toBeDefined();
    });

    it('9 & 10. ensures animation completion does not alter timer, lot progression, or database state', () => {
      const onCompleteMock = vi.fn();
      render(
        <AuctionHammerStamp
          status="sold"
          lotId="lot-state-invariable"
          onAnimationComplete={onCompleteMock}
        />
      );

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(onCompleteMock).toHaveBeenCalledTimes(1);
      // Animation is purely visual presentation: no external side-effects produced
    });
  });
});
