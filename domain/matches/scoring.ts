// =============================================================================
// ACC Match System — Domain Scoring Engine
// =============================================================================
// Pure functional domain models and calculations for cricket matches.
// Independent of React, Next.js, and database drivers.
// =============================================================================

import type {
  DbMatchDelivery,
  DbMatchInnings,
  ExtrasType,
  WicketType,
  BatterScorecardItem,
  BowlerScorecardItem,
  ExtrasSummary,
  FallOfWicketItem,
  OverDeliveryBadge,
  InningsScorecard,
} from '@/lib/matches/types';

export interface ProcessBallParams {
  runsBatter: number;
  extrasType: ExtrasType;
  extrasRuns: number;
  isWicket: boolean;
  wicketType?: WicketType | null;
  dismissedPlayerId?: string | null;
  currentStrikerId: string;
  currentNonStrikerId: string;
  currentLegalBalls: number;
  incomingBatterId?: string | null;
}

export interface ProcessBallResult {
  totalRuns: number;
  isLegalDelivery: boolean;
  nextStrikerId: string;
  nextNonStrikerId: string;
  nextLegalBalls: number;
  isOverCompleted: boolean;
  isWicket: boolean;
  wicketType: WicketType | null;
  dismissedPlayerId: string | null;
}

/**
 * Calculates delivery totals, legal delivery flag, and strike rotation.
 */
export function calculateDeliveryOutcome(params: ProcessBallParams): ProcessBallResult {
  const {
    runsBatter,
    extrasType,
    extrasRuns,
    isWicket,
    wicketType = null,
    dismissedPlayerId = null,
    currentStrikerId,
    currentNonStrikerId,
    currentLegalBalls,
    incomingBatterId,
  } = params;

  let totalRuns = runsBatter + extrasRuns;
  let isLegalDelivery = true;

  if (extrasType === 'wide' || extrasType === 'no_ball') {
    isLegalDelivery = false;
  }

  const nextLegalBalls = isLegalDelivery ? currentLegalBalls + 1 : currentLegalBalls;
  const isOverCompleted = isLegalDelivery && nextLegalBalls % 6 === 0;

  // Determine strike rotation
  let nextStrikerId = currentStrikerId;
  let nextNonStrikerId = currentNonStrikerId;

  // Runs that cause batters to physically cross:
  // - Bat runs
  // - Bye / Leg-bye
  // - Wides if extra runs were run (extrasRuns > 1)
  let runsRan = runsBatter;
  if (extrasType === 'bye' || extrasType === 'leg_bye') {
    runsRan = extrasRuns;
  } else if (extrasType === 'wide' && extrasRuns > 1) {
    runsRan = extrasRuns - 1; // 1 penalty + runs run
  }

  const oddRuns = runsRan % 2 === 1;

  if (isWicket) {
    if (wicketType === 'run_out') {
      // For run out, the dismissed player is replaced by incoming batter
      if (dismissedPlayerId === currentStrikerId) {
        nextStrikerId = incomingBatterId || '';
        if (oddRuns) {
          // If odd runs completed before run-out, surviving batter is at striker's end
          const temp = nextStrikerId;
          nextStrikerId = nextNonStrikerId;
          nextNonStrikerId = temp;
        }
      } else {
        nextNonStrikerId = incomingBatterId || '';
        if (oddRuns) {
          const temp = nextStrikerId;
          nextStrikerId = nextNonStrikerId;
          nextNonStrikerId = temp;
        }
      }
    } else {
      // Regular dismissal (bowled, caught, lbw, stumped, hit_wicket): striker is dismissed
      nextStrikerId = incomingBatterId || '';
      // Under modern MCC rules, incoming batter takes strike at the striker's end
    }
  } else {
    // Normal delivery without dismissal
    if (oddRuns) {
      nextStrikerId = currentNonStrikerId;
      nextNonStrikerId = currentStrikerId;
    }
  }

  // End of over end swap (if over completed and no odd-run swap cancelled it)
  if (isOverCompleted) {
    const temp = nextStrikerId;
    nextStrikerId = nextNonStrikerId;
    nextNonStrikerId = temp;
  }

  return {
    totalRuns,
    isLegalDelivery,
    nextStrikerId,
    nextNonStrikerId,
    nextLegalBalls,
    isOverCompleted,
    isWicket,
    wicketType,
    dismissedPlayerId: isWicket ? dismissedPlayerId || currentStrikerId : null,
  };
}

