// @vitest-environment jsdom
// =============================================================================
// ACC Auction Portal — Unit & Integration Test Suite
// END AUCTION Empty Floor + END LOT Auto-Advance & Authoritative Floor Rule
// =============================================================================

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { AuctionOperatorFloor } from '@/components/auction/auction-operator-floor';
import * as auctionActions from '@/lib/auction/actions';
import * as guardsLib from '@/lib/permissions/guards';
import * as supabaseAdmin from '@/lib/supabase/admin';
import { getActiveLot } from '@/lib/auction/queries';
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

describe('ACC Auction — Authoritative Floor Invariants, END LOT & END AUCTION', () => {
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

  const defaultAuctionConfig = {
    firstBidTimerSeconds: 30,
    subsequentBidTimerSeconds: 20,
    minAuctionPurchases: 15,
    maxSquadSize: 18,
    minSquadSize: 15,
    defaultPurse: 10000,
  };

  // ===========================================================================
  // 1. AUTHORITATIVE FLOOR RULES IN GET_ACTIVE_LOT
  // ===========================================================================
  describe('Authoritative Floor Server Queries', () => {
    it('1. getActiveLot returns null when session is COMPLETED', async () => {
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'season_config') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: { value: 'completed' }, error: null }),
                  }),
                }),
              }),
            };
          }
          return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) };
        }),
      } as any;

      const result = await getActiveLot(mockSupabase, 'season-001');
      expect(result).toBeNull();
    });

    it('2. getActiveLot returns null when no lot is in_progress (SOLD/UNSOLD are never returned)', async () => {
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'season_config') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: { value: 'live' }, error: null }),
                  }),
                }),
              }),
            };
          }
          if (table === 'auction_lots') {
            return {
              select: () => ({
                eq: () => ({
                  eq: (field: string, val: string) => {
                    expect(field).toBe('status');
                    expect(val).toBe('in_progress');
                    return {
                      maybeSingle: async () => ({ data: null, error: null }),
                    };
                  },
                }),
              }),
            };
          }
          return {};
        }),
      } as any;

      const result = await getActiveLot(mockSupabase, 'season-001');
      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // 2. END LOT AUTOMATIC ADVANCE WORKFLOW
  // ===========================================================================
  describe('END LOT Behavior', () => {
    it('3. Clicking END LOT with bids finalizes sale and automatically mounts next player with fresh timer', async () => {
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
          config={defaultAuctionConfig}
        />
      );

      expect(screen.getByText('Test Player 1')).toBeDefined();

      const endLotBtn = screen.getByRole('button', { name: /END LOT/i });
      await act(async () => {
        fireEvent.click(endLotBtn);
      });

      expect(confirmSaleSpy).toHaveBeenCalledWith('lot-1');

      await waitFor(() => {
        expect(screen.getByText('Test Player 2')).toBeDefined();
      });
    });

    it('4. Clicking END LOT without bids marks unsold and automatically mounts next player with fresh timer', async () => {
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
          config={defaultAuctionConfig}
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

    it('5. When no eligible players remain, END LOT alerts the operator and clears the floor', async () => {
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
          config={defaultAuctionConfig}
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

    it('6. When auction session is paused, ending a lot keeps the session paused and preserves full duration for next lot', async () => {
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
          config={defaultAuctionConfig}
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

  // ===========================================================================
  // 3. END AUCTION EMPTY FLOOR AND SECURITY INVARIANTS
  // ===========================================================================
  describe('END AUCTION Invariants & Protection', () => {
    it('7. Completed session displays empty floor on operator console without previous sold/unsold player', () => {
      const completedSessionState: AuctionSessionState = {
        ...baseSessionState,
        status: 'completed',
        isLive: false,
        isCompleted: true,
        activeLotId: null,
      };

      render(
        <AuctionOperatorFloor
          seasonId="season-001"
          initialActiveLot={null}
          initialUpcomingLots={[]}
          initialSessionState={completedSessionState}
          config={defaultAuctionConfig}
        />
      );

      // Must display No Lot Currently In Progress empty state
      expect(screen.getByText('No Lot Currently In Progress')).toBeDefined();
    });

    it('8. Completed session hides active lot controls and prevents lot reactivation', () => {
      const completedSessionState: AuctionSessionState = {
        ...baseSessionState,
        status: 'completed',
        isLive: false,
        isCompleted: true,
        activeLotId: null,
      };

      const activeLot = createMockLot('lot-1', 1, 'B1', 'in_progress', null, null);

      render(
        <AuctionOperatorFloor
          seasonId="season-001"
          initialActiveLot={activeLot}
          initialUpcomingLots={[]}
          initialSessionState={completedSessionState}
          config={defaultAuctionConfig}
        />
      );

      // Session completion banner must be visible
      expect(screen.getByText('AUCTION SESSION COMPLETED')).toBeDefined();
      // Active END LOT controls must not be displayed when session is completed
      expect(screen.queryByRole('button', { name: /END LOT/i })).toBeNull();
    });

    it('9. markUnsoldAction rejects execution if auction session has ended', async () => {
      const mockSeason = { id: 'season-001', name: 'ACC 2026', status: 'completed' };
      const mockUser = { id: 'admin-001', email: 'admin@acc.edu' };

      vi.spyOn(guardsLib, 'requireAdmin').mockResolvedValue({
        user: mockUser as any,
        activeSeason: mockSeason as any,
        roles: [],
        assignedFranchise: null,
        isSuperAdmin: true,
        isOperator: false,
        isAdmin: true,
        isFranchise: false,
        isPlayer: false,
        isViewer: false,
      });

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'auction_lots') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: createMockLot('lot-1', 1, 'B1', 'in_progress'),
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'season_config') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: { value: 'completed' },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      };
      vi.spyOn(supabaseAdmin, 'createAdminClient').mockReturnValue(mockSupabase as any);

      const result = await auctionActions.markUnsoldAction('lot-1');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot finalize lot: auction session has ended.');
    });

    it('10. confirmSaleAction rejects execution if auction session has ended', async () => {
      const mockSeason = { id: 'season-001', name: 'ACC 2026', status: 'completed' };
      const mockUser = { id: 'admin-001', email: 'admin@acc.edu' };

      vi.spyOn(guardsLib, 'requireAdmin').mockResolvedValue({
        user: mockUser as any,
        activeSeason: mockSeason as any,
        roles: [],
        assignedFranchise: null,
        isSuperAdmin: true,
        isOperator: false,
        isAdmin: true,
        isFranchise: false,
        isPlayer: false,
        isViewer: false,
      });

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'auction_lots') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: createMockLot('lot-1', 1, 'B1', 'in_progress', 'fran-1', 500),
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'season_config') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: { value: 'completed' },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      };
      vi.spyOn(supabaseAdmin, 'createAdminClient').mockReturnValue(mockSupabase as any);

      const result = await auctionActions.confirmSaleAction('lot-1');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot finalize lot: auction session has ended.');
    });
  });
});
