-- =============================================================================
-- Migration 002: Seasons & Season Configuration
-- =============================================================================
-- Seasons table supports multiple ACC editions.
-- Season configuration is normalized into typed key-value pairs and
-- dedicated tables for structured config (base prices, bid increments).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Seasons
-- ---------------------------------------------------------------------------
CREATE TABLE seasons (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          text NOT NULL,
  code          text NOT NULL UNIQUE,
  year          integer NOT NULL CHECK (year >= 2020 AND year <= 2100),
  status        text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'registration', 'auction', 'completed', 'archived')),
  start_date    date,
  end_date      date,
  is_active     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- end_date must be after start_date when both are set
  CONSTRAINT seasons_date_order CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

-- Only one active season at a time (partial unique index)
CREATE UNIQUE INDEX seasons_single_active_idx ON seasons (is_active) WHERE is_active = true;

-- ---------------------------------------------------------------------------
-- Season Configuration (typed key-value)
-- ---------------------------------------------------------------------------
-- Stores scalar season settings: purse, squad sizes, timers, etc.
-- value_type indicates how to interpret the text value.
CREATE TABLE season_config (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id     uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  key           text NOT NULL,
  value         text NOT NULL,
  value_type    text NOT NULL DEFAULT 'integer'
                  CHECK (value_type IN ('integer', 'text', 'boolean', 'json')),
  description   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT season_config_unique_key UNIQUE (season_id, key)
);

CREATE INDEX season_config_season_idx ON season_config(season_id);

-- ---------------------------------------------------------------------------
-- Base Price Tiers (per season)
-- ---------------------------------------------------------------------------
-- The ladder of allowed base prices for player registration.
CREATE TABLE base_price_tiers (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id     uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  price         integer NOT NULL CHECK (price > 0),
  sort_order    integer NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT base_price_tiers_unique UNIQUE (season_id, price),
  CONSTRAINT base_price_tiers_order_unique UNIQUE (season_id, sort_order)
);

CREATE INDEX base_price_tiers_season_idx ON base_price_tiers(season_id);

-- ---------------------------------------------------------------------------
-- Bid Increment Rules (per season)
-- ---------------------------------------------------------------------------
-- Defines increment tiers: e.g. below 100 → +10, 100-199 → +20, 200+ → +30
-- max_price = NULL means infinity (no upper bound).
CREATE TABLE bid_increment_rules (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id     uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  min_price     integer NOT NULL CHECK (min_price >= 0),
  max_price     integer,
  increment     integer NOT NULL CHECK (increment > 0),
  sort_order    integer NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bid_increment_rules_order_unique UNIQUE (season_id, sort_order),
  -- max_price must be > min_price when set
  CONSTRAINT bid_increment_price_range CHECK (max_price IS NULL OR max_price > min_price)
);

CREATE INDEX bid_increment_rules_season_idx ON bid_increment_rules(season_id);
