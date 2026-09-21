import { describe, it, expect } from 'vitest';
import { getUserPermissionContext, hasSeasonRole } from '@/lib/permissions/context';
import type { DbUser, DbSeason, DbSeasonRole, DbFranchise } from '@/lib/db/types';

// =============================================================================
// Phase 3 Permissions & Authorization Tests
// =============================================================================

describe('Season-aware Permission Resolution', () => {
  const mockUser: DbUser = {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'admin@avanthi.edu',
    full_name: 'ACC Admin',
    phone: null,
    avatar_url: null,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const season2026: DbSeason = {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'ACC 2026',
    code: 'acc-2026',
    year: 2026,
    status: 'draft',
    start_date: null,
    end_date: null,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const season2027: DbSeason = {
    id: '00000000-0000-0000-0000-000000000002',
    name: 'ACC 2027',
    code: 'acc-2027',
    year: 2027,
    status: 'draft',
    start_date: null,
    end_date: null,
    is_active: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockFranchise: DbFranchise = {
    id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    season_id: season2026.id,
    name: 'Royal Challengers Avanthi',
    short_name: 'RCA',
    logo_url: null,
    color_primary: '#ff0000',
    color_secondary: '#000000',
    faculty_coordinator_name: 'Prof. Sharma',
    faculty_coordinator_mobile: '9876543210',
    faculty_coordinator_photo_url: null,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  function createMockSupabase(options: {
    activeSeason?: DbSeason | null;
    roles?: DbSeasonRole[];
    franchise?: DbFranchise | null;
  }) {
    return {
      from: (table: string) => {
        let filterSeasonId: string | null = null;
        let filterUserId: string | null = null;
        let filterFranchiseId: string | null = null;

        const chain = {
          select: () => chain,
          eq: (column: string, value: unknown) => {
            if (column === 'is_active' && value === true && table === 'seasons') {
              // active season lookup
            }
            if (column === 'season_id') filterSeasonId = String(value);
            if (column === 'user_id') filterUserId = String(value);
            if (column === 'id' && table === 'franchises') filterFranchiseId = String(value);
            return chain;
          },
          maybeSingle: async () => {
            if (table === 'seasons') {
              return { data: options.activeSeason ?? null, error: null };
            }
            if (table === 'franchises') {
              return { data: options.franchise ?? null, error: null };
            }
            return { data: null, error: null };
          },
          then: <TResult1 = { data: DbSeasonRole[] }, TResult2 = never>(
            onfulfilled?: ((value: { data: DbSeasonRole[] }) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
          ): Promise<TResult1 | TResult2> => {
            const matchingRoles = (options.roles || []).filter((r) => {
              if (filterSeasonId && r.season_id !== filterSeasonId) return false;
              if (filterUserId && r.user_id !== filterUserId) return false;
              return true;
            });
            return Promise.resolve({ data: matchingRoles }).then(onfulfilled, onrejected);
          },
        };

        return chain;
      },
    } as unknown as Parameters<typeof getUserPermissionContext>[0];
  }

  it('accepts super_admin role for active season', async () => {
    const roles: DbSeasonRole[] = [
      {
        id: 'r1',
        user_id: mockUser.id,
        season_id: season2026.id,
        role: 'super_admin',
        franchise_id: null,
        is_active: true,
        created_at: '',
      },
    ];

    const client = createMockSupabase({ activeSeason: season2026, roles });
    const context = await getUserPermissionContext(client, mockUser);

    expect(context.isSuperAdmin).toBe(true);
    expect(context.isAdmin).toBe(true);
    expect(context.isOperator).toBe(false);
    expect(context.isFranchise).toBe(false);
  });

  it('accepts operator role as an admin', async () => {
    const roles: DbSeasonRole[] = [
      {
        id: 'r2',
        user_id: mockUser.id,
        season_id: season2026.id,
        role: 'operator',
        franchise_id: null,
        is_active: true,
        created_at: '',
      },
    ];

    const client = createMockSupabase({ activeSeason: season2026, roles });
    const context = await getUserPermissionContext(client, mockUser);

    expect(context.isOperator).toBe(true);
    expect(context.isAdmin).toBe(true);
    expect(context.isSuperAdmin).toBe(false);
  });

  it('rejects player/viewer from admin privileges', async () => {
    const roles: DbSeasonRole[] = [
      {
        id: 'r3',
        user_id: mockUser.id,
        season_id: season2026.id,
        role: 'player',
        franchise_id: null,
        is_active: true,
        created_at: '',
      },
    ];

    const client = createMockSupabase({ activeSeason: season2026, roles });
    const context = await getUserPermissionContext(client, mockUser);

    expect(context.isAdmin).toBe(false);
    expect(context.isSuperAdmin).toBe(false);
    expect(context.isOperator).toBe(false);
    expect(context.isPlayer).toBe(true);
  });

  it('accepts franchise role and loads assigned franchise from DB', async () => {
    const roles: DbSeasonRole[] = [
      {
        id: 'r4',
        user_id: mockUser.id,
        season_id: season2026.id,
        role: 'franchise',
        franchise_id: mockFranchise.id,
        is_active: true,
        created_at: '',
      },
    ];

    const client = createMockSupabase({
      activeSeason: season2026,
      roles,
      franchise: mockFranchise,
    });
    const context = await getUserPermissionContext(client, mockUser);

    expect(context.isFranchise).toBe(true);
    expect(context.assignedFranchise).not.toBeNull();
    expect(context.assignedFranchise?.id).toBe(mockFranchise.id);
    expect(context.assignedFranchise?.short_name).toBe('RCA');
  });

  it('enforces season isolation: roles in Season A do NOT grant privileges in Season B', async () => {
    // User was super_admin in 2026, but checking permissions for 2027
    const roles: DbSeasonRole[] = [
      {
        id: 'r5',
        user_id: mockUser.id,
        season_id: season2026.id,
        role: 'super_admin',
        franchise_id: null,
        is_active: true,
        created_at: '',
      },
    ];

    const client = createMockSupabase({ activeSeason: season2027, roles });
    const context = await getUserPermissionContext(client, mockUser, season2027.id);

    // Should have NO roles in season 2027
    expect(context.isAdmin).toBe(false);
    expect(context.isSuperAdmin).toBe(false);
    expect(context.roles.length).toBe(0);
  });

  it('ignores inactive roles', () => {
    const roles: DbSeasonRole[] = [
      {
        id: 'r6',
        user_id: mockUser.id,
        season_id: season2026.id,
        role: 'super_admin',
        franchise_id: null,
        is_active: false,
        created_at: '',
      },
    ];

    expect(hasSeasonRole(roles, 'super_admin')).toBe(false);
  });
});
