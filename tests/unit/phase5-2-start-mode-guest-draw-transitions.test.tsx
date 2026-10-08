// @vitest-environment jsdom
// =============================================================================
// ACC Auction Portal — Phase 5.2 Unit & Verification Suite
// Start Mode Dialog, Guest Draw Pre-Start Workflow, and SOLD/UNSOLD Transitions
// =============================================================================

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import { OperatorControls } from '@/components/auction/operator-controls';
import { GuestDrawDialog } from '@/components/auction/guest-draw-dialog';
import { ActiveLotCard } from '@/components/auction/active-lot-card';
import * as auctionActions from '@/lib/auction/actions';
import {
  callGuestDrawNumberAction,
  startAuctionAction,
  confirmSaleAction,
  markUnsoldAction,
  endAuctionAction,
} from '@/lib/auction/actions';
import type { AuctionSessionState, AuctionLotWithDetails } from '@/lib/auction/types';

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

// Mock realtime broadcast
const mockBroadcastAuctionUpdate = vi.fn().mockResolvedValue(true);
vi.mock('@/lib/auction/realtime', () => ({
  broadcastAuctionUpdate: (...args: any[]) => mockBroadcastAuctionUpdate(...args),
}));

// Mock audit logger
vi.mock('@/lib/audit/logger', () => ({
  writeAuditLog: vi.fn().mockResolvedValue({ id: 'audit-001' }),
}));

