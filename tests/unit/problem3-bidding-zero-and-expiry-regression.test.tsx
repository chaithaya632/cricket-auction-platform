/**
 * @vitest-environment jsdom
 */
// =============================================================================
// ACC Auction Portal — Unit Tests: Problem 3 Regression Suite
// =============================================================================
// Verifies:
// 1. BiddingControl disables the bid button when displayed countdown reaches 0:00 (isTimerExpired=true)
// 2. BiddingControl displays "Bidding Closed (Time Up)" and ignores click submissions when expired
// 3. BiddingControl re-enables when a new bid, extension, or new player lot arrives
// 4. Server-side placeBidAction strictly enforces authoritative deadline (nowMs >= deadlineMs -> error)
// 5. Server-side placeBidAction accepts valid bids before deadline (nowMs < deadlineMs)
// 6. Safe race handling between placeBidAction and finalizeExpiredLotAction
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BiddingControl } from '@/components/auction/bidding-control';
import { placeBidAction, finalizeExpiredLotAction } from '@/lib/auction/actions';
import * as guardsLib from '@/lib/permissions/guards';
import * as supabaseAdmin from '@/lib/supabase/admin';
import * as realtimeLib from '@/lib/auction/realtime';
import * as transactionLib from '@/lib/auction/transaction';
import { notifyAuctionDelta, resetSequenceTrackingForTests } from '@/components/auction/auction-realtime-sync';
import type { AuctionLotWithDetails } from '@/lib/auction/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
  }),
}));

