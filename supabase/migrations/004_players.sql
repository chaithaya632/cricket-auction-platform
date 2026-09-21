-- =============================================================================
-- Migration 004: Players
-- =============================================================================
-- Players table represents permanent human identity.
-- One person = one player row, regardless of how many seasons they play.
-- Roll number is globally unique per the ACC specification.
-- =============================================================================

CREATE TABLE players (
  id            uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  roll_number   text NOT NULL UNIQUE,
  full_name     text NOT NULL,
  mobile        text NOT NULL,      -- PRIVATE: never in public views/APIs
  photo_url     text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Primary lookup pattern
CREATE INDEX players_roll_number_idx ON players(roll_number);

-- Name search support
CREATE INDEX players_full_name_trgm_idx ON players USING gin(full_name gin_trgm_ops);

