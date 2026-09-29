import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMatchSchema,
  updateMatchSchema,
  assignScorerSchema,
  setPlayingXISchema,
  startInningsSchema,
  recordDeliverySchema,
  undoDeliverySchema,
} from '@/lib/matches/validation';

describe('Match Subsystem — Actions, Schemas & Integrity', () => {
  const validUuid1 = '11111111-1111-4111-8111-111111111111';
  const validUuid2 = '22222222-2222-4222-8222-222222222222';
  const validUuid3 = '33333333-3333-4333-8333-333333333333';
  const validUuid4 = '44444444-4444-4444-8444-444444444444';
  const validUuid5 = '55555555-5555-4555-8555-555555555555';

  describe('createMatchSchema — Validation & Team Disjointness', () => {
    it('accepts valid match creation input', () => {
      const input = {
        seasonId: validUuid1,
        teamAId: validUuid2,
        teamBId: validUuid3,
        scheduledAt: new Date().toISOString(),
        venue: 'Avanthi Cricket Stadium',
        maxOvers: 20,
        youtubeUrlOrId: 'dQw4w9WgXcQ',
      };
      const result = createMatchSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('rejects match creation if Team A and Team B are identical', () => {
      const input = {
        seasonId: validUuid1,
        teamAId: validUuid2,
        teamBId: validUuid2, // Same franchise
        venue: 'Main Ground',
        maxOvers: 20,
      };
      const result = createMatchSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'Team A and Team B must be different franchises.'
        );
      }
    });

    it('rejects invalid or non-UUID franchise IDs', () => {
      const input = {
        seasonId: validUuid1,
        teamAId: 'team-a',
        teamBId: validUuid3,
      };
      const result = createMatchSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects empty strings for seasonId, teamAId, and teamBId with Invalid UUID issues', () => {
      const emptyInput = {
        seasonId: '',
        teamAId: '',
        teamBId: '',
      };
      const result = createMatchSchema.safeParse(emptyInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        const uuidIssues = result.error.issues.filter((i) => i.message === 'Invalid UUID');
        const paths = uuidIssues.map((i) => i.path[0]);
        expect(paths).toContain('seasonId');
        expect(paths).toContain('teamAId');
        expect(paths).toContain('teamBId');
      }
    });

    it('rejects distinct non-UUID strings with Invalid UUID for each field', () => {
      const nonUuidInput = {
        seasonId: 'not-a-uuid',
        teamAId: 'team-a-slug',
        teamBId: 'team-b-slug',
      };
      const result = createMatchSchema.safeParse(nonUuidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toHaveLength(3);
        result.error.issues.forEach((issue) => {
          expect(issue.message).toBe('Invalid UUID');
        });
      }
    });

    it('rejects null or missing required UUID fields', () => {
      expect(createMatchSchema.safeParse({}).success).toBe(false);
    });

    it('enforces overs boundaries (1 to 50)', () => {
      const zeroOvers = createMatchSchema.safeParse({
        seasonId: validUuid1,
        teamAId: validUuid2,
        teamBId: validUuid3,
        maxOvers: 0,
      });
      expect(zeroOvers.success).toBe(false);

      const fiftyOneOvers = createMatchSchema.safeParse({
        seasonId: validUuid1,
        teamAId: validUuid2,
        teamBId: validUuid3,
        maxOvers: 51,
      });
      expect(fiftyOneOvers.success).toBe(false);
    });
  });

  describe('createMatchAction — Integrity & Season Association Simulation', () => {
    interface FranchiseRow {
      id: string;
      season_id: string;
      name: string;
    }

    const franchisesDb: FranchiseRow[] = [
      { id: validUuid2, season_id: validUuid1, name: 'Chennai Super Kings' },
      { id: validUuid3, season_id: validUuid1, name: 'Mumbai Indians' },
      { id: validUuid4, season_id: validUuid5, name: 'Other Season Team' },
    ];

    function simulateCreateMatch(
      rawInput: any,
      activeSeasonId: string | null
    ) {
      const rawObj = rawInput && typeof rawInput === 'object' ? rawInput : {};
      const effectiveSeasonId = rawObj.seasonId || activeSeasonId || '';
      const inputWithSeason = {
        ...rawObj,
        seasonId: effectiveSeasonId,
      };

      const parseResult = createMatchSchema.safeParse(inputWithSeason);
      if (!parseResult.success) {
        const issueSummary = parseResult.error.issues
          .map((i) => `${i.path.join('.') || 'input'}: ${i.message}`)
          .join('; ');
        return { success: false, error: issueSummary };
      }

      const parsed = parseResult.data;

      // Verify teams
      const foundTeams = franchisesDb.filter((f) =>
        [parsed.teamAId, parsed.teamBId].includes(f.id)
      );

      if (foundTeams.length < 2) {
        return { success: false, error: 'One or both selected franchises do not exist.' };
      }

      const crossSeason = foundTeams.find((f) => f.season_id !== parsed.seasonId);
      if (crossSeason) {
        return {
          success: false,
          error: 'One or more selected franchises do not belong to the specified season.',
        };
      }

      return {
        success: true,
        data: { matchId: 'new-match-uuid' },
      };
    }

    it('resolves activeSeasonId when seasonId is omitted or empty', () => {
      const input = {
        seasonId: '',
        teamAId: validUuid2,
        teamBId: validUuid3,
      };
      const res = simulateCreateMatch(input, validUuid1);
      expect(res.success).toBe(true);
      expect(res.data?.matchId).toBe('new-match-uuid');
    });

    it('rejects match creation if activeSeasonId is not available and seasonId is empty', () => {
      const input = {
        seasonId: '',
        teamAId: validUuid2,
        teamBId: validUuid3,
      };
      const res = simulateCreateMatch(input, null);
      expect(res.success).toBe(false);
      expect(res.error).toContain('seasonId: Invalid UUID');
    });

    it('rejects non-existent franchise IDs', () => {
      const nonExistentId = '99999999-9999-4999-8999-999999999999';
      const input = {
        seasonId: validUuid1,
        teamAId: validUuid2,
        teamBId: nonExistentId,
      };
      const res = simulateCreateMatch(input, validUuid1);
      expect(res.success).toBe(false);
      expect(res.error).toBe('One or both selected franchises do not exist.');
    });

    it('rejects cross-season franchise mismatch', () => {
      const input = {
        seasonId: validUuid1,
        teamAId: validUuid2, // season validUuid1
        teamBId: validUuid4, // season validUuid5
      };
      const res = simulateCreateMatch(input, validUuid1);
      expect(res.success).toBe(false);
      expect(res.error).toBe('One or more selected franchises do not belong to the specified season.');
    });

    it('formats multiple Zod invalid UUID errors cleanly instead of JSON array dump', () => {
      const input = {
        seasonId: 'not-a-uuid',
        teamAId: 'invalid-team-a',
        teamBId: 'invalid-team-b',
      };
      const res = simulateCreateMatch(input, null);
      expect(res.success).toBe(false);
      expect(res.error).toContain('seasonId: Invalid UUID');
      expect(res.error).toContain('teamAId: Invalid UUID');
      expect(res.error).toContain('teamBId: Invalid UUID');
      expect(res.error?.startsWith('[')).toBe(false);
    });
  });

  describe('setPlayingXISchema — Exact Squad Size & Leadership Role Rules', () => {
    const make11Players = () =>
      Array.from({ length: 11 }, (_, i) => {
        const hex = (i + 1).toString(16).padStart(12, '0');
        return `00000000-0000-4000-8000-${hex}`;
      });

    it('accepts exactly 11 players with captain and keeper inside Playing XI', () => {
      const p11 = make11Players();
      const input = {
        matchId: validUuid1,
        franchiseId: validUuid2,
        playerRegistrationIds: p11,
        captainRegistrationId: p11[0],
        wicketKeeperRegistrationId: p11[1],
      };
      const result = setPlayingXISchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('rejects squad if fewer or more than 11 players provided', () => {
      const p11 = make11Players();
      const p10 = p11.slice(0, 10);
      const res10 = setPlayingXISchema.safeParse({
        matchId: validUuid1,
        franchiseId: validUuid2,
        playerRegistrationIds: p10,
        captainRegistrationId: p10[0],
        wicketKeeperRegistrationId: p10[1],
      });
      expect(res10.success).toBe(false);
      if (!res10.success) {
        expect(res10.error.issues[0].message).toBe(
          'Playing XI must consist of exactly 11 players.'
        );
      }
    });

    it('rejects if captain is not in the Playing XI', () => {
      const p11 = make11Players();
      const outsidePlayer = validUuid5;
      const res = setPlayingXISchema.safeParse({
        matchId: validUuid1,
        franchiseId: validUuid2,
        playerRegistrationIds: p11,
        captainRegistrationId: outsidePlayer,
        wicketKeeperRegistrationId: p11[1],
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toBe(
          'Captain must be selected from the Playing XI.'
        );
      }
    });

    it('rejects if wicket keeper is not in the Playing XI', () => {
      const p11 = make11Players();
      const outsidePlayer = validUuid5;
      const res = setPlayingXISchema.safeParse({
        matchId: validUuid1,
        franchiseId: validUuid2,
        playerRegistrationIds: p11,
        captainRegistrationId: p11[0],
        wicketKeeperRegistrationId: outsidePlayer,
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toBe(
          'Wicket Keeper must be selected from the Playing XI.'
        );
      }
    });
  });

  describe('startInningsSchema — Opening Batter & Bowler Independence', () => {
    it('accepts 3 distinct players for striker, non-striker, and bowler', () => {
      const input = {
        matchId: validUuid1,
        inningsNumber: 1,
        strikerId: validUuid2,
        nonStrikerId: validUuid3,
        bowlerId: validUuid4,
      };
      const result = startInningsSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('rejects if striker and non-striker are the same player', () => {
      const input = {
        matchId: validUuid1,
        inningsNumber: 1,
        strikerId: validUuid2,
        nonStrikerId: validUuid2, // Same player
        bowlerId: validUuid3,
      };
      const result = startInningsSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'Striker and Non-Striker must be different players.'
        );
      }
    });

    it('rejects if bowler is also designated as striker or non-striker', () => {
      const bowlerAsStriker = {
        matchId: validUuid1,
        inningsNumber: 1,
        strikerId: validUuid2,
        nonStrikerId: validUuid3,
        bowlerId: validUuid2,
      };
      const res1 = startInningsSchema.safeParse(bowlerAsStriker);
      expect(res1.success).toBe(false);
      if (!res1.success) {
        expect(res1.error.issues[0].message).toBe(
          'Bowler cannot be on strike or non-strike.'
        );
      }

      const bowlerAsNonStriker = {
        matchId: validUuid1,
        inningsNumber: 1,
        strikerId: validUuid2,
        nonStrikerId: validUuid3,
        bowlerId: validUuid3,
      };
      const res2 = startInningsSchema.safeParse(bowlerAsNonStriker);
      expect(res2.success).toBe(false);
      if (!res2.success) {
        expect(res2.error.issues[0].message).toBe(
          'Bowler cannot be on strike or non-strike.'
        );
      }
    });
  });

  describe('recordDeliverySchema — Idempotency Key & Boundaries', () => {
    it('strictly requires a UUID submissionId for database idempotency', () => {
      const valid = {
        matchId: validUuid1,
        inningsId: validUuid2,
        submissionId: validUuid3,
        expectedSequence: 1,
        overNumber: 0,
        ballNumber: 1,
        strikerId: validUuid4,
        nonStrikerId: validUuid5,
        bowlerId: '66666666-6666-4666-8666-666666666666',
        runsBatter: 1,
        extrasRuns: 0,
        extrasType: 'none',
        isWicket: false,
      };
      const resValid = recordDeliverySchema.safeParse(valid);
      expect(resValid.success).toBe(true);

      const invalidSubmission = {
        ...valid,
        submissionId: 'not-a-uuid',
      };
      const resInvalid = recordDeliverySchema.safeParse(invalidSubmission);
      expect(resInvalid.success).toBe(false);
      if (!resInvalid.success) {
        expect(resInvalid.error.issues[0].message).toBe(
          'Valid submission UUID required for idempotency.'
        );
      }
    });

    it('rejects impossible batter runs (< 0 or > 6)', () => {
      const base = {
        matchId: validUuid1,
        inningsId: validUuid2,
        submissionId: validUuid3,
        expectedSequence: 1,
        overNumber: 0,
        ballNumber: 1,
        strikerId: validUuid4,
        nonStrikerId: validUuid5,
        bowlerId: '66666666-6666-4666-8666-666666666666',
      };

      expect(recordDeliverySchema.safeParse({ ...base, runsBatter: -1 }).success).toBe(false);
      expect(recordDeliverySchema.safeParse({ ...base, runsBatter: 7 }).success).toBe(false);
      expect(recordDeliverySchema.safeParse({ ...base, runsBatter: 6 }).success).toBe(true);
    });
  });

  describe('undoDeliverySchema — Parameters', () => {
    it('validates undo inputs and defaults reason if omitted', () => {
      const input = {
        matchId: validUuid1,
        inningsId: validUuid2,
      };
      const parsed = undoDeliverySchema.parse(input);
      expect(parsed.matchId).toBe(validUuid1);
      expect(parsed.inningsId).toBe(validUuid2);
      expect(parsed.reason).toBe('Scorer corrected last ball');
    });
  });

  describe('Idempotency & Sequence Simulation', () => {
    it('duplicate submission_id returns existing delivery without re-insertion', () => {
      const deliveriesDb: Array<{ id: string; submission_id: string; delivery_sequence: number }> = [];

      function simulateRecordDelivery(submissionId: string, expectedSeq: number) {
        // Idempotency check
        const existing = deliveriesDb.find((d) => d.submission_id === submissionId);
        if (existing) {
          return {
            success: true,
            data: { deliveryId: existing.id, nextSequence: existing.delivery_sequence + 1 },
          };
        }

        // Sequence check
        const nextExpected = deliveriesDb.length + 1;
        if (expectedSeq !== nextExpected) {
          return {
            success: false,
            code: 'STALE_MATCH_STATE',
          };
        }

        const newDelivery = {
          id: `del-${deliveriesDb.length + 1}`,
          submission_id: submissionId,
          delivery_sequence: nextExpected,
        };
        deliveriesDb.push(newDelivery);

        return {
          success: true,
          data: { deliveryId: newDelivery.id, nextSequence: nextExpected + 1 },
        };
      }

      // First submission
      const sub1 = 'sub-token-001';
      const res1 = simulateRecordDelivery(sub1, 1);
      expect(res1.success).toBe(true);
      expect(deliveriesDb.length).toBe(1);

      // Duplicate submission with same submission_id (e.g. network retry)
      const res2 = simulateRecordDelivery(sub1, 1);
      expect(res2.success).toBe(true);
      expect(res2.data?.deliveryId).toBe(res1.data?.deliveryId);
      expect(deliveriesDb.length).toBe(1); // No new insertion!

      // Stale sequence rejection
      const resStale = simulateRecordDelivery('sub-token-002', 1);
      expect(resStale.success).toBe(false);
      expect(resStale.code).toBe('STALE_MATCH_STATE');
    });

    it('simulates undo keeping audit trail via is_reversed flag', () => {
      const deliveries = [
        { id: 'd1', sequence: 1, runs: 4, legal: true, is_reversed: false },
        { id: 'd2', sequence: 2, runs: 6, legal: true, is_reversed: false },
      ];

      function simulateUndo() {
        const latest = deliveries.filter((d) => !d.is_reversed).pop();
        if (!latest) return { success: false };

        latest.is_reversed = true;

        const activeDeliveries = deliveries.filter((d) => !d.is_reversed);
        const totalRuns = activeDeliveries.reduce((sum, d) => sum + d.runs, 0);
        const legalBalls = activeDeliveries.filter((d) => d.legal).length;

        return {
          success: true,
          reversedId: latest.id,
          totalRuns,
          legalBalls,
        };
      }

      const undoRes = simulateUndo();
      expect(undoRes.success).toBe(true);
      expect(undoRes.reversedId).toBe('d2');
      expect(undoRes.totalRuns).toBe(4);
      expect(undoRes.legalBalls).toBe(1);

      // Audit trail preserved: total rows still 2!
      expect(deliveries.length).toBe(2);
      expect(deliveries[1].is_reversed).toBe(true);
    });
  });
});
