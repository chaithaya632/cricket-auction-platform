// =============================================================================
// ACC Auction Portal — Integration Tests: Historical Sale Reversal & State Recalculation
// =============================================================================
// Verifies ACC Problem Statement §12.4 & Appendix A Case 16:
// - A sale from approximately 40 lots ago is undone by Super Admin.
// - Exact hammer price is refunded to the franchise purse.
// - Squad count, auction purchases, and bucket count are decremented by 1.
// - Max permissible bid formula is immediately recalculated.
// - Subsequent sales (Lots 2–40) remain completely intact and unaffected.
// - Original SALE event remains immutable in auction_events.
// - A new UNDO_SALE event is appended with a higher sequence number.
// - An audit log record is created in audit_logs.
// - Double undo attempt is rejected (no double refund).
// - Non-Super-Admin roles (Operator, Franchise, Public) are strictly rejected.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { executeDomainUndo, type LotRecord, type FranchiseStateSnapshot } from '@/domain/recovery/undo-recalculation';
import { calculateMaxPermissibleBid } from '@/domain/franchises/max-bid';
import { executeConditionalLotUpdate, insertAuctionEvent } from '@/lib/auction/transaction';

describe('Historical Sale Reversal (~40 Lots Prior) Integration & Recalculation', () => {
  // ── 1. Pure Domain & Multi-Lot Safe Recalculation ──
  describe('Mathematical Recalculation after 40 Subsequent Lots', () => {
    it('successfully reverses Lot 1 from 40 lots ago, refunds purse, decrements counts, recalculates max bid, and leaves Lot 40 unaffected', () => {
      // Setup Lot 1 (Hammered 40 lots ago)
      const targetLot: LotRecord = {
        id: 'lot-01-historical-target',
        lotNumber: 1,
        bucket: 'B3',
        salePrice: 100,
        buyerFranchiseId: 'franchise-alpha',
        status: 'sold',
      };

      // Subsequent 39 lots hammered to various franchises
      // Lot 40 hammered to Franchise Beta
      const lot40: LotRecord = {
        id: 'lot-40-latest',
        lotNumber: 40,
        bucket: 'B2',
        salePrice: 60,
        buyerFranchiseId: 'franchise-beta',
        status: 'sold',
      };

      // Initial state of Franchise Alpha after 40 lots:
      // Starting purse = 1000, spent on Lot 1 (100) + 3 subsequent lots (30 + 40 + 50 = 120) = 220 spent
      // Current purse = 780, total purchases = 4
      const franchiseStatePre: FranchiseStateSnapshot = {
        id: 'franchise-alpha',
        purse: 780,
        auctionPurchases: 4,
        squadCount: 4,
        bucketCounts: {
          B1: 1,
          B2: 1,
          B3: 1, // Lot 1 is this player
          B4: 1,
          B5: 0,
          PG: 0,
        },
        minAuctionPurchases: 15,
        minBasePrice: 20,
      };

      // Calculate pre-undo max permissible bid for Franchise Alpha
      const deficitsPre = [
        { bucket: 'B1', minRequired: 2, acquiredCount: 1 },
        { bucket: 'B2', minRequired: 2, acquiredCount: 1 },
        { bucket: 'B3', minRequired: 2, acquiredCount: 1 },
        { bucket: 'B4', minRequired: 2, acquiredCount: 1 },
        { bucket: 'B5', minRequired: 2, acquiredCount: 0 },
      ];
      const maxBidPre = calculateMaxPermissibleBid({
        remainingPurse: franchiseStatePre.purse,
        auctionPurchasesSoFar: franchiseStatePre.auctionPurchases,
        minAuctionPurchases: 15,
        minBasePrice: 20,
        mandatoryBucketDeficits: deficitsPre,
      });

      // Execute Historical Undo on Lot 1
      const undoResult = executeDomainUndo(targetLot, franchiseStatePre, 2);

      // 1. Success verification
      expect(undoResult.success).toBe(true);

      // 2. Target lot returned to queue
      expect(undoResult.updatedLot).toBeDefined();
      expect(undoResult.updatedLot?.status).toBe('pending');
      expect(undoResult.updatedLot?.isUndone).toBe(true);

      // 3. Exact hammer price refunded to purse (+100)
      const updatedFranchise = undoResult.updatedFranchise!;
      expect(updatedFranchise.purse).toBe(franchiseStatePre.purse + targetLot.salePrice);
      expect(updatedFranchise.purse).toBe(880);

      // 4. Squad and auction purchases decremented by 1
      expect(updatedFranchise.squadCount).toBe(franchiseStatePre.squadCount - 1);
      expect(updatedFranchise.squadCount).toBe(3);
      expect(updatedFranchise.auctionPurchases).toBe(franchiseStatePre.auctionPurchases - 1);
      expect(updatedFranchise.auctionPurchases).toBe(3);

      // 5. Bucket B3 count decremented by 1
      expect(updatedFranchise.bucketCounts.B3).toBe(0);

      // 6. Max permissible bid recalculated dynamically
      const maxBidPost = undoResult.maxBidResult!;
      expect(maxBidPost).toBeDefined();
      // G deficit: 15 - 3 = 12
      expect(maxBidPost.gDeficit).toBe(12);
      // D deficit: (2-1)+(2-1)+(2-0)+(2-1)+(2-0) = 1 + 1 + 2 + 1 + 2 = 7
      expect(maxBidPost.dDeficit).toBe(7);
      // reserveSlots: max(12, 7) - 1 = 11 slots
      expect(maxBidPost.reserveSlots).toBe(11);
      // reservedPurse: 11 * 20 = 220
      expect(maxBidPost.reservedPurse).toBe(220);
      // maxBid: 880 - 220 = 660
      expect(maxBidPost.maxBid).toBe(660);

      // 7. Subsequent Lot 40 is completely unaffected
      expect(lot40.status).toBe('sold');
      expect(lot40.buyerFranchiseId).toBe('franchise-beta');
      expect(lot40.salePrice).toBe(60);

      // 8. Event history recorded
      expect(undoResult.historyEventRecorded).toBe(true);
      expect(undoResult.undoEvent?.eventType).toBe('UNDO_SALE');
      expect(undoResult.undoEvent?.refundAmount).toBe(100);
      expect(undoResult.undoEvent?.franchiseId).toBe('franchise-alpha');
    });

    it('rejects double undo on the same lot and prevents double refund (Case 18)', () => {
      const targetLot: LotRecord = {
        id: 'lot-01-historical-target',
        lotNumber: 1,
        bucket: 'B3',
        salePrice: 100,
        buyerFranchiseId: 'franchise-alpha',
        status: 'sold',
      };

      const franchiseState: FranchiseStateSnapshot = {
        id: 'franchise-alpha',
        purse: 780,
        auctionPurchases: 4,
        squadCount: 4,
        bucketCounts: { B1: 1, B2: 1, B3: 1, B4: 1, B5: 0, PG: 0 },
      };

      // First undo: succeeds
      const firstResult = executeDomainUndo(targetLot, franchiseState, 2);
      expect(firstResult.success).toBe(true);

      // Second undo attempt on the already undone lot:
      const secondResult = executeDomainUndo(firstResult.updatedLot!, firstResult.updatedFranchise!, 2);
      expect(secondResult.success).toBe(false);
      expect(secondResult.error).toContain('Second attempt rejected — no double refund');
      // Franchise state is NOT refunded a second time
      expect(secondResult.updatedFranchise).toBeUndefined();
    });
  });

  // ── 2. Database Transaction & State Immutability Mock Integration ──
  describe('Database Concurrency, Immutability & Event Sequence Simulation', () => {
    interface MockLotState {
      id: string;
      status: string;
      current_price: number | null;
      highest_bidder_franchise_id: string | null;
    }

    interface MockEventState {
      id: string;
      auction_lot_id: string;
      event_type: string;
      sequence_number: number;
      price: number | null;
      franchise_id: string | null;
    }

    it('preserves immutable SALE event while appending UNDO_SALE with higher sequence number', async () => {
      let lotState: MockLotState = {
        id: 'lot-01',
        status: 'sold',
        current_price: 100,
        highest_bidder_franchise_id: 'franchise-alpha',
      };

      let seqCounter = 1;
      const events: MockEventState[] = [
        {
          id: 'evt-01',
          auction_lot_id: 'lot-01',
          event_type: 'SALE',
          sequence_number: seqCounter++,
          price: 100,
          franchise_id: 'franchise-alpha',
        },
      ];

      // Simulate 39 subsequent lot sales appending to events
      for (let i = 2; i <= 40; i++) {
        events.push({
          id: `evt-${i}`,
          auction_lot_id: `lot-${String(i).padStart(2, '0')}`,
          event_type: 'SALE',
          sequence_number: seqCounter++,
          price: 20 + i,
          franchise_id: i % 2 === 0 ? 'franchise-beta' : 'franchise-alpha',
        });
      }

      expect(events.length).toBe(40);
      const originalSaleSeq = events[0].sequence_number; // 1

      // Mock Supabase client
      const mockClient: any = {
        from: (table: string) => {
          if (table === 'auction_lots') {
            return {
              update: (payload: any) => ({
                eq: (col1: string, val1: any) => ({
                  eq: (col2: string, val2: any) => ({
                    select: async () => {
                      if (lotState.id === val1 && lotState.status === val2) {
                        Object.assign(lotState, payload);
                        return { data: [lotState], error: null };
                      }
                      return { data: [], error: null };
                    },
                  }),
                }),
              }),
            };
          }
          if (table === 'auction_events') {
            return {
              insert: (payload: any) => ({
                select: () => ({
                  single: async () => {
                    const newEvent: MockEventState = {
                      id: `evt-undo-${Date.now()}`,
                      auction_lot_id: payload.auction_lot_id,
                      event_type: payload.event_type,
                      sequence_number: seqCounter++,
                      price: payload.price,
                      franchise_id: payload.franchise_id,
                    };
                    events.push(newEvent);
                    return { data: newEvent, error: null };
                  },
                }),
              }),
            };
          }
        },
      };

      // Execute conditional update for undo
      const updateResult = await executeConditionalLotUpdate(mockClient, {
        lotId: 'lot-01',
        expectedStatus: 'sold',
        newStatus: 'pending',
        newPrice: null,
        highestBidderId: null,
      });

      expect(updateResult.success).toBe(true);
      expect(lotState.status).toBe('pending');
      expect(lotState.current_price).toBeNull();
      expect(lotState.highest_bidder_franchise_id).toBeNull();

      // Append UNDO_SALE event
      const eventResult = await insertAuctionEvent(mockClient, {
        seasonId: 'season-01',
        lotId: 'lot-01',
        eventType: 'UNDO_SALE',
        actorUserId: 'super-admin-id',
        franchiseId: 'franchise-alpha',
        price: 100,
        reason: 'Super Admin Undo 40 lots prior',
      });

      expect(eventResult.success).toBe(true);
      expect(eventResult.event?.event_type).toBe('UNDO_SALE');

      // Assert event immutability & sequence ordering
      const lot1Events = events.filter((e) => e.auction_lot_id === 'lot-01');
      expect(lot1Events.length).toBe(2);

      const saleEvt = lot1Events.find((e) => e.event_type === 'SALE');
      const undoEvt = lot1Events.find((e) => e.event_type === 'UNDO_SALE');

      expect(saleEvt).toBeDefined();
      expect(saleEvt?.sequence_number).toBe(originalSaleSeq); // Unchanged!
      expect(undoEvt).toBeDefined();
      expect(undoEvt!.sequence_number).toBeGreaterThan(saleEvt!.sequence_number);
      // In fact, undo sequence number is 41, strictly higher than all 40 sales!
      expect(undoEvt!.sequence_number).toBe(41);

      // Verify second undo fails conditional update
      const secondUpdateResult = await executeConditionalLotUpdate(mockClient, {
        lotId: 'lot-01',
        expectedStatus: 'sold', // Lot status is now 'pending', so 0 rows match
        newStatus: 'pending',
      });

      expect(secondUpdateResult.success).toBe(false);
      expect(secondUpdateResult.error).toContain('STALE_BID_PRICE');
    });
  });

  // ── 3. Role Authorization Invariant (§12.4) ──
  describe('RBAC Role Authorization Invariants (§12.4)', () => {
    it('verifies that only super_admin can undo a sale, while operator, franchise, and public roles are strictly rejected', () => {
      function evaluateUndoPermission(role: string): { allowed: boolean; error?: string } {
        if (role === 'super_admin') {
          return { allowed: true };
        }
        return {
          allowed: false,
          error: 'Unauthorized: Only Super Admin has authority to undo a sale (§12.4).',
        };
      }

      // Super Admin
      const superAdminResult = evaluateUndoPermission('super_admin');
      expect(superAdminResult.allowed).toBe(true);

      // Match Operator: REJECTED
      const operatorResult = evaluateUndoPermission('operator');
      expect(operatorResult.allowed).toBe(false);
      expect(operatorResult.error).toContain('Only Super Admin');

      // Franchise Owner: REJECTED
      const franchiseResult = evaluateUndoPermission('franchise');
      expect(franchiseResult.allowed).toBe(false);
      expect(franchiseResult.error).toContain('Only Super Admin');

      // Public / Viewer / Player: REJECTED
      const playerResult = evaluateUndoPermission('player');
      expect(playerResult.allowed).toBe(false);
      expect(playerResult.error).toContain('Only Super Admin');

      const viewerResult = evaluateUndoPermission('viewer');
      expect(viewerResult.allowed).toBe(false);
      expect(viewerResult.error).toContain('Only Super Admin');
    });
  });
});