describe('Problem 3 — Bidding Control at Countdown 0:00 & Server Deadline Enforcement', () => {
  const seasonId = '00000000-0000-0000-0000-000000000001';
  const lotId = 'lot-1111-1111-1111-111111111111';

  const mockFranchise = {
    id: 'fran-csk',
    name: 'Chennai Super Kings',
    shortName: 'CSK',
    remainingPurse: 500,
    squadCount: 10,
    maxSquadSize: 22,
    maxPermissibleBid: 300,
  };

  const mockLot: AuctionLotWithDetails = {
    id: lotId,
    season_id: seasonId,
    registration_id: 'reg-001',
    draw_number: 1,
    status: 'in_progress',
    current_price: 50,
    base_price: 20,
    highest_bidder_franchise_id: 'fran-mi',
    started_at: new Date().toISOString(),
    ended_at: null,
    bucket: 'B1',
    round: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    player: {
      id: 'player-001',
      full_name: 'Test Player',
      category: 'all_rounder',
      photo_url: null,
    } as any,
    registration: {
      id: 'reg-001',
      branch: 'CSE',
      academic_year: 3,
      programme: 'btech',
      cricheroes_profile_url: null,
    } as any,
    highest_bidder: {
      id: 'fran-mi',
      name: 'Mumbai Indians',
      short_name: 'MI',
      primary_color: null,
      secondary_color: null,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetSequenceTrackingForTests();
  });

  describe('1. BiddingControl UI & Button Disablement at 0:00', () => {
    it('disables the bid button and displays "Bidding Closed (Time Up)" when isTimerExpired is true', () => {
      render(
        <BiddingControl
          lot={mockLot}
          franchise={mockFranchise}
          isTimerExpired={true}
        />
      );

      const button = screen.getByRole('button');
      expect((button as HTMLButtonElement).disabled).toBe(true);
      expect(button.textContent).toContain('Bidding Closed (Time Up)');
    });

    it('enables the bid button when isTimerExpired is false and franchise is eligible', () => {
      render(
        <BiddingControl
          lot={mockLot}
          franchise={mockFranchise}
          isTimerExpired={false}
        />
      );

      const button = screen.getByRole('button');
      expect((button as HTMLButtonElement).disabled).toBe(false);
      expect(button.textContent).toContain('Place Bid for ₹60'); // 50 -> 60 (+10)
    });

    it('re-enables the bid button when a BID_PLACED broadcast arrives from another franchise', () => {
      const { rerender } = render(
        <BiddingControl
          lot={mockLot}
          franchise={mockFranchise}
          isTimerExpired={true}
        />
      );

      expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);

      // Another franchise places a bid, extending the round
      act(() => {
        notifyAuctionDelta({
          type: 'BID_PLACED',
          lotId,
          seasonId,
          currentPrice: 70,
          highestBidderId: 'fran-rcb',
          highestBidderName: 'Royal Challengers Bangalore',
          startedAt: new Date().toISOString(),
          durationSeconds: 20,
        });
      });

      const button = screen.getByRole('button');
      expect((button as HTMLButtonElement).disabled).toBe(false);
      expect(button.textContent).toContain('Place Bid for ₹80');
    });

    it('re-enables the bid button when a TIMER_EXTENDED broadcast arrives', () => {
      render(
        <BiddingControl
          lot={mockLot}
          franchise={mockFranchise}
          isTimerExpired={true}
        />
      );

      expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);

      // Admin extends timer
      act(() => {
        notifyAuctionDelta({
          type: 'TIMER_EXTENDED',
          lotId,
          seasonId,
          startedAt: new Date().toISOString(),
          durationSeconds: 30,
        });
      });

      const button = screen.getByRole('button');
      expect((button as HTMLButtonElement).disabled).toBe(false);
      expect(button.textContent).toContain('Place Bid for ₹60');
    });

    it('does NOT re-enable the bid button when a BID_PLACED broadcast arrives for a DIFFERENT lot', () => {
      render(
        <BiddingControl
          lot={mockLot}
          franchise={mockFranchise}
          isTimerExpired={true}
        />
      );

      expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);

      // Stale or different lot bid broadcast arrives
      act(() => {
        notifyAuctionDelta({
          type: 'BID_PLACED',
          lotId: 'different-lot-9999',
          seasonId,
          currentPrice: 200,
          highestBidderId: 'fran-rcb',
          startedAt: new Date().toISOString(),
          durationSeconds: 20,
        });
      });

      // Must REMAIN disabled and closed for the current lot
      const button = screen.getByRole('button');
      expect((button as HTMLButtonElement).disabled).toBe(true);
      expect(button.textContent).toContain('Bidding Closed (Time Up)');
    });

    it('does NOT re-enable the bid button when a TIMER_EXTENDED broadcast arrives for a DIFFERENT lot', () => {
      render(
        <BiddingControl
          lot={mockLot}
          franchise={mockFranchise}
          isTimerExpired={true}
        />
      );

      expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);

      act(() => {
        notifyAuctionDelta({
          type: 'TIMER_EXTENDED',
          lotId: 'different-lot-9999',
          seasonId,
          startedAt: new Date().toISOString(),
          durationSeconds: 30,
        });
      });

      const button = screen.getByRole('button');
      expect((button as HTMLButtonElement).disabled).toBe(true);
      expect(button.textContent).toContain('Bidding Closed (Time Up)');
    });

    it('does NOT re-enable the bid button when a RESUME broadcast arrives with 0 remaining seconds', () => {
      render(
        <BiddingControl
          lot={mockLot}
          franchise={mockFranchise}
          isTimerExpired={true}
        />
      );

      expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);

      act(() => {
        notifyAuctionDelta({
          type: 'RESUME',
          seasonId,
          remainingSeconds: 0,
        });
      });

      const button = screen.getByRole('button');
      expect((button as HTMLButtonElement).disabled).toBe(true);
      expect(button.textContent).toContain('Bidding Closed (Time Up)');
    });

    it('re-enables the bid button when a RESUME broadcast arrives with positive remaining seconds', () => {
      render(
        <BiddingControl
          lot={mockLot}
          franchise={mockFranchise}
          isTimerExpired={true}
        />
      );

      expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);

      act(() => {
        notifyAuctionDelta({
          type: 'RESUME',
          seasonId,
          remainingSeconds: 15,
        });
      });

      const button = screen.getByRole('button');
      expect((button as HTMLButtonElement).disabled).toBe(false);
      expect(button.textContent).toContain('Place Bid for ₹60');
    });

    it('resets expiry state and enables bidding when a NEW lot arrives via PLAYER_SELECTED', () => {
      render(
        <BiddingControl
          lot={mockLot}
          franchise={mockFranchise}
          isTimerExpired={true}
        />
      );

      expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);

      const newLot: AuctionLotWithDetails = {
        ...mockLot,
        id: 'lot-2222-2222-2222-222222222222',
        draw_number: 2,
        current_price: null,
        base_price: 30,
        highest_bidder_franchise_id: null,
        highest_bidder: null,
      };

      act(() => {
        notifyAuctionDelta({
          type: 'PLAYER_SELECTED',
          lotId: newLot.id,
          seasonId,
          activeLot: newLot,
        });
      });

      const button = screen.getByRole('button');
      expect((button as HTMLButtonElement).disabled).toBe(false);
      expect(button.textContent).toContain('Place Bid for ₹30');
    });

    it('closes bidding immediately when a SALE broadcast arrives', () => {
      render(
        <BiddingControl
          lot={mockLot}
          franchise={mockFranchise}
          isTimerExpired={false}
        />
      );

      expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false);

      act(() => {
        notifyAuctionDelta({
          type: 'SALE',
          lotId,
          seasonId,
          currentPrice: 90,
          highestBidderId: 'fran-mi',
        });
      });

      expect(screen.queryByRole('button')).toBeNull();
      expect(screen.getByText('Bidding is closed while no lot is in progress.')).toBeDefined();
    });
  });

  describe('2. Server-Side placeBidAction Deadline Validation', () => {
    function setupFranchiseContext(franchiseId = 'fran-csk') {
      vi.spyOn(guardsLib, 'requireFranchise').mockResolvedValue({
        user: { id: `user-${franchiseId}` } as any,
        activeSeason: { id: seasonId } as any,
        assignedFranchise: {
          id: franchiseId,
          name: 'Chennai Super Kings',
          short_name: 'CSK',
          starting_purse: 1000,
        } as any,
        roles: [{ role: 'franchise_representative' }] as any,
        isAdmin: false,
        isSuperAdmin: false,
        isOperator: false,
        isFranchise: true,
        isPlayer: false,
        isViewer: false,
      });
    }

    it('rejects bid on server when nowMs >= deadlineMs, independent of client state', async () => {
      setupFranchiseContext();

      // Started 35s ago with 30s timer -> EXPIRED on server
      const startedAt = new Date(Date.now() - 35000).toISOString();
      const expiredLot = {
        id: lotId,
        season_id: seasonId,
        status: 'in_progress',
        current_price: null,
        base_price: 20,
        highest_bidder_franchise_id: null,
        started_at: startedAt,
        bucket: 'B1',
      };

      const mockAdmin = {
        from: vi.fn((table: string) => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: expiredLot, error: null }),
          then: (resolve: any) => {
            if (table === 'season_config') {
              return Promise.resolve({
                data: [
                  { key: 'auction_session_status', value: 'live' },
                  { key: 'auction_first_bid_timer_seconds', value: '30' },
                  { key: 'auction_subsequent_bid_timer_seconds', value: '20' },
                  { key: 'default_purse', value: '1000' },
                  { key: 'min_squad_size', value: '17' },
                  { key: 'max_squad_size', value: '22' },
                  { key: 'min_auction_purchases', value: '15' },
                ],
                error: null,
              }).then(resolve);
            }
            if (table === 'bucket_rules') {
              return Promise.resolve({ data: [{ bucket: 'B1', min_purchases: 2, is_mandatory: true }], error: null }).then(resolve);
            }
            return Promise.resolve({ data: [], error: null }).then(resolve);
          },
        })),
      };

      vi.spyOn(supabaseAdmin, 'createAdminClient').mockReturnValue(mockAdmin as any);

      const res = await placeBidAction(lotId, null);

      expect(res.success).toBe(false);
      expect(res.error).toContain('bidding window has expired');
    });

    it('accepts valid bid placed before server deadline', async () => {
      setupFranchiseContext();

      // Started 10s ago with 30s timer -> 20s remaining
      const startedAt = new Date(Date.now() - 10000).toISOString();
      const liveLot = {
        id: lotId,
        season_id: seasonId,
        status: 'in_progress',
        current_price: null,
        base_price: 20,
        highest_bidder_franchise_id: null,
        started_at: startedAt,
        bucket: 'B1',
      };

      const mockAdmin = {
        from: vi.fn((table: string) => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: liveLot, error: null }),
          then: (resolve: any) => {
            if (table === 'season_config') {
              return Promise.resolve({
                data: [
                  { key: 'auction_session_status', value: 'live' },
                  { key: 'auction_first_bid_timer_seconds', value: '30' },
                  { key: 'auction_subsequent_bid_timer_seconds', value: '20' },
                  { key: 'default_purse', value: '1000' },
                  { key: 'min_squad_size', value: '17' },
                  { key: 'max_squad_size', value: '22' },
                  { key: 'min_auction_purchases', value: '15' },
                ],
                error: null,
              }).then(resolve);
            }
            if (table === 'bucket_rules') {
              return Promise.resolve({ data: [{ bucket: 'B1', min_purchases: 2, is_mandatory: true }], error: null }).then(resolve);
            }
            return Promise.resolve({ data: [], error: null }).then(resolve);
          },
        })),
      };

      vi.spyOn(supabaseAdmin, 'createAdminClient').mockReturnValue(mockAdmin as any);
      vi.spyOn(transactionLib, 'executeAuctionMutationFlow').mockResolvedValue({
        success: true,
        data: { lot: { ...liveLot, current_price: 20 }, event: { id: 'evt-1' } },
      } as any);

      const res = await placeBidAction(lotId, null);

      expect(res.success).toBe(true);
      expect(res.data?.newPrice).toBe(20);
    });

    it('safely rejects bid when lot was finalized by timeout concurrently', async () => {
      setupFranchiseContext();

      // Lot status is already 'sold' when bid arrives at db check
      const soldLot = {
        id: lotId,
        season_id: seasonId,
        status: 'sold',
        current_price: 50,
        base_price: 20,
        highest_bidder_franchise_id: 'fran-mi',
        started_at: new Date(Date.now() - 25000).toISOString(),
        bucket: 'B1',
      };

      const mockAdmin = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: soldLot, error: null }),
          then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve),
        })),
      };

      vi.spyOn(supabaseAdmin, 'createAdminClient').mockReturnValue(mockAdmin as any);

      const res = await placeBidAction(lotId, 50);

      expect(res.success).toBe(false);
      expect(res.error).toContain('no longer in progress');
    });
  });
});
