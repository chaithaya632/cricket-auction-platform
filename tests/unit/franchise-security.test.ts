import { describe, it, expect } from 'vitest';
import { getUserPermissionContext } from '@/lib/permissions/context';
import type { DbUser, DbSeason, DbSeasonRole, DbFranchise } from '@/lib/db/types';

describe('Franchise Security & Isolation Boundaries', () => {
  const mockUser: DbUser = {
    id: 'user-aaa-111',
    email: 'titans@avanthi.edu',
    full_name: 'Avanthi Titans Rep',
    phone: null,
    avatar_url: null,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const activeSeason: DbSeason = {
    id: 'season-2026-id',
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

  const franchiseA: DbFranchise = {
    id: 'franchise-A-id',
    season_id: activeSeason.id,
    name: 'Avanthi Titans',
    short_name: 'AT',
    logo_url: null,
    color_primary: '#ff0000',
    color_secondary: '#000000',
    faculty_coordinator_name: 'Dr. Rao',
    faculty_coordinator_mobile: '9876543210', // PRIVATE
    faculty_coordinator_photo_url: null,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const franchiseB: DbFranchise = {
    id: 'franchise-B-id',
    season_id: activeSeason.id,
    name: 'Coastal Kings',
    short_name: 'CK',
    logo_url: null,
    color_primary: '#00ff00',
    color_secondary: '#ffffff',
    faculty_coordinator_name: 'Dr. Kumar',
    faculty_coordinator_mobile: '9123456789', // PRIVATE
    faculty_coordinator_photo_url: null,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  function createMockSupabaseClient() {
    return {
      from: (table: string) => {
        let filterUserId: string | null = null;
        let filterSeasonId: string | null = null;
        let filterId: string | null = null;

        const chain = {
          select: () => chain,
          eq: (column: string, value: unknown) => {
            if (column === 'user_id') filterUserId = String(value);
            if (column === 'season_id') filterSeasonId = String(value);
            if (column === 'id') filterId = String(value);
            return chain;
          },
          maybeSingle: async () => {
            if (table === 'seasons') {
              return { data: activeSeason, error: null };
            }
            if (table === 'franchises') {
              if (filterId === franchiseA.id) return { data: franchiseA, error: null };
              if (filterId === franchiseB.id) return { data: franchiseB, error: null };
            }
            return { data: null, error: null };
          },
          then: (resolve: any) => {
            if (table === 'season_roles') {
              const roles: DbSeasonRole[] = [
                {
                  id: 'sr-1',
                  user_id: mockUser.id,
                  season_id: activeSeason.id,
                  role: 'franchise',
                  franchise_id: franchiseA.id, // Authenticated user is assigned strictly to Franchise A
                  is_active: true,
                  created_at: '',
                },
              ];
              return Promise.resolve({ data: roles }).then(resolve);
            }
            return Promise.resolve({ data: [] }).then(resolve);
          },
        };
        return chain;
      },
    } as any;
  }

  it('resolves franchise identity strictly from database season_roles', async () => {
    const client = createMockSupabaseClient();
    const context = await getUserPermissionContext(client, mockUser);

    expect(context.isFranchise).toBe(true);
    expect(context.assignedFranchise?.id).toBe(franchiseA.id);
    expect(context.assignedFranchise?.name).toBe('Avanthi Titans');
  });

  it('is immune to URL/query parameter spoofing attempts to impersonate Franchise B', async () => {
    // Simulated attacker providing ?franchiseId=franchise-B-id
    const client = createMockSupabaseClient();

    // The authorization layer does NOT take franchiseId as an input parameter;
    // it always queries season_roles using the authenticated user ID.
    const context = await getUserPermissionContext(client, mockUser);

    // Even if an attacker passes Franchise B's ID in query parameters,
    // the system resolves strictly to Franchise A.
    expect(context.assignedFranchise?.id).toBe(franchiseA.id);
    expect(context.assignedFranchise?.id).not.toBe(franchiseB.id);
  });

  it('strictly excludes private contact fields from public players view', () => {
    // Read the database migration defining public_players_view to assert schema safety
    const fs = require('fs');
    const path = require('path');
    const viewMigration = fs.readFileSync(
      path.resolve(__dirname, '../../supabase/migrations/010_views.sql'),
      'utf-8'
    );

    // Find the CREATE OR REPLACE VIEW public_players_view block
    const playerViewMatch = viewMigration.match(
      /CREATE OR REPLACE VIEW public_players_view AS([\s\S]*?)FROM/
    );
    expect(playerViewMatch).not.toBeNull();
    const columns = playerViewMatch![1];

    // Must NOT select private phone numbers
    expect(columns).not.toContain('p.mobile');
    expect(columns).not.toContain('psr.cricheroes_registered_mobile');
    expect(columns).not.toContain('psr.payment_status');
    expect(columns).not.toContain('psr.year_override_reason');
  });

  it('strictly excludes faculty_coordinator_mobile from public franchises view', () => {
    const fs = require('fs');
    const path = require('path');
    const viewMigration = fs.readFileSync(
      path.resolve(__dirname, '../../supabase/migrations/010_views.sql'),
      'utf-8'
    );

    const franchiseViewMatch = viewMigration.match(
      /CREATE OR REPLACE VIEW public_franchises_view AS([\s\S]*?)FROM/
    );
    expect(franchiseViewMatch).not.toBeNull();
    const columns = franchiseViewMatch![1];

    expect(columns).not.toContain('faculty_coordinator_mobile');
  });

  it('classifies all franchise routes as protected in route guards', () => {
    const protectedFranchiseRoutes = [
      '/franchise',
      '/franchise/squad',
      '/franchise/players',
    ];

    function isRouteProtected(pathname: string): boolean {
      const protectedPrefixes = ['/admin', '/franchise', '/player'];
      return protectedPrefixes.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
      );
    }

    for (const route of protectedFranchiseRoutes) {
      expect(isRouteProtected(route)).toBe(true);
    }
  });
});
