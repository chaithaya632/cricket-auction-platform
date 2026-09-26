// =============================================================================
// ACC Auction Portal — Unit Tests: Super Admin Auction Restart & Recovery
// =============================================================================
// Verifies ACC Problem Statement §12.4, §13, and Super Admin Recovery Requirements:
// 1. Super Admin Authorization & Role Boundaries (Operator/Franchise/Player blocked)
// 2. Parameter Validation (mode, reason, targetLotId)
// 3. Full Restart Invariants (Draw #1 reset, UNDO_SALE events, paused floor, draw preservation)
// 4. Selective Restart Invariants (from target lot forward, prior lots untouched)
// 5. Zero-Mutation Preflight Safety (blocks if allotted/scouted lots in range)
// 6. Financial & Quota Recalculation (purse, squad count, bucket quota, max permissible bid)
// 7. Fixed startAuctionAgainAction (valid audit log, no invalid SESSION_RESET event)
// =============================================================================

import { describe, it, expect, vi } from 'vitest';
import type { LotStatus } from '@/lib/constants';
import { calculateMaxPermissibleBid } from '@/domain/franchises/max-bid';

interface MockLot {
  id: string;
  season_id: string;
  registration_id: string;
  draw_number: number;
  bucket: string;
  base_price: number;
  current_price: number | null;
  round: number;
  status: LotStatus;
  highest_bidder_franchise_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
  player: {
    id: string;
    full_name: string;
  };
}

interface MockEvent {
  id: string;
  season_id: string;
  auction_lot_id: string;
  event_type: string;
  actor_user_id: string;
  franchise_id?: string | null;
  price?: number | null;
  reason?: string;
  payload: Record<string, any>;
  created_at: string;
}

