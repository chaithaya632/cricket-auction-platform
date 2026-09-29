import { describe, it, expect } from 'vitest';
import {
  calculateDeliveryOutcome,
  formatOvers,
  calculateRunRate,
  calculateRequiredRunRate,
  deriveScorecard,
  determineMatchResult,
} from '@/domain/matches/scoring';
import { normalizeYouTubeVideoId } from '@/lib/matches/validation';
import type { DbMatchDelivery, DbMatchInnings } from '@/lib/matches/types';

describe('Match Domain — Cricket Scoring Engine', () => {
  const striker = 'p1-striker';
  const nonStriker = 'p2-non-striker';
  const incoming = 'p3-incoming';

  describe('calculateDeliveryOutcome — Deliveries & Strike Rotation', () => {
    it('dot ball: legal delivery, 0 runs, strike unchanged', () => {
      const outcome = calculateDeliveryOutcome({
        runsBatter: 0,
        extrasType: 'none',
        extrasRuns: 0,
        isWicket: false,
        currentStrikerId: striker,
        currentNonStrikerId: nonStriker,
        currentLegalBalls: 0,
      });

      expect(outcome.totalRuns).toBe(0);
      expect(outcome.isLegalDelivery).toBe(true);
      expect(outcome.nextLegalBalls).toBe(1);
      expect(outcome.nextStrikerId).toBe(striker);
      expect(outcome.nextNonStrikerId).toBe(nonStriker);
      expect(outcome.isOverCompleted).toBe(false);
    });

    it('single run: legal delivery, 1 run, strike rotates', () => {
      const outcome = calculateDeliveryOutcome({
        runsBatter: 1,
        extrasType: 'none',
        extrasRuns: 0,
        isWicket: false,
        currentStrikerId: striker,
        currentNonStrikerId: nonStriker,
        currentLegalBalls: 0,
      });

      expect(outcome.totalRuns).toBe(1);
      expect(outcome.isLegalDelivery).toBe(true);
      expect(outcome.nextStrikerId).toBe(nonStriker);
      expect(outcome.nextNonStrikerId).toBe(striker);
    });

    it('two runs: legal delivery, 2 runs, strike retained', () => {
      const outcome = calculateDeliveryOutcome({
        runsBatter: 2,
        extrasType: 'none',
        extrasRuns: 0,
        isWicket: false,
        currentStrikerId: striker,
        currentNonStrikerId: nonStriker,
        currentLegalBalls: 0,
      });

      expect(outcome.totalRuns).toBe(2);
      expect(outcome.isLegalDelivery).toBe(true);
      expect(outcome.nextStrikerId).toBe(striker);
      expect(outcome.nextNonStrikerId).toBe(nonStriker);
    });

    it('three runs: legal delivery, 3 runs, strike rotates', () => {
      const outcome = calculateDeliveryOutcome({
        runsBatter: 3,
        extrasType: 'none',
        extrasRuns: 0,
        isWicket: false,
        currentStrikerId: striker,
        currentNonStrikerId: nonStriker,
        currentLegalBalls: 0,
      });

      expect(outcome.totalRuns).toBe(3);
      expect(outcome.isLegalDelivery).toBe(true);
      expect(outcome.nextStrikerId).toBe(nonStriker);
      expect(outcome.nextNonStrikerId).toBe(striker);
    });

    it('four or six: boundaries, strike retained', () => {
      const four = calculateDeliveryOutcome({
        runsBatter: 4,
        extrasType: 'none',
        extrasRuns: 0,
        isWicket: false,
        currentStrikerId: striker,
        currentNonStrikerId: nonStriker,
        currentLegalBalls: 2,
      });
      expect(four.totalRuns).toBe(4);
      expect(four.nextStrikerId).toBe(striker);

      const six = calculateDeliveryOutcome({
        runsBatter: 6,
        extrasType: 'none',
        extrasRuns: 0,
        isWicket: false,
        currentStrikerId: striker,
        currentNonStrikerId: nonStriker,
        currentLegalBalls: 3,
      });
      expect(six.totalRuns).toBe(6);
      expect(six.nextStrikerId).toBe(striker);
    });

    it('wide ball: 1 extra run, NOT a legal delivery, balls do not increment', () => {
      const outcome = calculateDeliveryOutcome({
        runsBatter: 0,
        extrasType: 'wide',
        extrasRuns: 1,
        isWicket: false,
        currentStrikerId: striker,
        currentNonStrikerId: nonStriker,
        currentLegalBalls: 4,
      });

      expect(outcome.totalRuns).toBe(1);
      expect(outcome.isLegalDelivery).toBe(false);
      expect(outcome.nextLegalBalls).toBe(4);
      expect(outcome.nextStrikerId).toBe(striker);
      expect(outcome.isOverCompleted).toBe(false);
    });

    it('wide ball with run: 2 extra runs, strike rotates because 1 run was run', () => {
      const outcome = calculateDeliveryOutcome({
        runsBatter: 0,
        extrasType: 'wide',
        extrasRuns: 2,
        isWicket: false,
        currentStrikerId: striker,
        currentNonStrikerId: nonStriker,
        currentLegalBalls: 4,
      });

      expect(outcome.totalRuns).toBe(2);
      expect(outcome.isLegalDelivery).toBe(false);
      expect(outcome.nextStrikerId).toBe(nonStriker);
    });

    it('no ball: 1 penalty run + batter runs, NOT legal delivery', () => {
      const outcome = calculateDeliveryOutcome({
        runsBatter: 2,
        extrasType: 'no_ball',
        extrasRuns: 1,
        isWicket: false,
        currentStrikerId: striker,
        currentNonStrikerId: nonStriker,
        currentLegalBalls: 1,
      });

      expect(outcome.totalRuns).toBe(3);
      expect(outcome.isLegalDelivery).toBe(false);
      expect(outcome.nextLegalBalls).toBe(1);
      expect(outcome.nextStrikerId).toBe(striker);
    });

    it('bye: legal delivery, runs count as extras, strike rotates on odd runs', () => {
      const outcome = calculateDeliveryOutcome({
        runsBatter: 0,
        extrasType: 'bye',
        extrasRuns: 1,
        isWicket: false,
        currentStrikerId: striker,
        currentNonStrikerId: nonStriker,
        currentLegalBalls: 2,
      });

      expect(outcome.totalRuns).toBe(1);
      expect(outcome.isLegalDelivery).toBe(true);
      expect(outcome.nextLegalBalls).toBe(3);
      expect(outcome.nextStrikerId).toBe(nonStriker);
    });

    it('over completion: 6th legal ball swaps ends at conclusion of over', () => {
      // Dot ball on 6th delivery
      const dotSixth = calculateDeliveryOutcome({
        runsBatter: 0,
        extrasType: 'none',
        extrasRuns: 0,
        isWicket: false,
        currentStrikerId: striker,
        currentNonStrikerId: nonStriker,
        currentLegalBalls: 5,
      });

      expect(dotSixth.isOverCompleted).toBe(true);
      expect(dotSixth.nextLegalBalls).toBe(6);
      // Because over ended, ends swap -> nonStriker faces next over
      expect(dotSixth.nextStrikerId).toBe(nonStriker);
      expect(dotSixth.nextNonStrikerId).toBe(striker);

      // Single on 6th delivery: run rotation + end-of-over rotation = striker faces next over
      const singleSixth = calculateDeliveryOutcome({
        runsBatter: 1,
        extrasType: 'none',
        extrasRuns: 0,
        isWicket: false,
        currentStrikerId: striker,
        currentNonStrikerId: nonStriker,
        currentLegalBalls: 5,
      });

      expect(singleSixth.isOverCompleted).toBe(true);
      expect(singleSixth.nextStrikerId).toBe(striker);
      expect(singleSixth.nextNonStrikerId).toBe(nonStriker);
    });

    it('regular dismissal (bowled): striker out, replaced by incoming batter', () => {
      const outcome = calculateDeliveryOutcome({
        runsBatter: 0,
        extrasType: 'none',
        extrasRuns: 0,
        isWicket: true,
        wicketType: 'bowled',
        dismissedPlayerId: striker,
        currentStrikerId: striker,
        currentNonStrikerId: nonStriker,
        incomingBatterId: incoming,
        currentLegalBalls: 2,
      });

      expect(outcome.isWicket).toBe(true);
      expect(outcome.dismissedPlayerId).toBe(striker);
      expect(outcome.nextStrikerId).toBe(incoming);
      expect(outcome.nextNonStrikerId).toBe(nonStriker);
    });

    it('run out: striker dismissed during run out with 1 run completed', () => {
      const outcome = calculateDeliveryOutcome({
        runsBatter: 1,
        extrasType: 'none',
        extrasRuns: 0,
        isWicket: true,
        wicketType: 'run_out',
        dismissedPlayerId: striker,
        currentStrikerId: striker,
        currentNonStrikerId: nonStriker,
        incomingBatterId: incoming,
        currentLegalBalls: 1,
      });

      expect(outcome.isWicket).toBe(true);
      expect(outcome.dismissedPlayerId).toBe(striker);
      // When striker was run out attempting 2nd run after completing 1 run,
      // surviving non-striker is at striker's end, incoming batter is at non-striker's end
      expect(outcome.nextStrikerId).toBe(nonStriker);
      expect(outcome.nextNonStrikerId).toBe(incoming);
    });
  });

  describe('formatOvers and Run Rate calculations', () => {
    it('formats legal balls into overs accurately', () => {
      expect(formatOvers(0)).toBe('0.0');
      expect(formatOvers(5)).toBe('0.5');
      expect(formatOvers(6)).toBe('1.0');
      expect(formatOvers(11)).toBe('1.5');
      expect(formatOvers(14)).toBe('2.2');
      expect(formatOvers(120)).toBe('20.0');
    });

    it('calculates current run rate accurately', () => {
      expect(calculateRunRate(0, 0)).toBe(0);
      expect(calculateRunRate(60, 60)).toBe(6.0);
      expect(calculateRunRate(85, 48)).toBe(10.63);
    });

    it('calculates required run rate for target chase', () => {
      // Target 160, current 100 in 15 overs (90 balls) of 20 overs (120 balls)
      // Needs 60 runs in 30 balls = 12.00 RRR
      expect(calculateRequiredRunRate(160, 100, 90, 20)).toBe(12.0);

      // Target already reached
      expect(calculateRequiredRunRate(160, 162, 95, 20)).toBe(0);

      // No target (1st innings)
      expect(calculateRequiredRunRate(null, 50, 30, 20)).toBeNull();

      // Balls exhausted
      expect(calculateRequiredRunRate(160, 150, 120, 20)).toBeNull();
    });
  });

  describe('deriveScorecard — Deterministic Aggregation & Undo Safety', () => {
    const mockInnings: DbMatchInnings = {
      id: 'inn-1',
      match_id: 'match-1',
      innings_number: 1,
      batting_team_id: 'team-a',
      bowling_team_id: 'team-b',
      total_runs: 25,
      total_wickets: 1,
      total_legal_balls: 12,
      target_runs: null,
      is_completed: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const playerMap = new Map([
      ['b1', { name: 'Batter One', photoUrl: null }],
      ['b2', { name: 'Batter Two', photoUrl: null }],
      ['b3', { name: 'Batter Three', photoUrl: null }],
      ['bowl1', { name: 'Bowler One', photoUrl: null }],
      ['bowl2', { name: 'Bowler Two', photoUrl: null }],
    ]);

    const deliveries: DbMatchDelivery[] = [
      {
        id: 'd1',
        innings_id: 'inn-1',
        delivery_sequence: 1,
        over_number: 0,
        ball_number: 1,
        striker_id: 'b1',
        non_striker_id: 'b2',
        bowler_id: 'bowl1',
        runs_batter: 4,
        extras_runs: 0,
        extras_type: 'none',
        total_runs: 4,
        is_legal_delivery: true,
        is_wicket: false,
        wicket_type: null,
        dismissed_player_id: null,
        submission_id: 'sub-1',
        is_reversed: false,
        reversal_reason: null,
        reversed_at: null,
        commentary: 'Boundary to backward point',
        created_at: new Date().toISOString(),
      },
      {
        id: 'd2',
        innings_id: 'inn-1',
        delivery_sequence: 2,
        over_number: 0,
        ball_number: 2,
        striker_id: 'b1',
        non_striker_id: 'b2',
        bowler_id: 'bowl1',
        runs_batter: 0,
        extras_runs: 1,
        extras_type: 'wide',
        total_runs: 1,
        is_legal_delivery: false,
        is_wicket: false,
        wicket_type: null,
        dismissed_player_id: null,
        submission_id: 'sub-2',
        is_reversed: false,
        reversal_reason: null,
        reversed_at: null,
        commentary: 'Wide down leg',
        created_at: new Date().toISOString(),
      },
      {
        id: 'd3',
        innings_id: 'inn-1',
        delivery_sequence: 3,
        over_number: 0,
        ball_number: 2,
        striker_id: 'b1',
        non_striker_id: 'b2',
        bowler_id: 'bowl1',
        runs_batter: 0,
        extras_runs: 0,
        extras_type: 'none',
        total_runs: 0,
        is_legal_delivery: true,
        is_wicket: true,
        wicket_type: 'bowled',
        dismissed_player_id: 'b1',
        submission_id: 'sub-3',
        is_reversed: false,
        reversal_reason: null,
        reversed_at: null,
        commentary: 'Clean bowled!',
        created_at: new Date().toISOString(),
      },
      {
        // Reversed delivery that should be IGNORED in scorecard derivation
        id: 'd4-cancelled',
        innings_id: 'inn-1',
        delivery_sequence: 4,
        over_number: 0,
        ball_number: 3,
        striker_id: 'b3',
        non_striker_id: 'b2',
        bowler_id: 'bowl1',
        runs_batter: 6,
        extras_runs: 0,
        extras_type: 'none',
        total_runs: 6,
        is_legal_delivery: true,
        is_wicket: false,
        wicket_type: null,
        dismissed_player_id: null,
        submission_id: 'sub-4-bad',
        is_reversed: true, // REVERSED!
        reversal_reason: 'Scorer input error',
        reversed_at: new Date().toISOString(),
        commentary: 'Scorer misclick',
        created_at: new Date().toISOString(),
      },
    ];

    it('ignores reversed deliveries when computing totals and player stats', () => {
      const scorecard = deriveScorecard(
        mockInnings,
        deliveries,
        playerMap,
        20,
        'b3',
        'b2',
        'bowl1'
      );

      // Batter 1: 4 runs from 2 balls (1 four, bowled out)
      const b1 = scorecard.batters.find((b) => b.registrationId === 'b1');
      expect(b1).toBeDefined();
      expect(b1?.runs).toBe(4);
      expect(b1?.balls).toBe(2);
      expect(b1?.fours).toBe(1);
      expect(b1?.isOut).toBe(true);
      expect(b1?.dismissalText).toBe('b Bowler One');

      // Batter 3: should NOT have 6 runs because d4 is reversed
      const b3 = scorecard.batters.find((b) => b.registrationId === 'b3');
      expect(b3).toBeUndefined(); // no active legal deliveries

      // Extras: 1 wide
      expect(scorecard.extras.wides).toBe(1);
      expect(scorecard.extras.total).toBe(1);

      // Bowler stats
      const bowl1 = scorecard.bowlers.find((b) => b.registrationId === 'bowl1');
      expect(bowl1).toBeDefined();
      expect(bowl1?.legalBalls).toBe(2);
      expect(bowl1?.wickets).toBe(1);
      expect(bowl1?.runsConceded).toBe(5); // 4 bat + 1 wide
      expect(bowl1?.overs).toBe('0.2');

      // Fall of wickets
      expect(scorecard.fallOfWickets.length).toBe(1);
      expect(scorecard.fallOfWickets[0].wicketNumber).toBe(1);
      expect(scorecard.fallOfWickets[0].runs).toBe(5);
    });
  });

  describe('determineMatchResult — Match Conclusion Logic', () => {
    it('declares chasing team winner by wickets when target is met', () => {
      const inn1 = { batting_team_id: 'team-a', total_runs: 150 } as DbMatchInnings;
      const inn2 = {
        batting_team_id: 'team-b',
        total_runs: 151,
        target_runs: 151,
        total_wickets: 4,
        is_completed: true,
      } as DbMatchInnings;

      const result = determineMatchResult('Titans', 'Strikers', inn1, inn2);
      expect(result.winnerTeamId).toBe('team-b');
      expect(result.summary).toBe('Strikers won by 6 wickets');
    });

    it('declares team batting first winner by runs when innings 2 completed below target', () => {
      const inn1 = { batting_team_id: 'team-a', total_runs: 160 } as DbMatchInnings;
      const inn2 = {
        batting_team_id: 'team-b',
        total_runs: 145,
        target_runs: 161,
        total_wickets: 10,
        is_completed: true,
      } as DbMatchInnings;

      const result = determineMatchResult('Titans', 'Strikers', inn1, inn2);
      expect(result.winnerTeamId).toBe('team-a');
      expect(result.summary).toBe('Titans won by 15 runs');
    });

    it('declares tie when runs are equal at completion', () => {
      const inn1 = { batting_team_id: 'team-a', total_runs: 150 } as DbMatchInnings;
      const inn2 = {
        batting_team_id: 'team-b',
        total_runs: 150,
        target_runs: 151,
        total_wickets: 10,
        is_completed: true,
      } as DbMatchInnings;

      const result = determineMatchResult('Titans', 'Strikers', inn1, inn2);
      expect(result.winnerTeamId).toBeNull();
      expect(result.summary).toBe('Match tied');
    });
  });

  describe('normalizeYouTubeVideoId — Video ID and URL parsing', () => {
    const expectedId = 'dQw4w9WgXcQ';

    it('handles direct 11-char video ID', () => {
      expect(normalizeYouTubeVideoId('dQw4w9WgXcQ')).toBe(expectedId);
    });

    it('parses standard youtube.com/watch?v= URLs', () => {
      expect(normalizeYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(expectedId);
      expect(normalizeYouTubeVideoId('https://youtube.com/watch?v=dQw4w9WgXcQ&t=10s')).toBe(expectedId);
    });

    it('parses youtu.be short URLs', () => {
      expect(normalizeYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe(expectedId);
    });

    it('parses youtube.com/live/ URLs', () => {
      expect(normalizeYouTubeVideoId('https://www.youtube.com/live/dQw4w9WgXcQ?si=abcdef12345')).toBe(expectedId);
    });

    it('parses youtube.com/embed/ URLs', () => {
      expect(normalizeYouTubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(expectedId);
    });

    it('returns null for invalid or empty inputs', () => {
      expect(normalizeYouTubeVideoId(null)).toBeNull();
      expect(normalizeYouTubeVideoId('')).toBeNull();
      expect(normalizeYouTubeVideoId('   ')).toBeNull();
      expect(normalizeYouTubeVideoId('https://example.com/not-youtube')).toBeNull();
      expect(normalizeYouTubeVideoId('short')).toBeNull();
    });
  });
});
