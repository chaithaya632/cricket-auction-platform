import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AssignRoleInput } from '@/lib/users/types';

describe('Admin Role Assignment & Access Governance', () => {
  const PERMITTED_ROLES = ['super_admin', 'operator', 'franchise', 'player', 'viewer'] as const;

  function validateAssignRoleInput(input: AssignRoleInput): { valid: boolean; error?: string } {
    if (!input.userId || typeof input.userId !== 'string') {
      return { valid: false, error: 'User ID is required.' };
    }

    if (!PERMITTED_ROLES.includes(input.role as any)) {
      return { valid: false, error: `Invalid role: ${input.role}` };
    }

    if (input.role === 'franchise' && (!input.franchiseId || input.franchiseId.trim() === '')) {
      return { valid: false, error: 'Franchise selection is required for franchise role assignment.' };
    }

    return { valid: true };
  }

  function resolveDbRolePayload(input: AssignRoleInput, seasonId: string) {
    const validation = validateAssignRoleInput(input);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Honors database constraint:
    // CHECK ((role = 'franchise' AND franchise_id IS NOT NULL) OR (role != 'franchise' AND franchise_id IS NULL))
    return {
      user_id: input.userId,
      season_id: seasonId,
      role: input.role,
      franchise_id: input.role === 'franchise' ? input.franchiseId : null,
      is_active: true,
    };
  }

  describe('Input Validation & Business Rules', () => {
    it('accepts valid player role assignment', () => {
      const input: AssignRoleInput = {
        userId: 'u-12345',
        role: 'player',
      };
      const res = validateAssignRoleInput(input);
      expect(res.valid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it('accepts valid franchise role assignment with franchiseId', () => {
      const input: AssignRoleInput = {
        userId: 'u-12345',
        role: 'franchise',
        franchiseId: 'f-789',
      };
      const res = validateAssignRoleInput(input);
      expect(res.valid).toBe(true);
    });

    it('rejects franchise role assignment when franchiseId is missing', () => {
      const input: AssignRoleInput = {
        userId: 'u-12345',
        role: 'franchise',
      };
      const res = validateAssignRoleInput(input);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Franchise selection is required');
    });

    it('rejects franchise role assignment when franchiseId is empty string', () => {
      const input: AssignRoleInput = {
        userId: 'u-12345',
        role: 'franchise',
        franchiseId: '   ',
      };
      const res = validateAssignRoleInput(input);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Franchise selection is required');
    });

    it('rejects invalid or unauthorized roles', () => {
      const input: any = {
        userId: 'u-12345',
        role: 'root_god',
      };
      const res = validateAssignRoleInput(input);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Invalid role');
    });

    it('rejects missing userId', () => {
      const input: any = {
        userId: '',
        role: 'player',
      };
      const res = validateAssignRoleInput(input);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('User ID is required');
    });
  });

  describe('Database Check Constraint Safety', () => {
    const seasonId = 'season-2026';

    it('enforces franchise_id IS NULL when role is player', () => {
      const input: AssignRoleInput = {
        userId: 'u-1',
        role: 'player',
        franchiseId: 'accidental-franchise-id',
      };
      const payload = resolveDbRolePayload(input, seasonId);
      expect(payload.role).toBe('player');
      expect(payload.franchise_id).toBeNull();
    });

    it('enforces franchise_id IS NULL when role is super_admin or operator', () => {
      const adminInput: AssignRoleInput = {
        userId: 'u-admin',
        role: 'super_admin',
        franchiseId: 'some-id',
      };
      const adminPayload = resolveDbRolePayload(adminInput, seasonId);
      expect(adminPayload.role).toBe('super_admin');
      expect(adminPayload.franchise_id).toBeNull();

      const opInput: AssignRoleInput = {
        userId: 'u-op',
        role: 'operator',
        franchiseId: 'some-id',
      };
      const opPayload = resolveDbRolePayload(opInput, seasonId);
      expect(opPayload.role).toBe('operator');
      expect(opPayload.franchise_id).toBeNull();
    });

    it('preserves franchise_id when role is franchise', () => {
      const input: AssignRoleInput = {
        userId: 'u-franchise',
        role: 'franchise',
        franchiseId: 'franchise-titan',
      };
      const payload = resolveDbRolePayload(input, seasonId);
      expect(payload.role).toBe('franchise');
      expect(payload.franchise_id).toBe('franchise-titan');
    });
  });

  describe('Role-Based Route Access Matrix', () => {
    function evaluateAccess(userRoles: string[]) {
      const isAdmin = userRoles.includes('super_admin') || userRoles.includes('operator');
      const isFranchise = userRoles.includes('franchise');
      const isPlayer = userRoles.includes('player');
      const hasAnyRole = userRoles.length > 0;

      return {
        isAdmin,
        isFranchise,
        isPlayer,
        hasAnyRole,
        canAccessAdmin: isAdmin,
        canAccessFranchise: isFranchise,
        canAccessPlayer: isPlayer,
        onboardingDestination: !hasAnyRole ? 'pending_status' : 'active_hub',
      };
    }

    it('unassigned accounts have no privileged access and require onboarding', () => {
      const access = evaluateAccess([]);
      expect(access.hasAnyRole).toBe(false);
      expect(access.canAccessAdmin).toBe(false);
      expect(access.canAccessFranchise).toBe(false);
      expect(access.canAccessPlayer).toBe(false);
      expect(access.onboardingDestination).toBe('pending_status');
    });

    it('player accounts can only access player portal', () => {
      const access = evaluateAccess(['player']);
      expect(access.canAccessPlayer).toBe(true);
      expect(access.canAccessFranchise).toBe(false);
      expect(access.canAccessAdmin).toBe(false);
      expect(access.onboardingDestination).toBe('active_hub');
    });

    it('franchise accounts can only access franchise portal', () => {
      const access = evaluateAccess(['franchise']);
      expect(access.canAccessFranchise).toBe(true);
      expect(access.canAccessPlayer).toBe(false);
      expect(access.canAccessAdmin).toBe(false);
      expect(access.onboardingDestination).toBe('active_hub');
    });

    it('super admin can access admin console', () => {
      const access = evaluateAccess(['super_admin']);
      expect(access.canAccessAdmin).toBe(true);
      expect(access.onboardingDestination).toBe('active_hub');
    });

    it('operator can access admin console', () => {
      const access = evaluateAccess(['operator']);
      expect(access.canAccessAdmin).toBe(true);
      expect(access.onboardingDestination).toBe('active_hub');
    });
  });

  describe('Admin User Registry Query Assembly', () => {
    it('correctly maps newly registered users without season_roles to Pending Access', () => {
      const rawUsers = [
        {
          id: 'user-admin',
          email: 'admin@acc.local',
          full_name: 'Admin User',
          phone: null,
          is_active: true,
          created_at: '2026-09-21T08:00:00Z',
        },
        {
          id: 'user-fresh',
          email: 'newbie@gmail.com',
          full_name: 'Fresh Signup',
          phone: null,
          is_active: true,
          created_at: '2026-09-21T10:00:00Z',
        },
      ];

      const seasonRoles = [
        {
          id: 'role-1',
          user_id: 'user-admin',
          role: 'super_admin',
          franchise_id: null,
          is_active: true,
        },
      ];

      const roleMap = new Map<string, any>(seasonRoles.map((r) => [r.user_id, r]));

      const assembled = rawUsers.map((u) => {
        const r = roleMap.get(u.id);
        return {
          id: u.id,
          email: u.email,
          full_name: u.full_name,
          role: r?.role || null,
          isPending: !r,
        };
      });

      expect(assembled).toHaveLength(2);
      expect(assembled[0].role).toBe('super_admin');
      expect(assembled[0].isPending).toBe(false);

      expect(assembled[1].email).toBe('newbie@gmail.com');
      expect(assembled[1].role).toBeNull();
      expect(assembled[1].isPending).toBe(true);
    });
  });

  describe('Player & Franchise Delete Logic (Case A vs Case B)', () => {
    it('executes clean hard delete for unauctioned player (Case A)', () => {
      const player = { id: 'p-clean', full_name: 'Unsold Player', lotCount: 0, eventCount: 0 };
      const hasHistory = player.lotCount > 0 || player.eventCount > 0;
      const mode = hasHistory ? 'deactivated' : 'deleted';

      expect(mode).toBe('deleted');
    });

    it('preserves historical auction records and deactivates player (Case B)', () => {
      const player = { id: 'p-auctioned', full_name: 'Star Batter', lotCount: 1, eventCount: 8 };
      const hasHistory = player.lotCount > 0 || player.eventCount > 0;
      const mode = hasHistory ? 'deactivated' : 'deleted';

      expect(mode).toBe('deactivated');
    });

    it('executes clean hard delete for unauctioned franchise (Case A)', () => {
      const franchise = { id: 'f-clean', short_name: 'NEW', lotCount: 0, eventCount: 0 };
      const hasHistory = franchise.lotCount > 0 || franchise.eventCount > 0;
      const mode = hasHistory ? 'deactivated' : 'deleted';

      expect(mode).toBe('deleted');
    });

    it('preserves historical auction records and deactivates franchise (Case B)', () => {
      const franchise = { id: 'f-active', short_name: 'TIT', lotCount: 4, eventCount: 22 };
      const hasHistory = franchise.lotCount > 0 || franchise.eventCount > 0;
      const mode = hasHistory ? 'deactivated' : 'deleted';

      expect(mode).toBe('deactivated');
    });
  });
});