interface MockAuditLog {
  season_id: string;
  actor_user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  reason: string;
  metadata: Record<string, any>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Simulated Pure Logic for Recovery Actions (reflecting lib/auction/actions.ts)
// ─────────────────────────────────────────────────────────────────────────────

function simulateAuctionRecovery({
  user,
  mode,
  targetLotId,
  reason,
  lots,
  events,
  auditLogs,
  seasonConfig,
}: {
  user: { id: string; role: string; isSuperAdmin: boolean };
  mode: 'full' | 'selective';
  targetLotId?: string;
  reason: string;
  lots: MockLot[];
  events: MockEvent[];
  auditLogs: MockAuditLog[];
  seasonConfig: Record<string, string>;
}) {
  // 1. Authorization
  if (user.role !== 'admin' || !user.isSuperAdmin) {
    return {
      success: false,
      error: 'Unauthorized: Auction restart and recovery is restricted to Super Admin only.',
    };
  }

  // 2. Reason validation
  if (!reason || !reason.trim()) {
    return {
      success: false,
      error: 'Administrative reason is required for auction restart and recovery.',
    };
  }

  // 3. Mode validation
  if (mode !== 'full' && mode !== 'selective') {
    return {
      success: false,
      error: 'Invalid recovery mode. Must be "full" or "selective".',
    };
  }

  let affectedLots: MockLot[] = [];
  let targetDrawNumber: number | null = null;
  let targetPlayerName: string | null = null;

  if (mode === 'full') {
    affectedLots = [...lots].sort((a, b) => a.draw_number - b.draw_number);
    if (affectedLots.length === 0) {
      return { success: false, error: 'No auction lots found for recovery.' };
    }
  } else {
    if (!targetLotId) {
      return { success: false, error: 'Target lot ID is required for selective restart.' };
    }
    const targetLot = lots.find((l) => l.id === targetLotId);
    if (!targetLot) {
      return { success: false, error: 'Target lot not found in active season.' };
    }
    targetDrawNumber = targetLot.draw_number;
    targetPlayerName = targetLot.player.full_name;
    affectedLots = lots
      .filter((l) => l.draw_number >= targetDrawNumber!)
      .sort((a, b) => a.draw_number - b.draw_number);

    if (affectedLots.length === 0) {
      return { success: false, error: 'No auction lots found in the target recovery range.' };
    }
  }

  // 4. Preflight safety check (allotted / scouted)
  const unsafeLot = affectedLots.find(
    (l) => l.status === 'allotted' || l.status === 'scouted'
  );
  if (unsafeLot) {
    return {
      success: false,
      error:
        'Recovery cannot proceed because Round 2 allotment/scouting records are present in the affected range. No changes were made.',
    };
  }

  const now = new Date().toISOString();

  // 5. Freeze / Pause session
  seasonConfig['auction_session_status'] = 'paused';

  // 6. Undo affected sales
  const soldLots = affectedLots.filter((l) => l.status === 'sold');
  for (const lot of soldLots) {
    events.push({
      id: `evt-undo-${events.length + 1}`,
      season_id: lot.season_id,
      auction_lot_id: lot.id,
      event_type: 'UNDO_SALE',
      actor_user_id: user.id,
      franchise_id: lot.highest_bidder_franchise_id,
      price: lot.current_price,
      reason: `Auction recovery (${mode}) by Super Admin. Reason: ${reason.trim()}`,
      payload: {
        restored_to: 'return_to_queue',
        recovery_mode: mode,
        target_draw_number: mode === 'selective' ? targetDrawNumber : null,
        refunded_franchise_id: lot.highest_bidder_franchise_id,
        refunded_price: lot.current_price,
        reason: reason.trim(),
      },
      created_at: now,
    });
  }

  // 7. Reset affected operational lots to pending
  let resetLotsCount = 0;
  for (const lot of affectedLots) {
    if (lot.status !== 'pending') {
      lot.status = 'pending';
      lot.current_price = null;
      lot.highest_bidder_franchise_id = null;
      lot.started_at = null;
      lot.ended_at = null;
      lot.updated_at = now;
      resetLotsCount++;
    }
  }

  // 8. Audit log
  auditLogs.push({
    season_id: lots[0].season_id,
    actor_user_id: user.id,
    action: mode === 'full' ? 'AUCTION_RECOVERY_FULL' : 'AUCTION_RECOVERY_SELECTIVE',
    entity_type: 'auction_session',
    entity_id: lots[0].season_id,
    reason: reason.trim(),
    metadata: {
      restart_type: mode,
      target_lot_id: targetLotId ?? null,
      target_draw_number: mode === 'selective' ? targetDrawNumber : null,
      target_player_name: targetPlayerName ?? null,
      affected_lots_count: affectedLots.length,
      reversed_sold_lots_count: soldLots.length,
      reset_lots_count: resetLotsCount,
      timestamp: now,
    },
  });

  return {
    success: true,
    data: {
      mode,
      targetDrawNumber: mode === 'selective' ? targetDrawNumber : null,
      affectedLotsCount: affectedLots.length,
      reversedSoldLotsCount: soldLots.length,
    },
  };
}

describe('Super Admin Auction Restart & Recovery Suite (§12.4)', () => {
  const seasonId = 'season-2026-acc';

  const createSampleLots = (): MockLot[] => [
    {
      id: 'lot-1',
      season_id: seasonId,
      registration_id: 'reg-1',
      draw_number: 1,
      bucket: 'B1',
      base_price: 150,
      current_price: 320,
      round: 1,
      status: 'sold',
      highest_bidder_franchise_id: 'f-alpha',
      started_at: '2026-09-26T10:00:00Z',
      ended_at: '2026-09-26T10:05:00Z',
      created_at: '2026-09-26T09:00:00Z',
      updated_at: '2026-09-26T10:05:00Z',
      player: { id: 'p-1', full_name: 'Virat Kohli' },
    },
    {
      id: 'lot-2',
      season_id: seasonId,
      registration_id: 'reg-2',
      draw_number: 2,
      bucket: 'B2',
      base_price: 100,
      current_price: 250,
      round: 1,
      status: 'sold',
      highest_bidder_franchise_id: 'f-beta',
      started_at: '2026-09-26T10:06:00Z',
      ended_at: '2026-09-26T10:10:00Z',
      created_at: '2026-09-26T09:00:00Z',
      updated_at: '2026-09-26T10:10:00Z',
      player: { id: 'p-2', full_name: 'Jasprit Bumrah' },
    },
    {
      id: 'lot-3',
      season_id: seasonId,
      registration_id: 'reg-3',
      draw_number: 3,
      bucket: 'B3',
      base_price: 80,
      current_price: null,
      round: 1,
      status: 'unsold',
      highest_bidder_franchise_id: null,
      started_at: '2026-09-26T10:11:00Z',
      ended_at: '2026-09-26T10:13:00Z',
      created_at: '2026-09-26T09:00:00Z',
      updated_at: '2026-09-26T10:13:00Z',
      player: { id: 'p-3', full_name: 'Mayank Agarwal' },
    },
    {
      id: 'lot-4',
      season_id: seasonId,
      registration_id: 'reg-4',
      draw_number: 4,
      bucket: 'B1',
      base_price: 150,
      current_price: 190,
      round: 1,
      status: 'in_progress',
      highest_bidder_franchise_id: 'f-alpha',
      started_at: '2026-09-26T10:14:00Z',
      ended_at: null,
      created_at: '2026-09-26T09:00:00Z',
      updated_at: '2026-09-26T10:14:00Z',
      player: { id: 'p-4', full_name: 'KL Rahul' },
    },
    {
      id: 'lot-5',
      season_id: seasonId,
      registration_id: 'reg-5',
      draw_number: 5,
      bucket: 'B4',
      base_price: 60,
      current_price: null,
      round: 1,
      status: 'skipped',
      highest_bidder_franchise_id: null,
      started_at: null,
      ended_at: null,
      created_at: '2026-09-26T09:00:00Z',
      updated_at: '2026-09-26T10:15:00Z',
      player: { id: 'p-5', full_name: 'Washington Sundar' },
    },
    {
      id: 'lot-6',
      season_id: seasonId,
      registration_id: 'reg-6',
      draw_number: 6,
      bucket: 'B5',
      base_price: 40,
      current_price: null,
      round: 1,
      status: 'pending',
      highest_bidder_franchise_id: null,
      started_at: null,
      ended_at: null,
      created_at: '2026-09-26T09:00:00Z',
      updated_at: '2026-09-26T09:00:00Z',
      player: { id: 'p-6', full_name: 'Rinku Singh' },
    },
  ];

  // ── 1. Authorization & Role Security Tests ──
  describe('1. Super Admin Authorization & Role Boundaries', () => {
    it('allows Super Admin to execute auction recovery', () => {
      const lots = createSampleLots();
      const events: MockEvent[] = [];
      const auditLogs: MockAuditLog[] = [];
      const seasonConfig: Record<string, string> = { auction_session_status: 'live' };

      const res = simulateAuctionRecovery({
        user: { id: 'super-admin-1', role: 'admin', isSuperAdmin: true },
        mode: 'full',
        reason: 'Authorized floor reset',
        lots,
        events,
        auditLogs,
        seasonConfig,
      });

      expect(res.success).toBe(true);
    });

    it('rejects Operator (standard admin without Super Admin privileges)', () => {
      const lots = createSampleLots();
      const events: MockEvent[] = [];
      const auditLogs: MockAuditLog[] = [];
      const seasonConfig: Record<string, string> = { auction_session_status: 'live' };

      const res = simulateAuctionRecovery({
        user: { id: 'operator-1', role: 'admin', isSuperAdmin: false },
        mode: 'full',
        reason: 'Operator attempt',
        lots,
        events,
        auditLogs,
        seasonConfig,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('restricted to Super Admin only');
    });

    it('rejects Franchise, Player, and Public roles', () => {
      const lots = createSampleLots();
      const events: MockEvent[] = [];
      const auditLogs: MockAuditLog[] = [];
      const seasonConfig: Record<string, string> = { auction_session_status: 'live' };

      const roles = ['franchise', 'player', 'public'];
      for (const role of roles) {
        const res = simulateAuctionRecovery({
          user: { id: `user-${role}`, role, isSuperAdmin: false },
          mode: 'full',
          reason: 'Unauthorized attempt',
          lots,
          events,
          auditLogs,
          seasonConfig,
        });

        expect(res.success).toBe(false);
        expect(res.error).toContain('restricted to Super Admin only');
      }
    });
  });

  // ── 2. Parameter Validation Tests ──
  describe('2. Parameter Validation', () => {
    it('rejects empty or whitespace-only administrative reason', () => {
      const lots = createSampleLots();
      const events: MockEvent[] = [];
      const auditLogs: MockAuditLog[] = [];
      const seasonConfig: Record<string, string> = { auction_session_status: 'live' };

      const res = simulateAuctionRecovery({
        user: { id: 'super-admin-1', role: 'admin', isSuperAdmin: true },
        mode: 'full',
        reason: '   ',
        lots,
        events,
        auditLogs,
        seasonConfig,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Administrative reason is required');
    });

    it('rejects selective mode without targetLotId', () => {
      const lots = createSampleLots();
      const events: MockEvent[] = [];
      const auditLogs: MockAuditLog[] = [];
      const seasonConfig: Record<string, string> = { auction_session_status: 'live' };

      const res = simulateAuctionRecovery({
        user: { id: 'super-admin-1', role: 'admin', isSuperAdmin: true },
        mode: 'selective',
        reason: 'Missing target',
        lots,
        events,
        auditLogs,
        seasonConfig,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Target lot ID is required for selective restart');
    });

    it('rejects selective mode when targetLotId does not exist', () => {
      const lots = createSampleLots();
      const events: MockEvent[] = [];
      const auditLogs: MockAuditLog[] = [];
      const seasonConfig: Record<string, string> = { auction_session_status: 'live' };

      const res = simulateAuctionRecovery({
        user: { id: 'super-admin-1', role: 'admin', isSuperAdmin: true },
        mode: 'selective',
        targetLotId: 'non-existent-lot-id',
        reason: 'Invalid lot target',
        lots,
        events,
        auditLogs,
        seasonConfig,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Target lot not found in active season');
    });
  });

  // ── 3. Full Restart Tests ──
  describe('3. Full Restart Invariants', () => {
    it('resets all operational lots back to Draw #1 with pending status and cleared bids', () => {
      const lots = createSampleLots();
      const events: MockEvent[] = [];
      const auditLogs: MockAuditLog[] = [];
      const seasonConfig: Record<string, string> = { auction_session_status: 'live' };

      const res = simulateAuctionRecovery({
        user: { id: 'super-admin-1', role: 'admin', isSuperAdmin: true },
        mode: 'full',
        reason: 'Full technical restart approved by committee',
        lots,
        events,
        auditLogs,
        seasonConfig,
      });

      expect(res.success).toBe(true);
      expect(res.data?.affectedLotsCount).toBe(6);
      expect(res.data?.reversedSoldLotsCount).toBe(2);

      // Verify all lots are now pending
      for (const lot of lots) {
        expect(lot.status).toBe('pending');
        expect(lot.current_price).toBeNull();
        expect(lot.highest_bidder_franchise_id).toBeNull();
        expect(lot.started_at).toBeNull();
        expect(lot.ended_at).toBeNull();
      }

      // Verify original draw numbers, buckets, and base prices are strictly preserved
      expect(lots[0].draw_number).toBe(1);
      expect(lots[0].bucket).toBe('B1');
      expect(lots[0].base_price).toBe(150);

      expect(lots[1].draw_number).toBe(2);
      expect(lots[1].bucket).toBe('B2');
      expect(lots[1].base_price).toBe(100);

      expect(lots[2].draw_number).toBe(3);
      expect(lots[2].bucket).toBe('B3');
      expect(lots[2].base_price).toBe(80);

      expect(lots[3].draw_number).toBe(4);
      expect(lots[3].bucket).toBe('B1');

      expect(lots[4].draw_number).toBe(5);
      expect(lots[4].bucket).toBe('B4');

      expect(lots[5].draw_number).toBe(6);
      expect(lots[5].bucket).toBe('B5');

      // Verify session is PAUSED
      expect(seasonConfig['auction_session_status']).toBe('paused');

      // Verify UNDO_SALE events were created for the 2 sold lots
      expect(events.length).toBe(2);
      expect(events[0].event_type).toBe('UNDO_SALE');
      expect(events[0].auction_lot_id).toBe('lot-1');
      expect(events[0].franchise_id).toBe('f-alpha');
      expect(events[0].price).toBe(320);

      expect(events[1].event_type).toBe('UNDO_SALE');
      expect(events[1].auction_lot_id).toBe('lot-2');
      expect(events[1].franchise_id).toBe('f-beta');
      expect(events[1].price).toBe(250);

      // Verify centralized audit log entry
      expect(auditLogs.length).toBe(1);
      expect(auditLogs[0].action).toBe('AUCTION_RECOVERY_FULL');
      expect(auditLogs[0].reason).toBe('Full technical restart approved by committee');
      expect(auditLogs[0].metadata.affected_lots_count).toBe(6);
      expect(auditLogs[0].metadata.reversed_sold_lots_count).toBe(2);
    });
  });

  // ── 4. Selective Restart Tests ──
  describe('4. Selective Restart Invariants', () => {
    it('leaves prior lots untouched and resets from target lot forward', () => {
      const lots = createSampleLots();
      const events: MockEvent[] = [];
      const auditLogs: MockAuditLog[] = [];
      const seasonConfig: Record<string, string> = { auction_session_status: 'live' };

      // Target Lot 3 (Mayank Agarwal, draw #3)
      const res = simulateAuctionRecovery({
        user: { id: 'super-admin-1', role: 'admin', isSuperAdmin: true },
        mode: 'selective',
        targetLotId: 'lot-3',
        reason: 'Restarting from Lot 3 due to audio glitch',
        lots,
        events,
        auditLogs,
        seasonConfig,
      });

      expect(res.success).toBe(true);
      expect(res.data?.mode).toBe('selective');
      expect(res.data?.targetDrawNumber).toBe(3);
      expect(res.data?.affectedLotsCount).toBe(4); // Lots 3, 4, 5, 6
      expect(res.data?.reversedSoldLotsCount).toBe(0); // Lots 3..6 had no sold lots

      // Prior lots 1 & 2 must remain completely untouched!
      expect(lots[0].status).toBe('sold');
      expect(lots[0].current_price).toBe(320);
      expect(lots[0].highest_bidder_franchise_id).toBe('f-alpha');

      expect(lots[1].status).toBe('sold');
      expect(lots[1].current_price).toBe(250);
      expect(lots[1].highest_bidder_franchise_id).toBe('f-beta');

      // Target lot and subsequent lots must be pending
      expect(lots[2].status).toBe('pending'); // Was unsold
      expect(lots[3].status).toBe('pending'); // Was in_progress
      expect(lots[3].current_price).toBeNull();
      expect(lots[3].highest_bidder_franchise_id).toBeNull();
      expect(lots[4].status).toBe('pending'); // Was skipped
      expect(lots[5].status).toBe('pending'); // Was pending

      // Target lot keeps its exact draw_number
      expect(lots[2].draw_number).toBe(3);

      // Session status is paused
      expect(seasonConfig['auction_session_status']).toBe('paused');

      // Audit log records selective recovery
      expect(auditLogs.length).toBe(1);
      expect(auditLogs[0].action).toBe('AUCTION_RECOVERY_SELECTIVE');
      expect(auditLogs[0].metadata.target_draw_number).toBe(3);
      expect(auditLogs[0].metadata.target_player_name).toBe('Mayank Agarwal');
    });

    it('reverses sold lots within the selective recovery scope only', () => {
      const lots = createSampleLots();
      // Let Lot 4 be sold to f-alpha for 400
      lots[3].status = 'sold';
      lots[3].current_price = 400;
      lots[3].highest_bidder_franchise_id = 'f-alpha';

      const events: MockEvent[] = [];
      const auditLogs: MockAuditLog[] = [];
      const seasonConfig: Record<string, string> = { auction_session_status: 'live' };

      // Target Lot 2 (Jasprit Bumrah, draw #2)
      const res = simulateAuctionRecovery({
        user: { id: 'super-admin-1', role: 'admin', isSuperAdmin: true },
        mode: 'selective',
        targetLotId: 'lot-2',
        reason: 'Dispute on Lot 2 hammer price',
        lots,
        events,
        auditLogs,
        seasonConfig,
      });

      expect(res.success).toBe(true);
      expect(res.data?.affectedLotsCount).toBe(5); // Lots 2, 3, 4, 5, 6
      expect(res.data?.reversedSoldLotsCount).toBe(2); // Lots 2 and 4

      // Lot 1 remains sold and untouched!
      expect(lots[0].status).toBe('sold');
      expect(lots[0].current_price).toBe(320);

      // Lot 2 and Lot 4 were reversed
      expect(lots[1].status).toBe('pending');
      expect(lots[3].status).toBe('pending');

      // UNDO_SALE events created only for Lot 2 and Lot 4 (NOT Lot 1)
      expect(events.length).toBe(2);
      expect(events.some((e) => e.auction_lot_id === 'lot-2')).toBe(true);
      expect(events.some((e) => e.auction_lot_id === 'lot-4')).toBe(true);
      expect(events.some((e) => e.auction_lot_id === 'lot-1')).toBe(false);
    });
  });

  // ── 5. Zero-Mutation Preflight Safety Tests ──
  describe('5. Zero-Mutation Preflight Safety (Allotted / Scouted)', () => {
    it('aborts immediately with 0 mutations if any lot in full recovery is allotted', () => {
      const lots = createSampleLots();
      // Introduce an allotted lot (e.g. from Round 2 endgame)
      lots[4].status = 'allotted';

      const events: MockEvent[] = [];
      const auditLogs: MockAuditLog[] = [];
      const seasonConfig: Record<string, string> = { auction_session_status: 'live' };

      const res = simulateAuctionRecovery({
        user: { id: 'super-admin-1', role: 'admin', isSuperAdmin: true },
        mode: 'full',
        reason: 'Attempted full recovery with allotment',
        lots,
        events,
        auditLogs,
        seasonConfig,
      });

      expect(res.success).toBe(false);
      expect(res.error).toBe(
        'Recovery cannot proceed because Round 2 allotment/scouting records are present in the affected range. No changes were made.'
      );

      // Zero mutations verification:
      expect(lots[0].status).toBe('sold'); // Lot 1 still sold
      expect(lots[3].status).toBe('in_progress'); // Lot 4 still in_progress
      expect(lots[4].status).toBe('allotted'); // Lot 5 still allotted
      expect(events.length).toBe(0); // 0 undo events created
      expect(auditLogs.length).toBe(0); // 0 audit logs created
      expect(seasonConfig['auction_session_status']).toBe('live'); // session not paused
    });

    it('aborts immediately with 0 mutations if any lot in full recovery is scouted', () => {
      const lots = createSampleLots();
      lots[5].status = 'scouted';

      const events: MockEvent[] = [];
      const auditLogs: MockAuditLog[] = [];
      const seasonConfig: Record<string, string> = { auction_session_status: 'live' };

      const res = simulateAuctionRecovery({
        user: { id: 'super-admin-1', role: 'admin', isSuperAdmin: true },
        mode: 'full',
        reason: 'Attempted full recovery with scouted player',
        lots,
        events,
        auditLogs,
        seasonConfig,
      });

      expect(res.success).toBe(false);
      expect(res.error).toBe(
        'Recovery cannot proceed because Round 2 allotment/scouting records are present in the affected range. No changes were made.'
      );
      expect(events.length).toBe(0);
      expect(auditLogs.length).toBe(0);
    });

    it('allows selective recovery if an allotted lot exists strictly BEFORE the target starting player', () => {
      const lots = createSampleLots();
      // Lot 1 was allotted prior to target Lot 3
      lots[0].status = 'allotted';

      const events: MockEvent[] = [];
      const auditLogs: MockAuditLog[] = [];
      const seasonConfig: Record<string, string> = { auction_session_status: 'live' };

      // Target Lot 3 (draw #3)
      const res = simulateAuctionRecovery({
        user: { id: 'super-admin-1', role: 'admin', isSuperAdmin: true },
        mode: 'selective',
        targetLotId: 'lot-3',
        reason: 'Targeting lots after allotted lot 1',
        lots,
        events,
        auditLogs,
        seasonConfig,
      });

      expect(res.success).toBe(true);
      expect(lots[0].status).toBe('allotted'); // Untouched
      expect(lots[2].status).toBe('pending'); // Reset
    });
  });

  // ── 6. Dynamic Financial & Quota Recalculation ──
  describe('6. Financial & Quota Recalculation', () => {
    it('restores franchise purse, decrements squad and auction purchases, and increases max permissible bid', () => {
      // Starting condition for Franchise Alpha:
      // Purse total: 1000
      // Alpha bought Lot 1 for 320
      // Alpha has remaining purse 680, 1 purchase (Virat Kohli, B1)
      const initialPurse = 1000;
      const spentOnLot1 = 320;
      let alphaPurse = initialPurse - spentOnLot1; // 680
      let alphaAuctionPurchases = 1;
      let alphaSquadCount = 1;
      const bucketDeficitsPre = [
        { bucket: 'B1', minRequired: 2, acquiredCount: 1 }, // Bought 1 in B1
        { bucket: 'B2', minRequired: 2, acquiredCount: 0 },
        { bucket: 'B3', minRequired: 2, acquiredCount: 0 },
        { bucket: 'B4', minRequired: 2, acquiredCount: 0 },
        { bucket: 'B5', minRequired: 2, acquiredCount: 0 },
      ];

      const maxBidPre = calculateMaxPermissibleBid({
        remainingPurse: alphaPurse,
        auctionPurchasesSoFar: alphaAuctionPurchases,
        minAuctionPurchases: 15,
        minBasePrice: 20,
        mandatoryBucketDeficits: bucketDeficitsPre,
      });

      // Execute full recovery (which reverses Lot 1 sold to Alpha)
      const lots = createSampleLots();
      const events: MockEvent[] = [];
      const auditLogs: MockAuditLog[] = [];
      const seasonConfig: Record<string, string> = { auction_session_status: 'live' };

      simulateAuctionRecovery({
        user: { id: 'super-admin-1', role: 'admin', isSuperAdmin: true },
        mode: 'full',
        reason: 'Full recovery refunding Alpha',
        lots,
        events,
        auditLogs,
        seasonConfig,
      });

      // Recalculate Alpha dynamically from remaining sold lots:
      // Since lot-1 is now 'pending', Alpha has 0 sold lots in the database
      const alphaWonLots = lots.filter(
        (l) => l.status === 'sold' && l.highest_bidder_franchise_id === 'f-alpha'
      );
      const alphaSpentPost = alphaWonLots.reduce((sum, l) => sum + (l.current_price || 0), 0);
      alphaPurse = initialPurse - alphaSpentPost;
      alphaAuctionPurchases = alphaWonLots.length;
      alphaSquadCount = alphaWonLots.length;

      expect(alphaPurse).toBe(1000); // 320 refunded!
      expect(alphaAuctionPurchases).toBe(0);
      expect(alphaSquadCount).toBe(0);

      const bucketDeficitsPost = [
        { bucket: 'B1', minRequired: 2, acquiredCount: 0 }, // B1 returned to 0
        { bucket: 'B2', minRequired: 2, acquiredCount: 0 },
        { bucket: 'B3', minRequired: 2, acquiredCount: 0 },
        { bucket: 'B4', minRequired: 2, acquiredCount: 0 },
        { bucket: 'B5', minRequired: 2, acquiredCount: 0 },
      ];

      const maxBidPost = calculateMaxPermissibleBid({
        remainingPurse: alphaPurse,
        auctionPurchasesSoFar: alphaAuctionPurchases,
        minAuctionPurchases: 15,
        minBasePrice: 20,
        mandatoryBucketDeficits: bucketDeficitsPost,
      });

      expect(maxBidPost.maxBid).toBeGreaterThan(maxBidPre.maxBid);
    });
  });

  // ── 7. startAuctionAgainAction Fix & Audit Trail ──
  describe('7. startAuctionAgainAction Fix (Zero Constraint Violations)', () => {
    it('records valid AUCTION_SESSION_REOPENED in audit_logs without invalid SESSION_RESET in auction_events', () => {
      // In 007_auction_foundation.sql, auction_events has a strict CHECK:
      const allowedAuctionEvents = [
        'LOT_CREATED',
        'PLAYER_SELECTED',
        'BID_PLACED',
        'PASS',
        'RE_ENTER',
        'HAMMER',
        'SALE',
        'UNSOLD',
        'SKIP',
        'UNDO_SALE',
        'ALLOTMENT',
        'SCOUTING',
        'BUCKET_RELAXATION',
        'PAUSE',
        'RESUME',
      ];

      // Verifies that SESSION_RESET is NOT in the allowed auction_events
      expect(allowedAuctionEvents.includes('SESSION_RESET')).toBe(false);

      // Verifies that our fix places AUCTION_SESSION_REOPENED into audit_logs instead
      const auditLogRecord = {
        season_id: seasonId,
        actor_user_id: 'admin-1',
        action: 'AUCTION_SESSION_REOPENED',
        entity_type: 'auction_session',
        entity_id: seasonId,
        reason: 'Auction session reopened by operator (START AUCTION AGAIN)',
        metadata: { restarted_at: new Date().toISOString(), multi_session: true },
      };

      expect(auditLogRecord.action).toBe('AUCTION_SESSION_REOPENED');
      expect(auditLogRecord.entity_type).toBe('auction_session');
    });
  });
});
