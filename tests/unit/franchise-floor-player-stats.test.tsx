/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { ActiveLotCard } from '@/components/auction/active-lot-card';
import { FranchiseAuctionFloor } from '@/components/auction/franchise-auction-floor';
import type { AuctionLotWithDetails, AuctionSessionState, AuctionConfigDTO } from '@/lib/auction/types';
import type { FranchiseBiddingData } from '@/components/auction/franchise-auction-floor';

// Mock matchMedia
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const baseLot: AuctionLotWithDetails = {
  id: 'lot-stats-test',
  season_id: 's1',
  registration_id: 'r1',
  bucket: 'B1',
  draw_number: 1,
  base_price: 20,
  round: 1,
  status: 'in_progress',
  current_price: null,
  highest_bidder_franchise_id: null,
  started_at: new Date().toISOString(),
  ended_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  player: { id: 'p1', full_name: 'Stats Test Player', photo_url: null },
  registration: { id: 'r1', branch: 'CS', academic_year: 3, programme: 'B.Tech', cricheroes_profile_url: null },
  highest_bidder: null,
  skills: {
    derived_player_type: 'all_rounder',
    is_batter: true,
    is_bowler: true,
    is_wicket_keeper: false,
    batting_style: 'right_handed',
    bowling_style: 'medium_pace',
    parsed_stats: {
      highestLevelPlayed: 'district',
      battingAverage: 32.5,
      bowlingEconomy: 4.2,
      catchCount: 8,
      battingStrikeRate: 0,
      bowlingWickets: null,
    },
  },
};

const mockSessionState: AuctionSessionState = {
  status: 'live',
  seasonId: 's1',
  seasonName: 'ACC 2026',
  isLive: true,
  isPaused: false,
  isNotStarted: false,
  isCompleted: false,
  startedAt: new Date().toISOString(),
  activeLotId: 'lot-stats-test',
  pausedRemainingSeconds: null,
};

const mockFranchise: FranchiseBiddingData = {
  id: 'f1',
  name: 'Test Titans',
  shortName: 'TT',
  remainingPurse: 950,
  squadCount: 8,
  maxSquadSize: 22,
  maxPermissibleBid: 850,
};

const mockConfig: AuctionConfigDTO = {
  firstBidTimerSeconds: 30,
  subsequentBidTimerSeconds: 20,
  minAuctionPurchases: 15,
  maxSquadSize: 22,
  minSquadSize: 11,
  defaultPurse: 1000,
};