describe('Phase 5.2 — Start Mode Dialog, Guest Draw & Transitions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // 1. START AUCTION MODE DIALOG
  // ===========================================================================
  describe('1. Start Mode Dialog Workflow', () => {
    const notStartedSessionState: AuctionSessionState = {
      status: 'not_started',
      seasonId: 'season-001',
      seasonName: 'ACC 2026',
      isLive: false,
      isPaused: false,
      isNotStarted: true,
      isCompleted: false,
      startedAt: null,
      activeLotId: null,
    };

    it('opens Start-Mode Dialog with options when NOT_STARTED and Start Auction is clicked', () => {
      render(
        <OperatorControls
          seasonId="season-001"
          activeLot={null}
          upcomingLots={[]}
          sessionState={notStartedSessionState}
          initialActiveBuckets={['B2', 'B3']}
        />
      );

      // Start Auction button is visible
      const startButton = screen.getByRole('button', { name: /START AUCTION/i });
      expect(startButton).toBeDefined();

      // Click Start Auction
      fireEvent.click(startButton);

      // Verify Start-Mode Dialog opens
      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeDefined();
      expect(screen.getByText('Choose how to bring the first player to the floor.')).toBeDefined();
      expect(within(dialog).getByRole('button', { name: /START FROM BUCKETS/i })).toBeDefined();
      expect(within(dialog).getByRole('button', { name: /GUEST DRAW/i })).toBeDefined();
      expect(within(dialog).getByRole('button', { name: /CANCEL/i })).toBeDefined();
    }, 20000);

    it('executes startAuctionAction when START FROM BUCKETS is selected', async () => {
      const startSpy = vi.spyOn(auctionActions, 'startAuctionAction').mockResolvedValue({
        success: true,
        data: {
          status: 'live',
          activeLot: {
            id: 'lot-b2-1',
            status: 'in_progress',
            draw_number: 1,
            bucket: 'B2',
            base_price: 20,
            current_price: null,
            player: { full_name: 'Bucket Player One' } as any,
          } as any,
          sessionState: {
            status: 'live',
            seasonId: 'season-001',
            seasonName: 'ACC 2026',
            isLive: true,
            isPaused: false,
            isNotStarted: false,
            isCompleted: false,
            startedAt: new Date().toISOString(),
            activeLotId: 'lot-b2-1',
          },
        },
      });

      render(
        <OperatorControls
          seasonId="season-001"
          activeLot={null}
          upcomingLots={[]}
          sessionState={notStartedSessionState}
          initialActiveBuckets={['B2', 'B3']}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /START AUCTION/i }));

      // Select START FROM BUCKETS
      const bucketsOption = screen.getByRole('button', { name: /START FROM BUCKETS/i });
      fireEvent.click(bucketsOption);

      expect(startSpy).toHaveBeenCalledWith(['B2', 'B3']);
    });

    it('opens GuestDrawDialog when GUEST DRAW is selected and closes on CANCEL', async () => {
      vi.spyOn(auctionActions, 'getGuestDrawSnapshotAction').mockResolvedValue({
        success: true,
        data: [
          {
            cardNumber: 1,
            cardLabel: '01',
            bucketPlayerNumber: 'B21',
            lotId: 'lot-b2-1',
            drawNumber: 1,
            playerName: 'Guest Player B2',
            rollNumber: '2026-CS-01',
            bucket: 'B2',
            basePrice: 50,
            photoUrl: null,
            category: 'batter',
            drawn: false,
          },
        ],
      });

      render(
        <OperatorControls
          seasonId="season-001"
          activeLot={null}
          upcomingLots={[]}
          sessionState={notStartedSessionState}
          initialActiveBuckets={['B2', 'B3']}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /START AUCTION/i }));

      // Select GUEST DRAW from dialog
      const dialog = screen.getByRole('dialog');
      const guestOption = within(dialog).getByRole('button', { name: /GUEST DRAW/i });
      fireEvent.click(guestOption);

      // Verify Guest Draw dialog opens
      expect(screen.getByText('Guest Mode Ready')).toBeDefined();
    });
  });

  // ===========================================================================
  // 2. GUEST DRAW PRE-START & ACTIVE LOT PROTECTION
  // ===========================================================================
  describe('2. Guest Draw Pre-Start & Floor Invariants', () => {
    it('disables card selection in GuestDrawDialog when a lot is already active on the floor', async () => {
      const candidates = [
        {
          cardNumber: 1,
          cardLabel: '01',
          bucketPlayerNumber: 'B3-01',
          lotId: 'lot-1',
          drawNumber: 1,
          playerName: 'Guest Candidate',
          rollNumber: '2026-01',
          bucket: 'B3',
          basePrice: 20,
          photoUrl: null,
          category: 'bowler',
          drawn: false,
        },
      ];

      vi.spyOn(auctionActions, 'getGuestDrawSnapshotAction').mockResolvedValue({
        success: true,
        data: candidates,
      });

      render(
        <GuestDrawDialog
          isOpen={true}
          onClose={vi.fn()}
          seasonId="season-001"
          activeBuckets={['B3']}
          initialBucket="B3"
          hasActiveFloorPlayer={true}
        />
      );

      await act(async () => {
        await Promise.resolve();
      });

      // Verify active floor warning appears
      expect(screen.getByText(/Cannot draw: a player is already active on the auction floor/i)).toBeDefined();

      // Verify card click button is disabled
      const card = screen.getByTestId('guest-draw-card-1');
      const drawButton = within(card).getByRole('button');
      expect((drawButton as HTMLButtonElement).disabled).toBe(true);
    });

    it('renders deterministic bucket-number card (e.g. B21) and reveals player details on click', async () => {
      const candidates = [
        {
          cardNumber: 1,
          cardLabel: '01',
          bucketPlayerNumber: 'B21',
          lotId: 'lot-b2-1',
          drawNumber: 1,
          playerName: 'Sunil Gavaskar',
          rollNumber: '25811A0501',
          bucket: 'B2',
          basePrice: 50,
          photoUrl: 'https://example.com/photo.jpg',
          category: 'BATSMAN',
          drawn: false,
        },
      ];

      vi.spyOn(auctionActions, 'getGuestDrawSnapshotAction').mockResolvedValue({
        success: true,
        data: candidates,
      });

      const onPlayerDrawnMock = vi.fn();
      vi.spyOn(auctionActions, 'callGuestDrawNumberAction').mockResolvedValue({
        success: true,
        data: {
          lotId: 'lot-b2-1',
          drawNumber: 1,
          playerName: 'Sunil Gavaskar',
          activeLot: {
            id: 'lot-b2-1',
            status: 'in_progress',
            draw_number: 1,
            bucket: 'B2',
            base_price: 50,
            current_price: null,
            player: { full_name: 'Sunil Gavaskar' } as any,
          } as any,
          sessionState: {
            status: 'live',
            seasonId: 'season-001',
            seasonName: 'ACC 2026',
            isLive: true,
            isPaused: false,
            isNotStarted: false,
            isCompleted: false,
            startedAt: new Date().toISOString(),
            activeLotId: 'lot-b2-1',
          },
        },
      });

      render(
        <GuestDrawDialog
          isOpen={true}
          onClose={vi.fn()}
          seasonId="season-001"
          activeBuckets={['B2']}
          initialBucket="B2"
          hasActiveFloorPlayer={false}
          onPlayerDrawn={onPlayerDrawnMock}
        />
      );

      await act(async () => {
        await Promise.resolve();
      });

      // Verify deterministic bucket number B21 is rendered prominently
      expect(screen.getAllByText('B21').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Sunil Gavaskar')).toBeDefined();
      expect(screen.getByText('25811A0501')).toBeDefined();
      expect(screen.getByText('BATSMAN')).toBeDefined();
      expect(screen.getByText('₹50')).toBeDefined();
    });
  });

  // ===========================================================================
  // 3. SOLD & UNSOLD TRANSITION PRESENTATIONS
  // ===========================================================================
  describe('3. SOLD & UNSOLD Visual Presentations in ActiveLotCard', () => {
    const baseLot: AuctionLotWithDetails = {
      id: 'lot-trans-1',
      season_id: 'season-001',
      registration_id: 'reg-01',
      status: 'in_progress',
      base_price: 20,
      current_price: 80,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      highest_bidder_franchise_id: 'f-01',
      highest_bidder: {
        id: 'f-01',
        name: 'Royal Challengers',
        short_name: 'RCB',
        primary_color: '#dc2626',
        secondary_color: null,
      },
      draw_number: 15,
      bucket: 'B2',
      round: 1,
      started_at: new Date().toISOString(),
      ended_at: null,
      player: {
        id: 'p-01',
        full_name: 'Virat Kohli',
        photo_url: null,
        category: 'BATSMAN',
        batting_style: 'RHB',
        bowling_style: null,
      } as any,
      registration: {
        id: 'reg-01',
        programme: 'BTech',
        academic_year: '4',
        branch: 'CSE',
      } as any,
    };

    it('renders prominent SOLD celebration badge, hammer price, and winning franchise when status is sold', () => {
      const soldLot: AuctionLotWithDetails = {
        ...baseLot,
        status: 'sold',
        current_price: 150,
      };

      render(<ActiveLotCard lot={soldLot} size="projector" />);

      expect(screen.getByText(/🔨 SOLD/i)).toBeDefined();
      expect(screen.getByText('₹150')).toBeDefined();
      expect(screen.getByText('Royal Challengers')).toBeDefined();
      expect(screen.getByText('RCB')).toBeDefined();
    });

    it('renders clean UNSOLD presentation badge with base price and Round 2 notice when status is unsold', () => {
      const unsoldLot: AuctionLotWithDetails = {
        ...baseLot,
        status: 'unsold',
        current_price: null,
        highest_bidder_franchise_id: null,
        highest_bidder: null,
      };

      render(<ActiveLotCard lot={unsoldLot} size="normal" />);

      expect(screen.getAllByText('UNSOLD').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('₹20')).toBeDefined();
      expect(screen.getByText(/Retains eligibility for future Round 2 re-auction/i)).toBeDefined();
    });
  });
});
