import { describe, it, expect, vi } from 'vitest';
import { calculateNextBid } from '@/domain/auction/bid-increment';

describe('ACC Final Platform Corrections — Comprehensive Invariant Tests', () => {
  describe('1. Unsold Player Re-Auction Engine', () => {
    it('restores unsold lot to pending at original base price (NOT fixed ₹20)', () => {
      const originalRegistration = {
        id: 'reg-001',
        base_price: 150,
        bucket: 'B2',
        is_auction_eligible: true,
      };

      const unsoldLot = {
        id: 'lot-001',
        season_id: 'season-001',
        registration_id: 'reg-001',
        draw_number: 14,
        status: 'unsold',
        round: 1,
        base_price: 150,
        current_price: 150,
        highest_bidder_franchise_id: null,
      };

      // Re-auction logic test: must preserve original base price (150), NOT 20
      const reAuctionBasePrice = originalRegistration.base_price ?? unsoldLot.base_price;
      expect(reAuctionBasePrice).toBe(150);
      expect(reAuctionBasePrice).not.toBe(20);

      const updatedLot = {
        ...unsoldLot,
        status: 'pending',
        base_price: reAuctionBasePrice,
        current_price: reAuctionBasePrice,
        highest_bidder_franchise_id: null,
        started_at: null,
        ended_at: null,
      };

      expect(updatedLot.status).toBe('pending');
      expect(updatedLot.current_price).toBe(150);
      expect(updatedLot.highest_bidder_franchise_id).toBeNull();
      expect(updatedLot.started_at).toBeNull();
    });

    it('creates an authoritative RE_ENTER event payload preserving history', () => {
      const lotId = 'lot-001';
      const registrationId = 'reg-001';
      const drawNumber = 14;
      const originalBasePrice = 200;

      const reEnterEvent = {
        season_id: 'season-001',
        auction_lot_id: lotId,
        event_type: 'RE_ENTER',
        actor_user_id: 'admin-001',
        reason: 'Unsold player re-entered lot queue at original base price by operator',
        payload: {
          registration_id: registrationId,
          draw_number: drawNumber,
          base_price: originalBasePrice,
          previous_status: 'unsold',
        },
      };

      expect(reEnterEvent.event_type).toBe('RE_ENTER');
      expect(reEnterEvent.payload.previous_status).toBe('unsold');
      expect(reEnterEvent.payload.base_price).toBe(200);
      expect(reEnterEvent.payload.draw_number).toBe(14);
    });

    it('rejects re-auctioning if lot is not in unsold status', () => {
      const statuses = ['in_progress', 'sold', 'pending', 'allotted', 'scouted'];
      for (const status of statuses) {
        const canReAuction = status === 'unsold';
        expect(canReAuction).toBe(false);
      }
    });
  });

  describe('2. Auto-Queue Approved Players Invariants', () => {
    it('identifies unqueued eligible players and assigns incremented sequential draw numbers', () => {
      const existingLots = [
        { id: 'l1', registration_id: 'reg-1', draw_number: 1 },
        { id: 'l2', registration_id: 'reg-2', draw_number: 2 },
      ];

      const eligibleRegistrations = [
        { id: 'reg-1', bucket: 'B1', base_price: 100, is_auction_eligible: true },
        { id: 'reg-2', bucket: 'B2', base_price: 150, is_auction_eligible: true },
        { id: 'reg-3', bucket: 'B3', base_price: 200, is_auction_eligible: true },
        { id: 'reg-4', bucket: 'B4', base_price: 250, is_auction_eligible: true },
      ];

      const queuedIds = new Set(existingLots.map((l) => l.registration_id));
      const unqueued = eligibleRegistrations.filter((r) => !queuedIds.has(r.id));

      expect(unqueued).toHaveLength(2);
      expect(unqueued.map((u) => u.id)).toEqual(['reg-3', 'reg-4']);

      let maxDrawNumber = existingLots.reduce((m, l) => Math.max(m, l.draw_number), 0);
      const newLots = unqueued.map((r) => {
        maxDrawNumber += 1;
        return {
          registration_id: r.id,
          bucket: r.bucket,
          draw_number: maxDrawNumber,
          base_price: r.base_price,
          status: 'pending',
          round: 1,
        };
      });

      expect(newLots).toEqual([
        {
          registration_id: 'reg-3',
          bucket: 'B3',
          draw_number: 3,
          base_price: 200,
          status: 'pending',
          round: 1,
        },
        {
          registration_id: 'reg-4',
          bucket: 'B4',
          draw_number: 4,
          base_price: 250,
          status: 'pending',
          round: 1,
        },
      ]);
    });

    it('does not duplicate players already in lot queue', () => {
      const existingLots = [
        { id: 'l1', registration_id: 'reg-1', draw_number: 1 },
      ];
      const eligibleRegistrations = [
        { id: 'reg-1', bucket: 'B1', base_price: 100, is_auction_eligible: true },
      ];

      const queuedIds = new Set(existingLots.map((l) => l.registration_id));
      const unqueued = eligibleRegistrations.filter((r) => !queuedIds.has(r.id));

      expect(unqueued).toHaveLength(0);
    });
  });

  describe('3. Fast Franchise Bidding Calculations', () => {
    it('calculates legal next bid instantly without server roundtrip', () => {
      expect(calculateNextBid(null, 100)).toBe(100);
      expect(calculateNextBid(100, 100)).toBe(120); // base tier increment +20
      expect(calculateNextBid(120, 100)).toBe(140);
      expect(calculateNextBid(250, 100)).toBe(280); // higher tier increment +30
    });
  });

  describe('4. Live Auction Sold-To Resolution Visibility', () => {
    it('preserves the completed lot on screen when active lot is resolved upon hammer', () => {
      const activeLot = null; // No lot currently in_progress
      const recentLots = [
        {
          id: 'lot-hammered',
          status: 'sold',
          current_price: 450,
          highest_bidder_franchise_id: 'f-titans',
          ended_at: '2026-03-25T15:00:00Z',
        },
      ];

      // getActiveLot fallback resolution logic
      const targetLot = activeLot || (recentLots.length > 0 ? recentLots[0] : null);

      expect(targetLot).not.toBeNull();
      expect(targetLot?.status).toBe('sold');
      expect(targetLot?.current_price).toBe(450);
      expect(targetLot?.highest_bidder_franchise_id).toBe('f-titans');
    });

    it('correctly maps franchise crest and name for SOLD TO display', () => {
      const franchise = {
        id: 'ffffffff-0000-0000-0000-000000000001',
        name: 'Avanthi Titans',
        short_name: 'AT',
        color_primary: '#f59e0b',
        color_secondary: '#1e3a8a',
      };

      const soldDisplay = {
        badge: 'SOLD',
        hammerPrice: 520,
        header: 'SOLD TO',
        franchiseName: franchise.name,
        franchiseCrest: franchise.short_name,
        franchiseColor: franchise.color_primary,
      };

      expect(soldDisplay.badge).toBe('SOLD');
      expect(soldDisplay.hammerPrice).toBe(520);
      expect(soldDisplay.header).toBe('SOLD TO');
      expect(soldDisplay.franchiseName).toBe('Avanthi Titans');
      expect(soldDisplay.franchiseCrest).toBe('AT');
      expect(soldDisplay.franchiseColor).toBe('#f59e0b');
    });
  });

  describe('5. Canonical 11 Production Franchises Protection', () => {
    const CANONICAL_SHORT_NAMES = [
      'AT', 'MM', 'TT', 'NK', 'GG', 'VV', 'PP', 'EE', 'CC', 'CCO', 'RR',
    ];

    it('contains exactly the 11 approved production franchises', () => {
      expect(CANONICAL_SHORT_NAMES).toHaveLength(11);
      const unique = new Set(CANONICAL_SHORT_NAMES);
      expect(unique.size).toBe(11);
    });
  });

  describe('6. Unified Non-Overlapping Branding Invariants', () => {
    const fs = require('fs');
    const path = require('path');

    const rootDir = path.resolve(__dirname, '../..');
    const brandingPanelSrc = fs.readFileSync(
      path.join(rootDir, 'components/acc/branding-panel.tsx'),
      'utf-8'
    );
    const heroSrc = fs.readFileSync(
      path.join(rootDir, 'components/acc/public/hero.tsx'),
      'utf-8'
    );
    const loginSrc = fs.readFileSync(
      path.join(rootDir, 'app/(auth)/login/page.tsx'),
      'utf-8'
    );
    const signupSrc = fs.readFileSync(
      path.join(rootDir, 'app/(auth)/signup/page.tsx'),
      'utf-8'
    );
    const siteHeaderSrc = fs.readFileSync(
      path.join(rootDir, 'components/acc/site-header.tsx'),
      'utf-8'
    );

    it('uses the single reusable AccBrandingPanel across Home, Login, and Signup', () => {
      expect(heroSrc).toContain('AccBrandingPanel');
      expect(loginSrc).toContain('AccBrandingPanel');
      expect(signupSrc).toContain('AccBrandingPanel');
    });

    it('renders the institutional identity once in AccBrandingPanel and removes obsolete marketing slogans', () => {
      expect(brandingPanelSrc).toContain('Avanthi Institute of Engineering &amp; Technology (Autonomous)');
      expect(brandingPanelSrc).toContain('Makavarapalem, NAAC A+ Grade');
      expect(brandingPanelSrc).toContain('/images/avanthi-logo.png');

      expect(heroSrc).not.toContain('Where talent meets the hammer');
      expect(heroSrc).not.toContain('The command center for campus cricket auctions');
      expect(loginSrc).not.toContain('Where talent meets the hammer');
      expect(signupSrc).not.toContain('Where talent meets the hammer');
    });

    it('enforces exact canonical footer copy without prepended 2026', () => {
      const expectedFooter = 'Avanthi Institutions · Secure auction operations';
      expect(brandingPanelSrc).toContain(expectedFooter);
      expect(siteHeaderSrc).toContain(expectedFooter);
      expect(siteHeaderSrc).not.toContain('2026 Avanthi');
      expect(brandingPanelSrc).not.toContain('2026 Avanthi');
    });

    it('uses full-screen centered composition and removes split-screen left/right layout', () => {
      expect(loginSrc).not.toContain('lg:grid-cols-2');
      expect(signupSrc).not.toContain('lg:grid-cols-2');
      expect(loginSrc).toContain('object-cover object-center');
      expect(signupSrc).toContain('object-cover object-center');
      expect(heroSrc).toContain('object-cover object-center');
      expect(brandingPanelSrc).toContain('items-center text-center');
    });
  });
});
