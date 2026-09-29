// =============================================================================
// ACC Match System — Types & Interfaces
// =============================================================================

export type MatchStatus =
  | 'scheduled'
  | 'toss'
  | 'live'
  | 'innings_break'
  | 'completed'
  | 'abandoned';

export type TossDecision = 'bat' | 'bowl';

export type ExtrasType = 'none' | 'wide' | 'no_ball' | 'bye' | 'leg_bye' | 'penalty';

export type WicketType =
  | 'bowled'
  | 'caught'
  | 'lbw'
  | 'run_out'
  | 'stumped'
  | 'hit_wicket';

export interface DbMatch {
  id: string;
  season_id: string;
  team_a_id: string;
  team_b_id: string;
  scheduled_at: string | null;
  venue: string | null;
  max_overs: number;
  status: MatchStatus;
  toss_winner_id: string | null;
  toss_decision: TossDecision | null;
  current_innings_number: number | null;
  winner_id: string | null;
  result_summary: string | null;
  youtube_video_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbMatchInnings {
  id: string;
  match_id: string;
  innings_number: number;
  batting_team_id: string;
  bowling_team_id: string;
  total_runs: number;
  total_wickets: number;
  total_legal_balls: number;
  target_runs: number | null;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbMatchPlayer {
  id: string;
  match_id: string;
  franchise_id: string;
  player_registration_id: string;
  is_playing_xi: boolean;
  is_captain: boolean;
  is_wicket_keeper: boolean;
  created_at: string;
}

export interface DbMatchDelivery {
  id: string;
  innings_id: string;
  delivery_sequence: number;
  submission_id: string;
  over_number: number;
  ball_number: number;
  striker_id: string;
  non_striker_id: string;
  bowler_id: string;
  runs_batter: number;
  extras_runs: number;
  extras_type: ExtrasType;
  total_runs: number;
  is_legal_delivery: boolean;
  is_wicket: boolean;
  wicket_type: WicketType | null;
  dismissed_player_id: string | null;
  is_reversed: boolean;
  reversal_reason: string | null;
  reversed_at: string | null;
  commentary: string | null;
  created_at: string;
}

export interface DbMatchScorer {
  id: string;
  match_id: string;
  user_id: string;
  is_active: boolean;
  created_at: string;
}

// -----------------------------------------------------------------------------
// Scorecard & Presentation Types
// -----------------------------------------------------------------------------

export interface BatterScorecardItem {
  registrationId: string;
  playerName: string;
  photoUrl: string | null;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: number;
  isOut: boolean;
  dismissalText?: string;
  isOnCrease: boolean;
  isStriker: boolean;
}

export interface BowlerScorecardItem {
  registrationId: string;
  playerName: string;
  photoUrl: string | null;
  overs: string; // e.g. "3.4"
  legalBalls: number;
  maidens: number;
  runsConceded: number;
  wickets: number;
  economy: number;
  isCurrentBowler: boolean;
}

export interface OverDeliveryBadge {
  id: string;
  ballNumber: number;
  display: string;
  isWicket: boolean;
  isExtra: boolean;
  runs: number;
}

export interface FallOfWicketItem {
  wicketNumber: number;
  runs: number;
  overs: string;
  playerName: string;
}

export interface ExtrasSummary {
  wides: number;
  noBalls: number;
  byes: number;
  legByes: number;
  penalty: number;
  total: number;
}

export interface InningsScorecard {
  innings: DbMatchInnings;
  battingTeamName: string;
  battingTeamShortName: string;
  battingTeamLogo: string | null;
  bowlingTeamName: string;
  bowlingTeamShortName: string;
  bowlingTeamLogo: string | null;
  batters: BatterScorecardItem[];
  bowlers: BowlerScorecardItem[];
  extras: ExtrasSummary;
  fallOfWickets: FallOfWicketItem[];
  currentOverDeliveries: OverDeliveryBadge[];
  recentDeliveries: DbMatchDelivery[];
  runRate: number;
  requiredRunRate: number | null;
  oversDisplay: string; // e.g. "14.2"
}

export interface MatchDetails {
  match: DbMatch;
  teamA: {
    id: string;
    name: string;
    shortName: string;
    logoUrl: string | null;
    colorPrimary: string | null;
    colorSecondary: string | null;
  };
  teamB: {
    id: string;
    name: string;
    shortName: string;
    logoUrl: string | null;
    colorPrimary: string | null;
    colorSecondary: string | null;
  };
  innings1: InningsScorecard | null;
  innings2: InningsScorecard | null;
  activeInnings: InningsScorecard | null;
  currentStriker: BatterScorecardItem | null;
  currentNonStriker: BatterScorecardItem | null;
  currentBowler: BowlerScorecardItem | null;
  teamAPlayingXI: MatchPlayerWithDetails[];
  teamBPlayingXI: MatchPlayerWithDetails[];
}

export interface MatchPlayerWithDetails {
  id: string;
  matchId: string;
  franchiseId: string;
  playerRegistrationId: string;
  playerName: string;
  photoUrl: string | null;
  playerType: string | null;
  battingStyle: string | null;
  bowlingStyle: string | null;
  isPlayingXI: boolean;
  isCaptain: boolean;
  isWicketKeeper: boolean;
}

export type MatchEventType =
  | 'MATCH_CREATED'
  | 'MATCH_STARTED'
  | 'TOSS_RECORDED'
  | 'PLAYING_XI_SET'
  | 'INNINGS_STARTED'
  | 'BALL_SCORED'
  | 'DELIVERY_REVERSED'
  | 'OVER_COMPLETED'
  | 'WICKET'
  | 'INNINGS_COMPLETED'
  | 'MATCH_COMPLETED'
  | 'VIDEO_UPDATED';

export interface MatchActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}
