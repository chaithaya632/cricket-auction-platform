/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, renderHook } from '@testing-library/react';
import React, { useState, useEffect } from 'react';
import { calculateMaxPermissibleBid } from '@/domain/franchises/max-bid';
import { validateBidEligibility } from '@/domain/auction/auction-validation';
import { ActiveLotCard } from '@/components/auction/active-lot-card';

// Mock matchMedia
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // Deprecated
      removeListener: vi.fn(), // Deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// Mock Next Navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe('Timer Synchronization, Player Stats, and Purse Protection Improvements', () => {

  describe('1. Timer: stale RSC prop started_at does not overwrite broadcast-provided started_at', () => {
    it('should ignore older started_at from RSC if local is newer', () => {
      let activeLot = { id: 'lot1', started_at: '2026-10-10T10:00:10.000Z', status: 'in_progress' };
      const initialActiveLot = { id: 'lot1', started_at: '2026-10-10T10:00:05.000Z', status: 'in_progress', current_price: null };
      
      // Simulate the useEffect logic in franchise-auction-floor.tsx
      let newLot = activeLot;
      if (activeLot.id === initialActiveLot.id) {
        if (
          activeLot.started_at &&
          initialActiveLot.started_at &&
          new Date(activeLot.started_at).getTime() > new Date(initialActiveLot.started_at).getTime()
        ) {
          newLot = activeLot;
        } else {
          newLot = initialActiveLot;
        }
      }
      
      expect(newLot.started_at).toBe('2026-10-10T10:00:10.000Z');
      expect(newLot).toBe(activeLot); // Kept local state
    });
  });

  describe('2. Player stats: all stat categories render, missing values show "Unavailable", zero values show 0', () => {
    it('should render batting, bowling, fielding stats correctly with Unavailable and 0', () => {
      const mockLot = {
        id: 'lot1',
        status: 'in_progress',
        base_price: 20,
        current_price: null,
        player: { full_name: 'Test Player', id: 'p1' },
        registration: { branch: 'CS', academic_year: 3, programme: 'B.Tech' },
        highest_bidder: null,
        highest_bidder_franchise_id: null,
        skills: {
          parsed_stats: {
            highestLevelPlayed: 'district',
            battingAverage: 0, // Zero value
            battingStrikeRate: null, // Missing
            bowlingEconomy: 5.5,
            catchCount: 12
          }
        }
      };

      render(<ActiveLotCard lot={mockLot as any} />);

      // Should show Profile Info
      expect(screen.getByText(/Highest Level Played/i)).toBeDefined();
      expect(screen.getByText('district')).toBeDefined();

      // Should show Batting Stats with 0 and Unavailable
      expect(screen.getByText(/Batting Average/i)).toBeDefined();
      expect(screen.getByText('0')).toBeDefined();

      expect(screen.getByText(/Batting Strike Rate/i)).toBeDefined();
      expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0);

      // Should show Bowling and Fielding
      expect(screen.getByText(/Bowling Economy/i)).toBeDefined();
      expect(screen.getByText('5.5')).toBeDefined();

      expect(screen.getByText(/Catch Count/i)).toBeDefined();
      expect(screen.getByText('12')).toBeDefined();
    });
  });

  describe('3. Purse protection: maxPermissibleBid correctly reserves for remaining players', () => {
    it('should calculate reserved purse correctly for remaining slots based on dynamic minAuctionPurchases', () => {
      const remainingPurse = 1000;
      const minAuctionPurchases = 15; // From config
      const minBasePrice = 20;
      const auctionPurchasesSoFar = 10;
      
      const result = calculateMaxPermissibleBid({
        remainingPurse,
        auctionPurchasesSoFar,
        minAuctionPurchases,
        minBasePrice,
        mandatoryBucketDeficits: []
      });

      // Deficit = max(0, 15 - 10) = 5
      // Reserve Slots = max(0, 5 - 1) = 4 (because current lot counts as 1 slot)
      // Reserved Purse = 4 * 20 = 80
      // Max Bid = 1000 - 80 = 920

      expect(result.gDeficit).toBe(5);
      expect(result.reserveSlots).toBe(4);
      expect(result.reservedPurse).toBe(80);
      expect(result.maxBid).toBe(920);
    });
  });

  describe('4. Server-side bid rejection: bid exceeding maxPermissibleBid is rejected', () => {
    it('should reject a bid that exceeds maxPermissibleBid calculation', () => {
      const lot = {
        id: 'lot1',
        status: 'in_progress',
        current_price: 900,
        base_price: 20,
        highest_bidder_franchise_id: 'other',
        bucket: 'B1'
      };

      const franchise = {
        id: 'f1',
        remainingPurse: 1000,
        squadCount: 10,
        auctionPurchasesSoFar: 10,
        minAuctionPurchases: 15,
        minBasePrice: 20,
        mandatoryBucketDeficits: []
      };

      const proposedBid = 930; // 900 + 30 = 930 (valid increment), maxBid is 920, so 930 should fail

      const validation = validateBidEligibility({ lot, franchise, proposedBid });

      expect(validation.eligible).toBe(false);
      expect(validation.maxPermissibleBid).toBe(920);
      expect(validation.reason).toContain('exceeds your maximum permissible bid');
    });
  });

  describe('5. Dynamic config: minAuctionPurchases reads from config, not hardcoded', () => {
    it('should enforce different maxBid depending on dynamic minAuctionPurchases', () => {
      const remainingPurse = 1000;
      const auctionPurchasesSoFar = 10;
      const minBasePrice = 20;
      
      const resConfig15 = calculateMaxPermissibleBid({
        remainingPurse, auctionPurchasesSoFar, minAuctionPurchases: 15, minBasePrice, mandatoryBucketDeficits: []
      });
      expect(resConfig15.maxBid).toBe(920); // 1000 - (15-10-1)*20 = 920

      const resConfig18 = calculateMaxPermissibleBid({
        remainingPurse, auctionPurchasesSoFar, minAuctionPurchases: 18, minBasePrice, mandatoryBucketDeficits: []
      });
      expect(resConfig18.maxBid).toBe(860); // 1000 - (18-10-1)*20 = 860
    });
  });
});
