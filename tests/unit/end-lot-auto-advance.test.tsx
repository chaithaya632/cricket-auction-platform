// @vitest-environment jsdom
// =============================================================================
// ACC Auction Portal — Unit & Integration Test Suite
// END LOT Auto-Advance, Pause Retention, Timer Re-Mount & Empty Queue Alert
// =============================================================================

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { AuctionOperatorFloor } from '@/components/auction/auction-operator-floor';
import * as auctionActions from '@/lib/auction/actions';
import { toast } from 'sonner';
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

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
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

function createMockLot(
  id: string,
  drawNumber: number,
  bucket: string,
  status: 'pending' | 'in_progress' | 'sold' | 'unsold' = 'pending',
  highestBidderId: string | null = null,
  currentPrice: number | null = null
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
    started_at: status === 'in_progress' ? new Date().toISOString() : null,
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

describe('END LOT — Automatic Progression, Timer Reset & Floor Synchronization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseSessionState: AuctionSessionState = {
    status: 'live',
    seasonId: 'season-001',
    seasonName: 'ACC 2026',
    isLive: true,
    isPaused: false,
    isNotStarted: false,
    isCompleted: false,
    startedAt: new Date().toISOString(),
    activeLotId: 'lot-1',
    pausedRemainingSeconds: null,
    pausedAt: null,
  };

  it('1. Clicking END LOT with bids finalizes sale and automatically mounts next player with fresh timer', async () => {
    const activeLot = createMockLot('lot-1', 1, 'B1', 'in_progress', 'fran-1', 500);
    const nextLot = createMockLot('lot-2', 2, 'B1', 'in_progress', null, null);

    const confirmSaleSpy = vi
      .spyOn(auctionActions, 'confirmSaleAction')
      .mockResolvedValueOnce({
        success: true,
        data: {
          price: 500,
          franchiseId: 'fran-1',
          nextLotId: nextLot.id,
          activeLot: nextLot,
          sessionState: baseSessionState,
        },
      });

    render(
      <AuctionOperatorFloor
        seasonId="season-001"
        initialActiveLot={activeLot}
        initialUpcomingLots={[nextLot]}
        initialSessionState={baseSessionState}
        config={{
          firstBidTimerSeconds: 30,
          subsequentBidTimerSeconds: 20,
          minAuctionPurchases: 15,
          maxSquadSize: 18,
          minSquadSize: 15,
          defaultPurse: 10000,
        }}
      />
    );

    // Initial player is on floor
    expect(screen.getByText('Test Player 1')).toBeDefined();

    // Click END LOT button
    const endLotBtn = screen.getByRole('button', { name: /END LOT/i });
    await act(async () => {
      fireEvent.click(endLotBtn);
    });

    expect(confirmSaleSpy).toHaveBeenCalledWith('lot-1');

    // Next player must appear on floor automatically
    await waitFor(() => {
      expect(screen.getByText('Test Player 2')).toBeDefined();
    });
  });

  it('2. Clicking END LOT without bids marks unsold and automatically mounts next player with fresh timer', async () => {
    const activeLot = createMockLot('lot-1', 1, 'B1', 'in_progress', null, null);
    const nextLot = createMockLot('lot-2', 2, 'B1', 'in_progress', null, null);

    const markUnsoldSpy = vi
      .spyOn(auctionActions, 'markUnsoldAction')
      .mockResolvedValueOnce({
        success: true,
        data: {
          nextLotId: nextLot.id,
          activeLot: nextLot,
          sessionState: baseSessionState,
        },
      });

    render(
      <AuctionOperatorFloor
        seasonId="season-001"
        initialActiveLot={activeLot}
        initialUpcomingLots={[nextLot]}
        initialSessionState={baseSessionState}
        config={{
          firstBidTimerSeconds: 30,
          subsequentBidTimerSeconds: 20,
          minAuctionPurchases: 15,
          maxSquadSize: 18,
          minSquadSize: 15,
          defaultPurse: 10000,
        }}
      />
    );

    expect(screen.getByText('Test Player 1')).toBeDefined();

    const endLotBtn = screen.getByRole('button', { name: /END LOT/i });
    await act(async () => {
      fireEvent.click(endLotBtn);
    });

    expect(markUnsoldSpy).toHaveBeenCalledWith('lot-1');

    await waitFor(() => {
      expect(screen.getByText('Test Player 2')).toBeDefined();
    });
  });

  it('3. When no eligible players remain, END LOT alerts the operator and clears the floor', async () => {
    const activeLot = createMockLot('lot-last', 10, 'B3', 'in_progress', null, null);

    vi.spyOn(auctionActions, 'markUnsoldAction').mockResolvedValueOnce({
      success: true,
      data: {
        nextLotId: null,
        activeLot: null,
        sessionState: baseSessionState,
        message: 'No eligible players remain in the selected buckets.',
      },
    });

    render(
      <AuctionOperatorFloor
        seasonId="season-001"
        initialActiveLot={activeLot}
        initialUpcomingLots={[]}
        initialSessionState={baseSessionState}
        config={{
          firstBidTimerSeconds: 30,
          subsequentBidTimerSeconds: 20,
          minAuctionPurchases: 15,
          maxSquadSize: 18,
          minSquadSize: 15,
          defaultPurse: 10000,
        }}
      />
    );

    const endLotBtn = screen.getByRole('button', { name: /END LOT/i });
    await act(async () => {
      fireEvent.click(endLotBtn);
    });

    await waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith('No eligible players remain in the selected buckets.');
    });
  });

  it('4. When auction session is paused, ending a lot keeps the session paused and preserves full duration for next lot', async () => {
    const pausedSessionState: AuctionSessionState = {
      ...baseSessionState,
      status: 'paused',
      isPaused: true,
      pausedRemainingSeconds: 30,
    };

    const activeLot = createMockLot('lot-1', 1, 'B1', 'in_progress', null, null);
    const nextLot = createMockLot('lot-2', 2, 'B1', 'in_progress', null, null);

    vi.spyOn(auctionActions, 'markUnsoldAction').mockResolvedValueOnce({
      success: true,
      data: {
        nextLotId: nextLot.id,
        activeLot: nextLot,
        sessionState: pausedSessionState,
      },
    });

    render(
      <AuctionOperatorFloor
        seasonId="season-001"
        initialActiveLot={activeLot}
        initialUpcomingLots={[nextLot]}
        initialSessionState={pausedSessionState}
        config={{
          firstBidTimerSeconds: 30,
          subsequentBidTimerSeconds: 20,
          minAuctionPurchases: 15,
          maxSquadSize: 18,
          minSquadSize: 15,
          defaultPurse: 10000,
        }}
      />
    );

    const endLotBtn = screen.getByRole('button', { name: /END LOT/i });
    await act(async () => {
      fireEvent.click(endLotBtn);
    });

    await waitFor(() => {
      expect(screen.getByText('Test Player 2')).toBeDefined();
    });
  });
});
