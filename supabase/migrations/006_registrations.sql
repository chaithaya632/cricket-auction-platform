-- =============================================================================
-- Migration 006: Player Season Registrations & Skill Profiles
-- =============================================================================
-- One of the most important tables in the architecture.
-- Connects a permanent player identity to a specific ACC season.
-- Stores all season-sensitive data for historical reproducibility.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Player Season Registrations
-- ---------------------------------------------------------------------------
CREATE TABLE player_season_registrations (
  id                        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id                 uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  season_id                 uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,

  -- Registration lifecycle
  registration_status       text NOT NULL DEFAULT 'draft'
                              CHECK (registration_status IN (
                                'draft', 'pending_payment', 'pending_verification',
                                'eligible', 'ineligible'
                              )),

  -- Academic classification (structured, not parsed at runtime)
  programme                 text NOT NULL
                              CHECK (programme IN ('btech_regular', 'btech_lateral', 'diploma', 'pg')),
  academic_year             integer NOT NULL CHECK (academic_year >= 1 AND academic_year <= 6),
  branch                    text,          -- e.g. 'CSE', 'EEE', 'MBA' (for PG subcategories too)

  -- Bucket assignment
  bucket                    text NOT NULL
                              CHECK (bucket IN ('B1', 'B2', 'B3', 'B4', 'B5', 'PG')),

  -- Auction pricing
  base_price                integer NOT NULL CHECK (base_price > 0),

  -- CricHeroes integration
  cricheroes_url            text,
  cricheroes_registered_mobile text,       -- PRIVATE
  cricheroes_status         text NOT NULL DEFAULT 'unverified'
                              CHECK (cricheroes_status IN (
                                'profile_creation_pending', 'verification_pending',
                                'verified', 'rejected', 'unverified'
                              )),

  -- Payment
  payment_status            text NOT NULL DEFAULT 'unpaid'
                              CHECK (payment_status IN ('unpaid', 'paid')),

  -- Eligibility
  is_auction_eligible       boolean NOT NULL DEFAULT false,

  -- Academic year override (for detained students, spec §9)
  year_override             integer,
  year_override_reason      text,

  -- Timestamps
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),

  -- One registration per player per season
  CONSTRAINT psr_player_season_unique UNIQUE (player_id, season_id),

  -- year_override_reason required when year_override is set
  CONSTRAINT psr_override_reason_check CHECK (
    (year_override IS NOT NULL AND year_override_reason IS NOT NULL) OR
    year_override IS NULL
  )
);

CREATE INDEX psr_season_idx ON player_season_registrations(season_id);
CREATE INDEX psr_player_idx ON player_season_registrations(player_id);
CREATE INDEX psr_season_bucket_idx ON player_season_registrations(season_id, bucket);
CREATE INDEX psr_season_status_idx ON player_season_registrations(season_id, registration_status);

-- ---------------------------------------------------------------------------
-- Add FK from franchise_members to player_season_registrations
-- (deferred from migration 005)
-- ---------------------------------------------------------------------------
ALTER TABLE franchise_members
  ADD CONSTRAINT franchise_members_registration_fk
  FOREIGN KEY (player_registration_id)
  REFERENCES player_season_registrations(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Player Skill Profiles
-- ---------------------------------------------------------------------------
-- Season-specific skill questionnaire results.
-- One profile per registration. The derived_player_type is computed from
-- the questionnaire answers by the domain layer.
CREATE TABLE player_skill_profiles (
  id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  registration_id         uuid NOT NULL UNIQUE
                            REFERENCES player_season_registrations(id) ON DELETE CASCADE,

  -- Batting
  is_batter               boolean NOT NULL DEFAULT false,
  batting_style           text CHECK (batting_style IN ('right_hand', 'left_hand')),
  batting_order           text CHECK (batting_order IN (
                            'opener', 'top_order', 'middle_order', 'lower_order'
                          )),

  -- Bowling
  is_bowler               boolean NOT NULL DEFAULT false,
  bowling_style           text CHECK (bowling_style IN (
                            'right_arm_fast', 'right_arm_medium',
                            'left_arm_fast', 'left_arm_medium',
                            'right_arm_off_spin', 'right_arm_leg_spin',
                            'left_arm_orthodox', 'left_arm_chinaman'
                          )),

  -- Wicket-keeping
  is_wicket_keeper        boolean NOT NULL DEFAULT false,

  -- Fielder-only confirmation
  is_fielder_only         boolean NOT NULL DEFAULT false,

  -- Derived classification (computed by domain layer)
  derived_player_type     text NOT NULL
                            CHECK (derived_player_type IN (
                              'batter', 'bowler', 'all_rounder',
                              'wicket_keeper', 'wicket_keeper_batter', 'fielder'
                            )),

  -- Additional info
  fielding_position       text,
  experience_years        integer CHECK (experience_years IS NULL OR experience_years >= 0),
  experience_description  text,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  -- fielder_only must be true only when no other skill is selected
  CONSTRAINT psp_fielder_only_check CHECK (
    is_fielder_only = false OR
    (is_batter = false AND is_bowler = false AND is_wicket_keeper = false)
  )
);