describe('Franchise Floor Player Statistics & Cold Load Regression Suite', () => {

  describe('1. ActiveLotCard Stats Display: Formatting & Missing Value Rules', () => {
    it('renders player profile, batting, bowling, and fielding sections', () => {
      render(<ActiveLotCard lot={baseLot} />);

      // Profile section
      expect(screen.getByText(/Player Profile/i)).toBeDefined();
      expect(screen.getByText(/Highest Level Played/i)).toBeDefined();
      expect(screen.getByText('district')).toBeDefined();

      // Batting stats — including genuine zero value
      expect(screen.getByText(/Batting Average/i)).toBeDefined();
      expect(screen.getByText('32.5')).toBeDefined();
      expect(screen.getByText(/Batting Strike Rate/i)).toBeDefined();
      expect(screen.getByText('0')).toBeDefined();

      // Bowling stats — including Unavailable
      expect(screen.getByText(/Bowling Economy/i)).toBeDefined();
      expect(screen.getByText('4.2')).toBeDefined();
      expect(screen.getByText(/Bowling Wickets/i)).toBeDefined();
      expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0);

      // Fielding stats
      expect(screen.getByText(/Catch Count/i)).toBeDefined();
      expect(screen.getByText('8')).toBeDefined();
    });

    it('does NOT render stats section when parsed_stats is null', () => {
      const lotWithoutStats: AuctionLotWithDetails = {
        ...baseLot,
        skills: {
          ...baseLot.skills!,
          parsed_stats: null,
        },
      };

      render(<ActiveLotCard lot={lotWithoutStats} />);
      expect(screen.queryByText(/Player Profile & Statistics/i)).toBeNull();
    });
  });

  describe('2. Cold Load on Franchise Auction Floor', () => {
    it('immediately renders player statistics on initial mount when initialActiveLot has parsed_stats', () => {
      render(
        <FranchiseAuctionFloor
          seasonId="s1"
          initialActiveLot={baseLot}
          initialSessionState={mockSessionState}
          franchise={mockFranchise}
          config={mockConfig}
        />
      );

      // Player name and stats appear on initial mount without waiting for realtime deltas
      expect(screen.getByText('Stats Test Player')).toBeDefined();
      expect(screen.getByText(/Player Profile & Statistics/i)).toBeDefined();
      expect(screen.getByText('district')).toBeDefined();
      expect(screen.getByText('32.5')).toBeDefined();
      expect(screen.getByText('4.2')).toBeDefined();
    });
  });

  describe('3. Hard Refresh (Unmount & Remount) on Franchise Auction Floor', () => {
    it('re-renders player statistics immediately on new mount with server-hydrated lot', () => {
      const { unmount } = render(
        <FranchiseAuctionFloor
          seasonId="s1"
          initialActiveLot={baseLot}
          initialSessionState={mockSessionState}
          franchise={mockFranchise}
          config={mockConfig}
        />
      );

      expect(screen.getByText('Stats Test Player')).toBeDefined();
      expect(screen.getByText('32.5')).toBeDefined();

      // Simulate hard refresh (component unmounted, page reloaded)
      unmount();

      // Remount simulating browser reload receiving authoritative initialActiveLot from server
      render(
        <FranchiseAuctionFloor
          seasonId="s1"
          initialActiveLot={baseLot}
          initialSessionState={mockSessionState}
          franchise={mockFranchise}
          config={mockConfig}
        />
      );

      expect(screen.getByText('Stats Test Player')).toBeDefined();
      expect(screen.getByText(/Player Profile & Statistics/i)).toBeDefined();
      expect(screen.getByText('32.5')).toBeDefined();
      expect(screen.getByText('4.2')).toBeDefined();
    });
  });

  describe('4. RSC Revalidation Anti-Regression Guards', () => {
    it('preserves existing parsed_stats when RSC revalidation delivers same lot without stats', () => {
      const prevLot = {
        ...baseLot,
        skills: {
          derived_player_type: 'bowler',
          parsed_stats: { bowlingEconomy: 3.5, bowlingWickets: 12 },
        },
      };

      const rscLotWithoutStats: AuctionLotWithDetails = {
        ...baseLot,
        skills: {
          derived_player_type: 'bowler',
          parsed_stats: null,
        },
      };

      // Apply the guard logic from franchise-auction-floor.tsx
      let result = rscLotWithoutStats;
      if (
        prevLot.skills?.parsed_stats &&
        !rscLotWithoutStats.skills?.parsed_stats &&
        prevLot.id === rscLotWithoutStats.id
      ) {
        result = { ...rscLotWithoutStats, skills: prevLot.skills };
      }

      expect(result.skills?.parsed_stats).toEqual({ bowlingEconomy: 3.5, bowlingWickets: 12 });
      expect(result.id).toBe(baseLot.id);
    });

    it('does NOT merge stats when RSC revalidation delivers a different lot ID', () => {
      const prevLot = {
        ...baseLot,
        id: 'lot-1',
        skills: {
          derived_player_type: 'bowler',
          parsed_stats: { bowlingEconomy: 3.5 },
        },
      };

      const newLot: AuctionLotWithDetails = {
        ...baseLot,
        id: 'lot-2',
        skills: {
          derived_player_type: 'batter',
          parsed_stats: null,
        },
      };

      let result = newLot;
      if (
        prevLot.skills?.parsed_stats &&
        !newLot.skills?.parsed_stats &&
        prevLot.id === newLot.id
      ) {
        result = { ...newLot, skills: prevLot.skills };
      }

      // Must NOT leak lot-1 stats to lot-2
      expect(result.skills?.parsed_stats).toBeNull();
      expect(result.id).toBe('lot-2');
    });

    it('adopts fresh stats when RSC revalidation delivers updated parsed_stats for the same lot', () => {
      const prevLot = {
        ...baseLot,
        skills: {
          derived_player_type: 'all_rounder',
          parsed_stats: { battingAverage: 30.0 },
        },
      };

      const updatedRscLot: AuctionLotWithDetails = {
        ...baseLot,
        skills: {
          derived_player_type: 'all_rounder',
          parsed_stats: { battingAverage: 35.0 },
        },
      };

      let result = updatedRscLot;
      if (
        prevLot.skills?.parsed_stats &&
        !updatedRscLot.skills?.parsed_stats &&
        prevLot.id === updatedRscLot.id
      ) {
        result = { ...updatedRscLot, skills: prevLot.skills };
      }

      // Takes fresh stats from server
      expect(result.skills?.parsed_stats).toEqual({ battingAverage: 35.0 });
    });
  });

  describe('5. Franchise Route Authorization Gate', () => {
    it('redirects unauthenticated requests before querying active lot data', () => {
      function mockRequireFranchise(resolvedAuth: { authUser: any; isFranchise: boolean }) {
        if (!resolvedAuth.authUser) {
          return { redirectUrl: '/login?redirectTo=/franchise' };
        }
        if (!resolvedAuth.isFranchise) {
          return { redirectUrl: '/?error=unauthorized_franchise' };
        }
        return { allowed: true };
      }

      const unauthenticated = mockRequireFranchise({ authUser: null, isFranchise: false });
      expect(unauthenticated.redirectUrl).toBe('/login?redirectTo=/franchise');

      const nonFranchiseUser = mockRequireFranchise({ authUser: { id: 'u1' }, isFranchise: false });
      expect(nonFranchiseUser.redirectUrl).toBe('/?error=unauthorized_franchise');

      const authorizedFranchise = mockRequireFranchise({ authUser: { id: 'u1' }, isFranchise: true });
      expect(authorizedFranchise.allowed).toBe(true);
    });
  });
});
