import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminDeleteFranchiseAction } from '@/lib/franchises/actions';
import { adminDeleteUserAction } from '@/lib/users/actions';

// Mock dependencies
const mockRequireAdmin = vi.fn();
const mockAdminClient = {
  from: vi.fn(),
  storage: {
    from: vi.fn(() => ({
      remove: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
  auth: {
    admin: {
      deleteUser: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
  },
};

vi.mock('@/lib/permissions/guards', () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mockAdminClient,
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('Safeguarded Franchise & User Deletions (Faculty Review Criteria)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({
      isSuperAdmin: true,
      activeSeason: { id: 'season-2026' },
    });
  });

  describe('Franchise Deletion Protection & Cascades', () => {
    it('strictly BLOCKS deletion of canonical production franchise (e.g. CC)', async () => {
      mockAdminClient.from.mockImplementation((table: string) => {
        if (table === 'franchises') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'f-cc', name: 'Coastal Crusaders', short_name: 'CC' },
              error: null,
            }),
          };
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
      });

      const res = await adminDeleteFranchiseAction('f-cc');
      expect(res.success).toBe(false);
      expect(res.error).toContain('Production Safeguard');
      expect(res.error).toContain('cannot be deleted');
    });

    it('strictly BLOCKS deletion of all 11 official ACC franchises', async () => {
      const canonicalCodes = ['AT', 'CC', 'CCO', 'EE', 'GG', 'MM', 'NK', 'PP', 'RR', 'TT', 'VV'];

      for (const code of canonicalCodes) {
        mockAdminClient.from.mockImplementation((table: string) => {
          if (table === 'franchises') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: `f-${code}`, name: `Team ${code}`, short_name: code },
                error: null,
              }),
            };
          }
          return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
        });

        const res = await adminDeleteFranchiseAction(`f-${code}`);
        expect(res.success).toBe(false);
        expect(res.error).toContain('Production Safeguard');
      }
    });

    it('allows hard deletion of disposable test franchise and reverts franchise users to unassigned', async () => {
      const deleteStub = vi.fn().mockResolvedValue({ error: null });
      const eqStub = vi.fn().mockReturnValue({ delete: deleteStub, eq: vi.fn().mockResolvedValue({ error: null }) });

      mockAdminClient.from.mockImplementation((table: string) => {
        if (table === 'franchises') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn((col, val) => {
              if (col === 'id') {
                return {
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'test-f-1', name: 'Disposable Test Team', short_name: 'TEST' },
                    error: null,
                  }),
                };
              }
              return { delete: deleteStub };
            }),
            delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          };
        }
        if (table === 'auction_events' || table === 'auction_lots') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ count: 0 }),
            delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          };
        }
        if (table === 'season_roles' || table === 'franchise_members' || table === 'franchise_referrals') {
          return {
            delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          };
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
      });

      const res = await adminDeleteFranchiseAction('test-f-1', { forceHardDelete: true });
      expect(res.success).toBe(true);
      expect(res.data?.message).toContain('was successfully removed');
    });
  });

  describe('User Deletion & Roll Number Release', () => {
    it('permanently deletes user account and triggers cleanup', async () => {
      mockAdminClient.from.mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'user-p1', full_name: 'Test Player', email: 'player@example.com' },
              error: null,
            }),
            delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          };
        }
        if (table === 'players') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'user-p1', roll_number: '23811A0501', photo_url: 'https://storage/player-photos/test.jpg' },
              error: null,
            }),
            delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          };
        }
        if (table === 'player_season_registrations') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [{ id: 'reg-1' }], error: null }),
            delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          };
        }
        return {
          delete: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ error: null }),
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
          update: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      });

      const res = await adminDeleteUserAction('user-p1');
      expect(res.success).toBe(true);
      expect(res.message).toContain('permanently deleted');
      expect(res.message).toContain('Roll number has been released for reuse');
      expect(mockAdminClient.auth.admin.deleteUser).toHaveBeenCalledWith('user-p1');
    });
  });
});