/**
 * Formats balls into overs string: e.g. 14 balls -> "2.2"
 */
export function formatOvers(legalBalls: number): string {
  const completedOvers = Math.floor(legalBalls / 6);
  const remainingBalls = legalBalls % 6;
  return `${completedOvers}.${remainingBalls}`;
}

/**
 * Formats run rate to 2 decimal places.
 */
export function calculateRunRate(runs: number, legalBalls: number): number {
  if (legalBalls === 0) return 0;
  return Number(((runs / legalBalls) * 6).toFixed(2));
}

/**
 * Calculates Required Run Rate for chasing team.
 */
export function calculateRequiredRunRate(
  targetRuns: number | null,
  currentRuns: number,
  legalBalls: number,
  maxOvers: number
): number | null {
  if (!targetRuns) return null;
  const remainingRuns = targetRuns - currentRuns;
  if (remainingRuns <= 0) return 0;
  const totalAllowedBalls = maxOvers * 6;
  const remainingBalls = totalAllowedBalls - legalBalls;
  if (remainingBalls <= 0) return null;
  return Number(((remainingRuns / remainingBalls) * 6).toFixed(2));
}

/**
 * Derives full scorecard metrics deterministically from deliveries.
 */
export function deriveScorecard(
  innings: DbMatchInnings,
  deliveries: DbMatchDelivery[],
  playerMap: Map<string, { name: string; photoUrl: string | null }>,
  maxOvers: number,
  currentStrikerId?: string | null,
  currentNonStrikerId?: string | null,
  currentBowlerId?: string | null
): {
  batters: BatterScorecardItem[];
  bowlers: BowlerScorecardItem[];
  extras: ExtrasSummary;
  fallOfWickets: FallOfWicketItem[];
  currentOverDeliveries: OverDeliveryBadge[];
  oversDisplay: string;
  runRate: number;
  requiredRunRate: number | null;
} {
  // Filter only authoritative, non-reversed deliveries
  const activeDeliveries = deliveries
    .filter((d) => !d.is_reversed)
    .sort((a, b) => a.delivery_sequence - b.delivery_sequence);

  // 1. Batter tracking
  const batterStats = new Map<
    string,
    {
      runs: number;
      balls: number;
      fours: number;
      sixes: number;
      isOut: boolean;
      dismissalText?: string;
    }
  >();

  // 2. Bowler tracking
  const bowlerStats = new Map<
    string,
    {
      legalBalls: number;
      runsConceded: number;
      wickets: number;
      oversMap: Map<number, { legalBalls: number; runs: number }>;
    }
  >();

  // 3. Extras
  const extras: ExtrasSummary = {
    wides: 0,
    noBalls: 0,
    byes: 0,
    legByes: 0,
    penalty: 0,
    total: 0,
  };

  // 4. Fall of wickets
  const fallOfWickets: FallOfWicketItem[] = [];
  let runningRuns = 0;
  let runningLegalBalls = 0;
  let runningWickets = 0;

  for (const d of activeDeliveries) {
    runningRuns += d.total_runs;
    if (d.is_legal_delivery) {
      runningLegalBalls += 1;
    }

    // Batter stats
    if (!batterStats.has(d.striker_id)) {
      batterStats.set(d.striker_id, { runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false });
    }
    const b = batterStats.get(d.striker_id)!;
    b.runs += d.runs_batter;
    if (d.extras_type !== 'wide') {
      b.balls += 1;
    }
    if (d.runs_batter === 4) b.fours += 1;
    if (d.runs_batter === 6) b.sixes += 1;

    // Ensure non-striker exists in batter map
    if (!batterStats.has(d.non_striker_id)) {
      batterStats.set(d.non_striker_id, { runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false });
    }

    // Bowler stats
    if (!bowlerStats.has(d.bowler_id)) {
      bowlerStats.set(d.bowler_id, {
        legalBalls: 0,
        runsConceded: 0,
        wickets: 0,
        oversMap: new Map(),
      });
    }
    const bowl = bowlerStats.get(d.bowler_id)!;

    // Bowler runs conceded: bat runs + wide/no-ball extras (byes and leg-byes are not conceded by bowler)
    let bowlerCost = d.runs_batter;
    if (d.extras_type === 'wide' || d.extras_type === 'no_ball' || d.extras_type === 'penalty') {
      bowlerCost += d.extras_runs;
    }
    bowl.runsConceded += bowlerCost;

    if (d.is_legal_delivery) {
      bowl.legalBalls += 1;
    }

    // Over breakdown for maidens
    if (!bowl.oversMap.has(d.over_number)) {
      bowl.oversMap.set(d.over_number, { legalBalls: 0, runs: 0 });
    }
    const ov = bowl.oversMap.get(d.over_number)!;
    if (d.is_legal_delivery) ov.legalBalls += 1;
    ov.runs += bowlerCost;

    // Extras breakdown
    if (d.extras_type === 'wide') extras.wides += d.extras_runs;
    if (d.extras_type === 'no_ball') extras.noBalls += d.extras_runs;
    if (d.extras_type === 'bye') extras.byes += d.extras_runs;
    if (d.extras_type === 'leg_bye') extras.legByes += d.extras_runs;
    if (d.extras_type === 'penalty') extras.penalty += d.extras_runs;
    extras.total += d.extras_runs;

    // Wickets
    if (d.is_wicket && d.dismissed_player_id) {
      runningWickets += 1;
      const dismissedName = playerMap.get(d.dismissed_player_id)?.name || 'Batter';
      fallOfWickets.push({
        wicketNumber: runningWickets,
        runs: runningRuns,
        overs: formatOvers(runningLegalBalls),
        playerName: dismissedName,
      });

      // Update batter dismissal
      if (!batterStats.has(d.dismissed_player_id)) {
        batterStats.set(d.dismissed_player_id, {
          runs: 0,
          balls: 0,
          fours: 0,
          sixes: 0,
          isOut: true,
        });
      }
      const dismissedBatter = batterStats.get(d.dismissed_player_id)!;
      dismissedBatter.isOut = true;
      const bowlerName = playerMap.get(d.bowler_id)?.name || 'Bowler';

      if (d.wicket_type === 'bowled') {
        dismissedBatter.dismissalText = `b ${bowlerName}`;
        bowl.wickets += 1;
      } else if (d.wicket_type === 'lbw') {
        dismissedBatter.dismissalText = `lbw b ${bowlerName}`;
        bowl.wickets += 1;
      } else if (d.wicket_type === 'caught') {
        dismissedBatter.dismissalText = `c & b ${bowlerName}`;
        bowl.wickets += 1;
      } else if (d.wicket_type === 'stumped') {
        dismissedBatter.dismissalText = `st b ${bowlerName}`;
        bowl.wickets += 1;
      } else if (d.wicket_type === 'hit_wicket') {
        dismissedBatter.dismissalText = `hit wicket b ${bowlerName}`;
        bowl.wickets += 1;
      } else if (d.wicket_type === 'run_out') {
        dismissedBatter.dismissalText = `run out`;
        // Run outs are NOT credited to the bowler's wickets tally
      }
    }
  }

  // Format Batters Scorecard
  const batters: BatterScorecardItem[] = [];
  for (const [regId, stat] of batterStats.entries()) {
    const pInfo = playerMap.get(regId);
    const sr = stat.balls > 0 ? Number(((stat.runs / stat.balls) * 100).toFixed(2)) : 0;
    const isOnCrease = !stat.isOut && (regId === currentStrikerId || regId === currentNonStrikerId);
    batters.push({
      registrationId: regId,
      playerName: pInfo?.name || 'Player',
      photoUrl: pInfo?.photoUrl || null,
      runs: stat.runs,
      balls: stat.balls,
      fours: stat.fours,
      sixes: stat.sixes,
      strikeRate: sr,
      isOut: stat.isOut,
      dismissalText: stat.dismissalText,
      isOnCrease,
      isStriker: regId === currentStrikerId,
    });
  }

  // Format Bowlers Scorecard
  const bowlers: BowlerScorecardItem[] = [];
  for (const [regId, stat] of bowlerStats.entries()) {
    const pInfo = playerMap.get(regId);
    let maidens = 0;
    for (const ov of stat.oversMap.values()) {
      if (ov.legalBalls === 6 && ov.runs === 0) {
        maidens += 1;
      }
    }
    const econ =
      stat.legalBalls > 0 ? Number(((stat.runsConceded / stat.legalBalls) * 6).toFixed(2)) : 0;
    bowlers.push({
      registrationId: regId,
      playerName: pInfo?.name || 'Bowler',
      photoUrl: pInfo?.photoUrl || null,
      overs: formatOvers(stat.legalBalls),
      legalBalls: stat.legalBalls,
      maidens,
      runsConceded: stat.runsConceded,
      wickets: stat.wickets,
      economy: econ,
      isCurrentBowler: regId === currentBowlerId,
    });
  }

  // Current over delivery badges
  const latestDelivery = activeDeliveries[activeDeliveries.length - 1];
  const currentOverNumber = latestDelivery ? latestDelivery.over_number : 0;
  const currentOverDeliveries: OverDeliveryBadge[] = activeDeliveries
    .filter((d) => d.over_number === currentOverNumber)
    .map((d) => {
      let display = `${d.runs_batter}`;
      if (d.is_wicket) display = 'W';
      else if (d.extras_type === 'wide') display = d.extras_runs > 1 ? `${d.extras_runs}Wd` : 'Wd';
      else if (d.extras_type === 'no_ball') display = d.runs_batter > 0 ? `${d.runs_batter}Nb` : 'Nb';
      else if (d.extras_type === 'bye') display = `${d.extras_runs}B`;
      else if (d.extras_type === 'leg_bye') display = `${d.extras_runs}Lb`;
      else if (d.runs_batter === 4) display = '4';
      else if (d.runs_batter === 6) display = '6';

      return {
        id: d.id,
        ballNumber: d.ball_number,
        display,
        isWicket: d.is_wicket,
        isExtra: d.extras_type !== 'none',
        runs: d.total_runs,
      };
    });

  const oversDisplay = formatOvers(innings.total_legal_balls);
  const runRate = calculateRunRate(innings.total_runs, innings.total_legal_balls);
  const requiredRunRate = calculateRequiredRunRate(
    innings.target_runs,
    innings.total_runs,
    innings.total_legal_balls,
    maxOvers
  );

  return {
    batters,
    bowlers,
    extras,
    fallOfWickets,
    currentOverDeliveries,
    oversDisplay,
    runRate,
    requiredRunRate,
  };
}

/**
 * Determines match winner summary when match concludes.
 */
export function determineMatchResult(
  teamAName: string,
  teamBName: string,
  innings1: DbMatchInnings,
  innings2: DbMatchInnings
): { winnerTeamId: string | null; summary: string } {
  if (!innings2.target_runs) {
    return { winnerTeamId: null, summary: 'Match drawn' };
  }

  const team2Runs = innings2.total_runs;
  const target = innings2.target_runs;

  if (team2Runs >= target) {
    const wicketsInHand = 10 - innings2.total_wickets;
    return {
      winnerTeamId: innings2.batting_team_id,
      summary: `${teamBName} won by ${wicketsInHand} wicket${wicketsInHand === 1 ? '' : 's'}`,
    };
  } else if (team2Runs === target - 1 && innings2.is_completed) {
    return {
      winnerTeamId: null,
      summary: 'Match tied',
    };
  } else if (innings2.is_completed) {
    const margin = target - 1 - team2Runs;
    return {
      winnerTeamId: innings1.batting_team_id,
      summary: `${teamAName} won by ${margin} run${margin === 1 ? '' : 's'}`,
    };
  }

  return { winnerTeamId: null, summary: 'Match in progress' };
}
