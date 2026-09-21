// =============================================================================
// ACC Auction Portal — Database Row Types
// =============================================================================
// TypeScript types representing raw database table rows.
// These are SEPARATE from the domain-level types in lib/types.ts.
// Domain types represent business concepts; these represent storage rows.
//
// When Supabase codegen is available, these can be auto-generated.
// For now they are hand-written to match the migration schema.
// =============================================================================

// ---------------------------------------------------------------------------
// Seasons
// ---------------------------------------------------------------------------
export interface DbSeason {
  id: string;
  name: string;
  code: string;
  year: number;
  status: 'draft' | 'registration' | 'auction' | 'completed' | 'archived';
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbSeasonConfig {
  id: string;
  season_id: string;
  key: string;
  value: string;
  value_type: 'integer' | 'text' | 'boolean' | 'json';
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbBasePriceTier {
  id: string;
  season_id: string;
  price: number;
  sort_order: number;
  created_at: string;
}

export interface DbBidIncrementRule {
  id: string;
  season_id: string;
  min_price: number;
  max_price: number | null;
  increment: number;
  sort_order: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Users & Roles
// ---------------------------------------------------------------------------
export interface DbUser {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbSeasonRole {
  id: string;
  user_id: string;
  season_id: string;
  role: 'super_admin' | 'operator' | 'franchise' | 'player' | 'viewer';
  franchise_id: string | null;
  is_active: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------
export interface DbPlayer {
  id: string;
  roll_number: string;
  full_name: string;
  mobile: string;          // PRIVATE — never in public APIs
  photo_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Franchises
// ---------------------------------------------------------------------------
export interface DbFranchise {
  id: string;
  season_id: string;
  name: string;
  short_name: string;
  logo_url: string | null;
  color_primary: string | null;
  color_secondary: string | null;
  faculty_coordinator_name: string | null;
  faculty_coordinator_mobile: string | null;  // PRIVATE
  faculty_coordinator_photo_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbFranchiseMember {
  id: string;
  franchise_id: string;
  user_id: string;
  role: 'representative' | 'captain' | 'vice_captain';
  player_registration_id: string | null;
  is_active: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Player Season Registrations
// ---------------------------------------------------------------------------
export interface DbPlayerSeasonRegistration {
  id: string;
  player_id: string;
  season_id: string;
  registration_status: 'draft' | 'pending_payment' | 'pending_verification' | 'eligible' | 'ineligible';
  programme: 'btech_regular' | 'btech_lateral' | 'diploma' | 'pg';
  academic_year: number;
  branch: string | null;
  bucket: 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'PG';
  base_price: number;
  cricheroes_url: string | null;
  cricheroes_registered_mobile: string | null;  // PRIVATE
  cricheroes_status: 'profile_creation_pending' | 'verification_pending' | 'verified' | 'rejected' | 'unverified';
  payment_status: 'unpaid' | 'paid';
  is_auction_eligible: boolean;
  year_override: number | null;
  year_override_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbPlayerSkillProfile {
  id: string;
  registration_id: string;
  is_batter: boolean;
  batting_style: 'right_hand' | 'left_hand' | null;
  batting_order: 'opener' | 'top_order' | 'middle_order' | 'lower_order' | null;
  is_bowler: boolean;
  bowling_style: 'right_arm_fast' | 'right_arm_medium' | 'left_arm_fast' | 'left_arm_medium' | 'right_arm_off_spin' | 'right_arm_leg_spin' | 'left_arm_orthodox' | 'left_arm_chinaman' | null;
  is_wicket_keeper: boolean;
  is_fielder_only: boolean;
  derived_player_type: 'batter' | 'bowler' | 'all_rounder' | 'wicket_keeper' | 'wicket_keeper_batter' | 'fielder';
  fielding_position: string | null;
  experience_years: number | null;
  experience_description: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Auction
// ---------------------------------------------------------------------------
export interface DbBucketRule {
  id: string;
  season_id: string;
  bucket: 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'PG';
  display_name: string;
  min_purchases: number;
  is_mandatory: boolean;
  auction_order: number;
  created_at: string;
}

export interface DbAuctionLot {
  id: string;
  season_id: string;
  registration_id: string;
  bucket: 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'PG';
  draw_number: number;
  base_price: number;
  round: 1 | 2;
  status: 'pending' | 'in_progress' | 'sold' | 'unsold' | 'skipped' | 'recalled' | 'allotted' | 'scouted';
  current_price: number | null;
  highest_bidder_franchise_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbAuctionEvent {
  id: string;
  season_id: string;
  auction_lot_id: string;
  event_type:
    | 'LOT_CREATED' | 'PLAYER_SELECTED' | 'BID_PLACED'
    | 'PASS' | 'RE_ENTER' | 'HAMMER' | 'SALE' | 'UNSOLD'
    | 'SKIP' | 'UNDO_SALE' | 'ALLOTMENT' | 'SCOUTING'
    | 'BUCKET_RELAXATION' | 'PAUSE' | 'RESUME';
  actor_user_id: string;
  franchise_id: string | null;
  price: number | null;
  reason: string | null;
  payload: Record<string, unknown> | null;
  sequence_number: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Referrals
// ---------------------------------------------------------------------------
export interface DbFranchiseReferral {
  id: string;
  franchise_id: string;
  registration_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'conflict';
  verified_by_user_id: string | null;
  verified_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------
export interface DbAuditLog {
  id: string;
  season_id: string | null;
  actor_user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Public Views
// ---------------------------------------------------------------------------
export interface DbPublicPlayerView {
  registration_id: string;
  season_id: string;
  player_id: string;
  full_name: string;
  photo_url: string | null;
  programme: string;
  academic_year: number;
  branch: string | null;
  bucket: string;
  base_price: number;
  registration_status: string;
  cricheroes_status: string;
  cricheroes_url: string | null;  // only when verified
  is_auction_eligible: boolean;
  derived_player_type: string | null;
  is_batter: boolean | null;
  is_bowler: boolean | null;
  is_wicket_keeper: boolean | null;
  batting_style: string | null;
  bowling_style: string | null;
  experience_years: number | null;
  // NOTE: mobile is intentionally absent
}

export interface DbPublicFranchiseView {
  franchise_id: string;
  season_id: string;
  name: string;
  short_name: string;
  logo_url: string | null;
  color_primary: string | null;
  color_secondary: string | null;
  faculty_coordinator_name: string | null;
  is_active: boolean;
  // NOTE: faculty_coordinator_mobile is intentionally absent
}

export interface DbPublicAuctionLotView {
  lot_id: string;
  season_id: string;
  bucket: string;
  draw_number: number;
  base_price: number;
  round: number;
  status: string;
  current_price: number | null;
  started_at: string | null;
  ended_at: string | null;
  player_name: string;
  player_photo_url: string | null;
  programme: string;
  academic_year: number;
  branch: string | null;
  derived_player_type: string | null;
  highest_bidder_franchise_name: string | null;
  highest_bidder_franchise_short_name: string | null;
  highest_bidder_franchise_logo_url: string | null;
  // NOTE: mobile is intentionally absent
}

// ---------------------------------------------------------------------------
// Table names (for schema validation tests)
// ---------------------------------------------------------------------------
export const DB_TABLE_NAMES = [
  'seasons',
  'season_config',
  'base_price_tiers',
  'bid_increment_rules',
  'users',
  'season_roles',
  'players',
  'franchises',
  'franchise_members',
  'player_season_registrations',
  'player_skill_profiles',
  'bucket_rules',
  'auction_lots',
  'auction_events',
  'franchise_referrals',
  'audit_logs',
] as const;

export type DbTableName = (typeof DB_TABLE_NAMES)[number];
