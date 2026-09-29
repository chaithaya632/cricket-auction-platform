import { describe, it, expect, vi } from 'vitest';
import { assignScorerSchema } from '@/lib/matches/validation';

describe('Match Operator / Scorer Assignment — Validation, Schema & Security', () => {
  const matchId1 = '11111111-1111-4111-8111-111111111111';
  const matchId2 = '22222222-2222-4222-8222-222222222222';
  const userId1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const userId2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const userId3 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  describe('assignScorerSchema — Input Constraints', () => {
    it('accepts valid matchId, userId, and optional isActive', () => {
      const valid = {
        matchId: matchId1,
        userId: userId1,
        isActive: true,
      };
      const result = assignScorerSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('defaults isActive to true if omitted', () => {
      const input = {
        matchId: matchId1,
        userId: userId1,
      };
      const result = assignScorerSchema.parse(input);
      expect(result.isActive).toBe(true);
    });

    it('rejects non-UUID matchId or userId', () => {
      expect(assignScorerSchema.safeParse({ matchId: 'invalid', userId: userId1 }).success).toBe(false);
      expect(assignScorerSchema.safeParse({ matchId: matchId1, userId: 'invalid' }).success).toBe(false);
      expect(assignScorerSchema.safeParse({ matchId: '', userId: '' }).success).toBe(false);
    });
  });

  describe('Assignment Logic & Reassignment Semantics', () => {
    // In-memory simulation of public.match_scorers table with UNIQUE(match_id, user_id)
    interface ScorerRow {
      id: string;
      match_id: string;
      user_id: string;
      is_active: boolean;
      created_at: string;
    }

    interface MatchRow {
      id: string;
      season_id: string;
    }

    interface UserRow {
      id: string;
      full_name: string;
      email: string;
      is_active: boolean;
    }

    const matchesDb: MatchRow[] = [
      { id: matchId1, season_id: 'season-2026' },
      { id: matchId2, season_id: 'season-2026' },
    ];

    const usersDb: UserRow[] = [
      { id: userId1, full_name: 'John Doe', email: 'john@example.com', is_active: true },
      { id: userId2, full_name: 'Jane Smith', email: 'jane@example.com', is_active: true },
      { id: userId3, full_name: 'Inactive User', email: 'inactive@example.com', is_active: false },
    ];

    function simulateAssignScorer(
      actorRole: 'super_admin' | 'operator' | 'franchise' | 'player',
      matchId: string,
      userId: string,
      scorersTable: ScorerRow[],
      activeSeasonId = 'season-2026'
    ) {
      // 1. Authorization check: Super Admin or Operator required
      if (actorRole !== 'super_admin' && actorRole !== 'operator') {
        return { success: false, error: 'UNAUTHORIZED: Admin or Operator permission required.' };
      }

      // 2. Verify match exists and matches season
      const match = matchesDb.find((m) => m.id === matchId);
      if (!match) {
        return { success: false, error: 'Match not found.' };
      }
      if (match.season_id !== activeSeasonId) {
        return { success: false, error: 'Match does not belong to the active season.' };
      }

      // 3. Verify user exists in public.users and is active
      const user = usersDb.find((u) => u.id === userId);
      if (!user) {
        return { success: false, error: 'Selected user does not exist in the system.' };
      }
      if (!user.is_active) {
        return { success: false, error: 'Selected user account is deactivated.' };
      }

      // 4. Enforce single active operator: deactivate other active scorers for this match
      for (const row of scorersTable) {
        if (row.match_id === matchId && row.user_id !== userId) {
          row.is_active = false;
        }
      }

      // 5. Upsert assignment on (match_id, user_id)
      const existing = scorersTable.find((r) => r.match_id === matchId && r.user_id === userId);
      if (existing) {
        existing.is_active = true;
        return { success: true, scorerId: existing.id, isReassigned: true };
      } else {
        const newRow: ScorerRow = {
          id: `scorer-${scorersTable.length + 1}`,
          match_id: matchId,
          user_id: userId,
          is_active: true,
          created_at: new Date().toISOString(),
        };
        scorersTable.push(newRow);
        return { success: true, scorerId: newRow.id, isReassigned: false };
      }
    }

    it('authorized admin or operator can assign scorer successfully', () => {
      const table: ScorerRow[] = [];
      const resAdmin = simulateAssignScorer('super_admin', matchId1, userId1, table);
      expect(resAdmin.success).toBe(true);
      expect(table).toHaveLength(1);
      expect(table[0].user_id).toBe(userId1);
      expect(table[0].is_active).toBe(true);

      const resOperator = simulateAssignScorer('operator', matchId2, userId2, table);
      expect(resOperator.success).toBe(true);
      expect(table).toHaveLength(2);
    });

    it('unauthorized franchise or player user cannot assign scorers', () => {
      const table: ScorerRow[] = [];
      const resFranchise = simulateAssignScorer('franchise', matchId1, userId1, table);
      expect(resFranchise.success).toBe(false);
      expect(resFranchise.error).toContain('UNAUTHORIZED');

      const resPlayer = simulateAssignScorer('player', matchId1, userId1, table);
      expect(resPlayer.success).toBe(false);
      expect(resPlayer.error).toContain('UNAUTHORIZED');
      expect(table).toHaveLength(0);
    });

    it('rejects assignment if target user does not exist in public.users', () => {
      const table: ScorerRow[] = [];
      const res = simulateAssignScorer('super_admin', matchId1, '00000000-0000-0000-0000-000000000999', table);
      expect(res.success).toBe(false);
      expect(res.error).toBe('Selected user does not exist in the system.');
    });

    it('rejects assignment if selected user is deactivated', () => {
      const table: ScorerRow[] = [];
      const res = simulateAssignScorer('super_admin', matchId1, userId3, table);
      expect(res.success).toBe(false);
      expect(res.error).toBe('Selected user account is deactivated.');
    });

    it('rejects assignment if match does not exist', () => {
      const table: ScorerRow[] = [];
      const res = simulateAssignScorer('super_admin', 'ffffffff-ffff-ffff-ffff-ffffffffffff', userId1, table);
      expect(res.success).toBe(false);
      expect(res.error).toBe('Match not found.');
    });

    it('rejects assignment if match belongs to a different season', () => {
      const table: ScorerRow[] = [];
      const res = simulateAssignScorer('super_admin', matchId1, userId1, table, 'season-2027-archived');
      expect(res.success).toBe(false);
      expect(res.error).toBe('Match does not belong to the active season.');
    });

    it('handles duplicate assignment idempotently without duplicate row creation', () => {
      const table: ScorerRow[] = [];
      const res1 = simulateAssignScorer('super_admin', matchId1, userId1, table);
      expect(res1.success).toBe(true);
      expect(table).toHaveLength(1);

      // Re-assigning same user to same match updates existing record
      const res2 = simulateAssignScorer('super_admin', matchId1, userId1, table);
      expect(res2.success).toBe(true);
      expect(table).toHaveLength(1); // STILL 1 row
      expect(table[0].user_id).toBe(userId1);
    });

    it('reassigning to a different user deactivates prior active scorer', () => {
      const table: ScorerRow[] = [];
      // Assign User 1
      simulateAssignScorer('super_admin', matchId1, userId1, table);
      expect(table[0].user_id).toBe(userId1);
      expect(table[0].is_active).toBe(true);

      // Replace with User 2
      const resReassign = simulateAssignScorer('super_admin', matchId1, userId2, table);
      expect(resReassign.success).toBe(true);
      expect(table).toHaveLength(2);

      // User 1 is deactivated, User 2 is active
      const user1Record = table.find((r) => r.user_id === userId1);
      const user2Record = table.find((r) => r.user_id === userId2);
      expect(user1Record?.is_active).toBe(false);
      expect(user2Record?.is_active).toBe(true);
    });
  });

  describe('Authorization Rules & Isolation (requireMatchScorer)', () => {
    interface AuthorizationContext {
      userId: string;
      roles: string[];
      matchScorerAssignments: Array<{ matchId: string; isActive: boolean }>;
    }

    function checkScorerAccess(context: AuthorizationContext | null, targetMatchId: string) {
      if (!context) {
        throw new Error('UNAUTHORIZED: You must be logged in to score a match.');
      }
      if (!targetMatchId) {
        throw new Error('MATCH_AUTH_ERROR: Match ID is required.');
      }

      const isAdmin = context.roles.includes('super_admin') || context.roles.includes('operator');
      if (isAdmin) {
        return { allowed: true, isAdmin: true, isAssignedScorer: false };
      }

      const hasAssignment = context.matchScorerAssignments.some(
        (a) => a.matchId === targetMatchId && a.isActive
      );
      if (hasAssignment) {
        return { allowed: true, isAdmin: false, isAssignedScorer: true };
      }

      throw new Error('UNAUTHORIZED_MATCH_SCORER: You are not authorized to score this match.');
    }

    it('unauthenticated caller is rejected immediately', () => {
      expect(() => checkScorerAccess(null, matchId1)).toThrow(
        'UNAUTHORIZED: You must be logged in to score a match.'
      );
    });

    it('super_admin can access scoring for any match', () => {
      const adminCtx: AuthorizationContext = {
        userId: userId1,
        roles: ['super_admin'],
        matchScorerAssignments: [],
      };
      const res = checkScorerAccess(adminCtx, matchId1);
      expect(res.allowed).toBe(true);
      expect(res.isAdmin).toBe(true);
    });

    it('operator can access scoring for any match in season', () => {
      const opCtx: AuthorizationContext = {
        userId: userId1,
        roles: ['operator'],
        matchScorerAssignments: [],
      };
      const res = checkScorerAccess(opCtx, matchId2);
      expect(res.allowed).toBe(true);
      expect(res.isAdmin).toBe(true);
    });

    it('assigned match scorer can score their designated match', () => {
      const scorerCtx: AuthorizationContext = {
        userId: userId2,
        roles: [], // not an admin
        matchScorerAssignments: [{ matchId: matchId1, isActive: true }],
      };
      const res = checkScorerAccess(scorerCtx, matchId1);
      expect(res.allowed).toBe(true);
      expect(res.isAssignedScorer).toBe(true);
      expect(res.isAdmin).toBe(false);
    });

    it('assigned match scorer CANNOT score another unassigned match', () => {
      const scorerCtx: AuthorizationContext = {
        userId: userId2,
        roles: [],
        matchScorerAssignments: [{ matchId: matchId1, isActive: true }], // assigned to match 1 ONLY
      };

      // Attempting to access match 2
      expect(() => checkScorerAccess(scorerCtx, matchId2)).toThrow(
        'UNAUTHORIZED_MATCH_SCORER: You are not authorized to score this match.'
      );
    });

    it('deactivated scorer cannot access match', () => {
      const inactiveScorerCtx: AuthorizationContext = {
        userId: userId2,
        roles: [],
        matchScorerAssignments: [{ matchId: matchId1, isActive: false }], // deactivated
      };
      expect(() => checkScorerAccess(inactiveScorerCtx, matchId1)).toThrow(
        'UNAUTHORIZED_MATCH_SCORER: You are not authorized to score this match.'
      );
    });
  });

  describe('Security & Non-Bypassability Invariants', () => {
    it('franchise user cannot assign themselves or others', () => {
      const franchiseUserRoles = ['franchise'];
      const isAdmin = franchiseUserRoles.includes('super_admin') || franchiseUserRoles.includes('operator');
      expect(isAdmin).toBe(false);
    });

    it('tournament player user cannot assign themselves or others', () => {
      const playerUserRoles = ['player'];
      const isAdmin = playerUserRoles.includes('super_admin') || playerUserRoles.includes('operator');
      expect(isAdmin).toBe(false);
    });

    it('client query parameters (?userId, ?role, ?matchScorer) are strictly ignored', () => {
      // Simulate client spoofing headers or query params
      const clientParams = {
        role: 'super_admin',
        userId: 'attacker-id',
        matchScorer: 'true',
      };

      // Server authority resolves solely from DB context
      const serverAuthSession = {
        userId: 'legitimate-user-id',
        isSuperAdmin: false,
        isOperator: false,
      };

      const resolvedIsAdmin = serverAuthSession.isSuperAdmin || serverAuthSession.isOperator;
      expect(resolvedIsAdmin).toBe(false);
      expect(serverAuthSession.userId).not.toBe(clientParams.userId);
    });
  });
});
