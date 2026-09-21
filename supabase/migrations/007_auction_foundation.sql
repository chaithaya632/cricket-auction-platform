-- =============================================================================
-- Migration 007: Auction Foundation
-- =============================================================================
-- Bucket rules, auction lots (operational state), auction events (immutable
-- authoritative history), and franchise referrals.
--
-- ARCHITECTURE NOTE:
--   auction_events is the AUTHORITATIVE auction history.
--   auction_lots is OPERATIONAL STATE / projection.
--   Derived values (purse, purchase counts, etc.) are NOT stored here —
--   they will be computed by the domain layer from events + configuration.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Bucket Rules (per-season configuration)
-- ---------------------------------------------------------------------------
CREATE TABLE bucket_rules (
  id              uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  season_id       uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  bucket          text NOT NULL
                    CHECK (bucket IN ('B1', 'B2', 'B3', 'B4', 'B5', 'PG')),
  display_name    text NOT NULL,
  min_purchases   integer NOT NULL DEFAULT 0 CHECK (min_purchases >= 0),
  is_mandatory    boolean NOT NULL DEFAULT true,
  auction_order   integer NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bucket_rules_unique UNIQUE (season_id, bucket),
  CONSTRAINT bucket_rules_order_unique UNIQUE (season_id, auction_order)
);

CREATE INDEX bucket_rules_season_idx ON bucket_rules(season_id);

-- ---------------------------------------------------------------------------
-- Auction Lots (operational state — NOT authoritative history)
-- ---------------------------------------------------------------------------
-- Represents a player's placement and current state within an auction.
-- This is a projection that will be updated as the auction progresses.
-- The authoritative history lives in auction_events.
CREATE TABLE auction_lots (
  id                          uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  season_id                   uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  registration_id             uuid NOT NULL
                                REFERENCES player_season_registrations(id) ON DELETE CASCADE,
  bucket                      text NOT NULL
                                CHECK (bucket IN ('B1', 'B2', 'B3', 'B4', 'B5', 'PG')),
  draw_number                 integer NOT NULL,
  base_price                  integer NOT NULL CHECK (base_price > 0),
  round                       integer NOT NULL DEFAULT 1 CHECK (round IN (1, 2)),
  status                      text NOT NULL DEFAULT 'pending'
                                CHECK (status IN (
                                  'pending', 'in_progress', 'sold', 'unsold',
                                  'skipped', 'recalled', 'allotted', 'scouted'
                                )),
  current_price               integer,
  highest_bidder_franchise_id uuid REFERENCES franchises(id) ON DELETE SET NULL,
  started_at                  timestamptz,
  ended_at                    timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  -- Unique draw number per season per round
  CONSTRAINT auction_lots_draw_unique UNIQUE (season_id, draw_number, round),
  -- One lot per player per round
  CONSTRAINT auction_lots_registration_round_unique UNIQUE (season_id, registration_id, round)
);

CREATE INDEX auction_lots_season_status_idx ON auction_lots(season_id, status);
CREATE INDEX auction_lots_season_bucket_idx ON auction_lots(season_id, bucket);
CREATE INDEX auction_lots_registration_idx ON auction_lots(registration_id);

-- ---------------------------------------------------------------------------
-- Auction Event Sequence
-- ---------------------------------------------------------------------------
-- Global per-database monotonic counter for deterministic event ordering.
-- Two events in the same millisecond will still have distinct sequence numbers.
CREATE SEQUENCE auction_event_seq START WITH 1 INCREMENT BY 1;

-- ---------------------------------------------------------------------------
-- Auction Events (IMMUTABLE authoritative history)
-- ---------------------------------------------------------------------------
-- Append-only event log. Each event contains enough information to
-- reconstruct the auction history. Events are NEVER updated or deleted
-- by normal operations — corrective events (e.g. UNDO_SALE) are appended.
CREATE TABLE auction_events (
  id                uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  season_id         uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  auction_lot_id    uuid NOT NULL REFERENCES auction_lots(id) ON DELETE CASCADE,
  event_type        text NOT NULL
                      CHECK (event_type IN (
                        'LOT_CREATED', 'PLAYER_SELECTED', 'BID_PLACED',
                        'PASS', 'RE_ENTER', 'HAMMER', 'SALE', 'UNSOLD',
                        'SKIP', 'UNDO_SALE', 'ALLOTMENT', 'SCOUTING',
                        'BUCKET_RELAXATION', 'PAUSE', 'RESUME'
                      )),
  actor_user_id     uuid NOT NULL REFERENCES users(id),
  franchise_id      uuid REFERENCES franchises(id),
  price             integer,
  reason            text,
  payload           jsonb,
  sequence_number   bigint NOT NULL DEFAULT nextval('auction_event_seq'),
  created_at        timestamptz NOT NULL DEFAULT now(),

  -- Globally unique sequence per season for deterministic ordering
  CONSTRAINT auction_events_sequence_unique UNIQUE (season_id, sequence_number)
);

CREATE INDEX auction_events_lot_idx ON auction_events(season_id, auction_lot_id);
CREATE INDEX auction_events_season_created_idx ON auction_events(season_id, created_at);
CREATE INDEX auction_events_type_idx ON auction_events(season_id, event_type);

-- ---------------------------------------------------------------------------
-- Franchise Referrals
-- ---------------------------------------------------------------------------
-- ACC references are season-specific (via the franchise's season_id).
-- Maximum 5 per franchise is enforced at the application/domain layer
-- (a CHECK constraint cannot reference a count of rows).
CREATE TABLE franchise_referrals (
  id                  uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  franchise_id        uuid NOT NULL REFERENCES franchises(id) ON DELETE CASCADE,
  registration_id     uuid NOT NULL
                        REFERENCES player_season_registrations(id) ON DELETE CASCADE,
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'rejected', 'conflict')),
  verified_by_user_id uuid REFERENCES users(id),
  verified_at         timestamptz,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- A franchise can only refer a specific player registration once
  CONSTRAINT franchise_referrals_unique UNIQUE (franchise_id, registration_id)
);

CREATE INDEX franchise_referrals_franchise_idx ON franchise_referrals(franchise_id);
CREATE INDEX franchise_referrals_registration_idx ON franchise_referrals(registration_id);

