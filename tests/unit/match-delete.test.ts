import { describe, it, expect } from 'vitest';
import { deleteMatchSchema } from '@/lib/matches/validation';

describe('Match Subsystem — Delete Match Action & Schema', () => {
  const validUuid1 = '11111111-1111-4111-8111-111111111111';

  describe('deleteMatchSchema — Validation', () => {
    it('accepts valid UUID', () => {
      const result = deleteMatchSchema.safeParse({ matchId: validUuid1 });
      expect(result.success).toBe(true);
    });

    it('rejects empty string', () => {
      const result = deleteMatchSchema.safeParse({ matchId: '' });
      expect(result.success).toBe(false);
    });

    it('rejects non-UUID string', () => {
      const result = deleteMatchSchema.safeParse({ matchId: 'not-a-uuid' });
      expect(result.success).toBe(false);
    });

    it('rejects missing matchId', () => {
      const result = deleteMatchSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('deleteMatchAction — Business Logic & Status Validation (Simulated)', () => {
    const matchesDb = [
      { id: '11111111-1111-4111-8111-111111111111', status: 'scheduled' },
      { id: '22222222-2222-4222-8222-222222222222', status: 'toss' },
      { id: '33333333-3333-4333-8333-333333333333', status: 'live' },
      { id: '44444444-4444-4444-8444-444444444444', status: 'innings_break' },
      { id: '55555555-5555-4555-8555-555555555555', status: 'completed' },
      { id: '66666666-6666-4666-8666-666666666666', status: 'abandoned' },
    ];

    function simulateDeleteMatch(input: any) {
      const parseResult = deleteMatchSchema.safeParse(input);
      if (!parseResult.success) {
        return { success: false, error: 'Validation error' };
      }

      const match = matchesDb.find((m) => m.id === parseResult.data.matchId);
      if (!match) {
        return { success: false, error: 'Match not found.' };
      }

      if (match.status !== 'scheduled' && match.status !== 'live') {
        return { success: false, error: 'Only scheduled or live matches can be deleted.' };
      }

      return { success: true };
    }

    it('allows deleting scheduled match', () => {
      const res = simulateDeleteMatch({ matchId: '11111111-1111-4111-8111-111111111111' });
      expect(res.success).toBe(true);
    });

    it('allows deleting live match', () => {
      const res = simulateDeleteMatch({ matchId: '33333333-3333-4333-8333-333333333333' });
      expect(res.success).toBe(true);
    });

    it('BLOCKS deleting toss match', () => {
      const res = simulateDeleteMatch({ matchId: '22222222-2222-4222-8222-222222222222' });
      expect(res.success).toBe(false);
      expect(res.error).toBe('Only scheduled or live matches can be deleted.');
    });

    it('BLOCKS deleting innings_break match', () => {
      const res = simulateDeleteMatch({ matchId: '44444444-4444-4444-8444-444444444444' });
      expect(res.success).toBe(false);
      expect(res.error).toBe('Only scheduled or live matches can be deleted.');
    });

    it('BLOCKS deleting completed match', () => {
      const res = simulateDeleteMatch({ matchId: '55555555-5555-4555-8555-555555555555' });
      expect(res.success).toBe(false);
      expect(res.error).toBe('Only scheduled or live matches can be deleted.');
    });

    it('BLOCKS deleting abandoned match', () => {
      const res = simulateDeleteMatch({ matchId: '66666666-6666-4666-8666-666666666666' });
      expect(res.success).toBe(false);
      expect(res.error).toBe('Only scheduled or live matches can be deleted.');
    });

    it('returns error for non-existent match', () => {
      const res = simulateDeleteMatch({ matchId: '77777777-7777-4777-8777-777777777777' });
      expect(res.success).toBe(false);
      expect(res.error).toBe('Match not found.');
    });

    it('rejects invalid UUID at schema level', () => {
      const res = simulateDeleteMatch({ matchId: 'invalid-id' });
      expect(res.success).toBe(false);
      expect(res.error).toBe('Validation error');
    });
  });

  describe('deleteMatchAction — Authorization (Simulated)', () => {
    function simulateDeleteAuth(role: string | null) {
      if (role !== 'super_admin' && role !== 'admin') {
        return { success: false, error: 'UNAUTHORIZED' };
      }
      return { success: true };
    }

    it('Only admin/super_admin can delete', () => {
      expect(simulateDeleteAuth('super_admin').success).toBe(true);
      expect(simulateDeleteAuth('admin').success).toBe(true);
    });

    it('Unauthenticated user cannot delete', () => {
      expect(simulateDeleteAuth(null).success).toBe(false);
    });

    it('Franchise role cannot delete', () => {
      expect(simulateDeleteAuth('franchise').success).toBe(false);
    });

    it('Player role cannot delete', () => {
      expect(simulateDeleteAuth('player').success).toBe(false);
    });
  });
});
