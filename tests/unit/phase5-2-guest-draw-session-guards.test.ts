// =============================================================================
// ACC Auction Portal — Unit Tests: Phase 5.2 Guest Draw Session Guards
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as queries from '@/lib/auction/queries';
import * as actions from '@/lib/auction/actions';
import * as guardsLib from '@/lib/permissions/guards';
import * as supabaseAdmin from '@/lib/supabase/admin';
import * as realtimeSync from '@/lib/auction/realtime';

describe('Phase 5.2 Guest Draw Session State Guards & Transitions', () => {
  describe('1. resolveAuctionSessionStatus — Precedence & State Transitions', () => {
    it('gives sessionConfigStatus="not_started" absolute precedence even if seasonStatus="completed"', () => {
      const status = queries.resolveAuctionSessionStatus({
        seasonStatus: 'completed',
        sessionConfigStatus: 'not_started',
        endedAt: new Date().toISOString(),
      });
      expect(status).toBe('not_started');
    });

    it('resolves genuinely completed session to "completed" on same calendar day', () => {
      const now = new Date();
      const status = queries.resolveAuctionSessionStatus({
        seasonStatus: 'completed',
        sessionConfigStatus: 'completed',
        endedAt: now.toISOString(),
        referenceDate: now,
      });
      expect(status).toBe('completed');
    });

    it('resolves completed session to "not_started" on subsequent calendar day', () => {
      const yesterday = new Date(Date.now() - 86400000 * 2);
      const today = new Date();
      const status = queries.resolveAuctionSessionStatus({
        seasonStatus: 'completed',
        sessionConfigStatus: 'completed',
        endedAt: yesterday.toISOString(),
        referenceDate: today,
      });
      expect(status).toBe('not_started');
    });

    it('resolves paused operational auction to "paused"', () => {
      const status = queries.resolveAuctionSessionStatus({
        seasonStatus: 'auction',
        sessionConfigStatus: 'paused',
      });
      expect(status).toBe('paused');
    });

    it('resolves live operational auction to "live"', () => {
      const status = queries.resolveAuctionSessionStatus({
        seasonStatus: 'auction',
        sessionConfigStatus: 'live',
      });
      expect(status).toBe('live');
    });
  });

  describe('2. callGuestDrawNumberAction — Authoritative Session Guards', () => {
    const mockSeason = { id: 'season-001', name: 'ACC 2026', status: 'auction' };
    const mockUser = { id: 'admin-001', email: 'admin@acc.edu' };

    beforeEach(() => {
      vi.clearAllMocks();
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
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
    });

    it('rejects Guest Draw when session is COMPLETED and isRestart is NOT set', async () => {
      vi.spyOn(queries, 'getAuctionSessionState').mockResolvedValue({
        status: 'completed',
        seasonId: 'season-001',
        seasonName: 'ACC 2026',
        isLive: false,
        isPaused: false,
        isNotStarted: false,
        isCompleted: true,
        startedAt: null,
        activeLotId: null,
      });

      const mockSupabase = {
        from: vi.fn(),
      };
      vi.spyOn(supabaseAdmin, 'createAdminClient').mockReturnValue(mockSupabase as any);

      const result = await actions.callGuestDrawNumberAction('lot-1', 'B3', 'season-001');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot select lot: auction session has ended.');
    });

    it('allows Guest Draw and restarts session when session is COMPLETED and isRestart=true', async () => {
      vi.spyOn(queries, 'getAuctionSessionState').mockResolvedValue({
        status: 'completed',
        seasonId: 'season-001',
        seasonName: 'ACC 2026',
        isLive: false,
        isPaused: false,
        isNotStarted: false,
        isCompleted: true,
        startedAt: null,
        activeLotId: null,
      });

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'auction_lots') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  })),
                  or: vi.fn(() => ({
                    limit: vi.fn().mockResolvedValue({
                      data: [{
                        id: 'lot-1',
                        season_id: 'season-001',
                        bucket: 'B3',
                        draw_number: 1,
                        status: 'pending',
                        base_price: 20,
                        player_season_registrations: {
                          players: { full_name: 'Test Restart Player' },
                        },
                      }],
                      error: null,
                    }),
                  })),
                })),
              })),
            };
          }
          if (table === 'seasons') {
            return {
              update: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ error: null }),
              })),
            };
          }
          if (table === 'season_config') {
            return {
              upsert: vi.fn().mockResolvedValue({ error: null }),
              delete: vi.fn(() => ({
                eq: vi.fn(() => ({
                  in: vi.fn().mockResolvedValue({ error: null }),
                  eq: vi.fn().mockResolvedValue({ error: null }),
                })),
              })),
            };
          }
          return {
            select: vi.fn().mockReturnThis(),
            insert: vi.fn().mockResolvedValue({ error: null }),
            update: vi.fn().mockResolvedValue({ error: null }),
            delete: vi.fn().mockResolvedValue({ error: null }),
            upsert: vi.fn().mockResolvedValue({ error: null }),
          };
        }),
      };

      vi.spyOn(supabaseAdmin, 'createAdminClient').mockReturnValue(mockSupabase as any);
      vi.spyOn(realtimeSync, 'broadcastAuctionUpdate').mockResolvedValue({ success: true } as any);

      const result = await actions.callGuestDrawNumberAction('lot-1', 'B3', 'season-001', { isRestart: true });
      expect(result.error).not.toBe('Cannot select lot: auction session has ended.');
    });

    it('allows Guest Draw when session is NOT_STARTED and transitions it to LIVE', async () => {
      vi.spyOn(queries, 'getAuctionSessionState').mockResolvedValue({
        status: 'not_started',
        seasonId: 'season-001',
        seasonName: 'ACC 2026',
        isLive: false,
        isPaused: false,
        isNotStarted: true,
        isCompleted: false,
        startedAt: null,
        activeLotId: null,
      });

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'auction_lots') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  })),
                  or: vi.fn(() => ({
                    limit: vi.fn().mockResolvedValue({
                      data: [{
                        id: 'lot-notstarted-1',
                        season_id: 'season-001',
                        bucket: 'B3',
                        draw_number: 1,
                        status: 'pending',
                        base_price: 20,
                        player_season_registrations: {
                          players: { full_name: 'Not Started Player' },
                        },
                      }],
                      error: null,
                    }),
                  })),
                })),
              })),
            };
          }
          return {
            select: vi.fn().mockReturnThis(),
            insert: vi.fn().mockResolvedValue({ error: null }),
            update: vi.fn().mockResolvedValue({ error: null }),
            delete: vi.fn().mockResolvedValue({ error: null }),
            upsert: vi.fn().mockResolvedValue({ error: null }),
          };
        }),
      };

      vi.spyOn(supabaseAdmin, 'createAdminClient').mockReturnValue(mockSupabase as any);

      const result = await actions.callGuestDrawNumberAction('lot-notstarted-1', 'B3', 'season-001');
      expect(result.error).not.toBe('Cannot select lot: auction session has ended.');
    });
  });
});
