// =============================================================================
// ACC Auction Portal — Player Application Layer Types
// =============================================================================

import type { DbPlayer, DbPlayerSeasonRegistration, DbPlayerSkillProfile } from '@/lib/db/types';

export interface PlayerProfileInput {
  full_name: string;
  roll_number: string;
  mobile: string;
  photo_url?: string | null;
}

export interface PlayerRegistrationInput {
  roll_number: string;
  base_price: number;
  cricheroes_url?: string | null;
  cricheroes_registered_mobile?: string | null;
  // Overrides for manual adjustment if authorized
  programme?: 'btech_regular' | 'btech_lateral' | 'diploma' | 'pg';
  academic_year?: number;
  branch?: string | null;
  year_override?: number | null;
  year_override_reason?: string | null;
}

export interface PlayerSkillInput {
  is_batter: boolean;
  batting_style?: 'right_hand' | 'left_hand' | null;
  batting_order?: 'opener' | 'top_order' | 'middle_order' | 'lower_order' | null;
  is_bowler: boolean;
  bowling_style?:
    | 'right_arm_fast'
    | 'right_arm_medium'
    | 'left_arm_fast'
    | 'left_arm_medium'
    | 'right_arm_off_spin'
    | 'right_arm_leg_spin'
    | 'left_arm_orthodox'
    | 'left_arm_chinaman'
    | null;
  is_wicket_keeper: boolean;
  is_fielder_only: boolean;
  fielding_position?: string | null;
  experience_years?: number | null;
  experience_description?: string | null;
}

export interface PlayerFullData {
  player: DbPlayer | null;
  registration: DbPlayerSeasonRegistration | null;
  skillProfile: DbPlayerSkillProfile | null;
}

export interface PlayerCareerStats {
  matches: number;
  runs: number;
  battingAvg: number;
  strikeRate: number;
  highestScore: number;
  wickets: number;
  bowlingAvg: number;
  economy: number;
  catches: number;
  stumpings: number;
  notes?: string;
}

export interface PlayerActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  mode?: 'deleted' | 'deactivated';
}

export interface AdminCreatePlayerInput {
  full_name: string;
  roll_number: string;
  mobile: string;
  photo_url?: string | null;
  programme?: 'btech_regular' | 'btech_lateral' | 'diploma' | 'pg';
  academic_year?: number;
  branch?: string | null;
  base_price?: number;
  player_type?: 'batter' | 'bowler' | 'all_rounder' | 'wicket_keeper' | 'wicket_keeper_batter' | 'fielder';
  batting_style?: 'right_hand' | 'left_hand' | null;
  bowling_style?: string | null;
  cricheroes_url?: string | null;
}

export interface AdminDeletePlayerResult {
  mode: 'deleted' | 'deactivated';
  message: string;
  playerId: string;
}
