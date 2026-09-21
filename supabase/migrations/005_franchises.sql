-- =============================================================================
-- Migration 005: Franchises & Franchise Members
-- =============================================================================
-- Franchises belong to a specific season.
-- Franchise members link users to franchises with specific roles.
-- Captain/VC are unique per franchise and linked to player registrations.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Franchises
-- ---------------------------------------------------------------------------
CREATE TABLE franchises (
  id                          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id                   uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  name                        text NOT NULL,
  short_name                  text NOT NULL,
  logo_url                    text,
  color_primary               text,
  color_secondary             text,
  faculty_coordinator_name    text,
  faculty_coordinator_mobile  text,       -- PRIVATE: not in public views
  faculty_coordinator_photo_url text,
  is_active                   boolean NOT NULL DEFAULT true,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  -- Unique name within a season
  CONSTRAINT franchises_name_unique UNIQUE (season_id, name),
  CONSTRAINT franchises_short_name_unique UNIQUE (season_id, short_name)
);

CREATE INDEX franchises_season_idx ON franchises(season_id);

-- ---------------------------------------------------------------------------
-- Add FK from season_roles to franchises (deferred from migration 003)
-- ---------------------------------------------------------------------------
ALTER TABLE season_roles
  ADD CONSTRAINT season_roles_franchise_fk
  FOREIGN KEY (franchise_id) REFERENCES franchises(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Franchise Members
-- ---------------------------------------------------------------------------
-- Links users to franchises with specific franchise-level roles.
-- player_registration_id is set for captain/vice_captain to link them
-- to their player registration record.
CREATE TABLE franchise_members (
  id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  franchise_id            uuid NOT NULL REFERENCES franchises(id) ON DELETE CASCADE,
  user_id                 uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role                    text NOT NULL
                            CHECK (role IN ('representative', 'captain', 'vice_captain')),
  player_registration_id  uuid,  -- FK added after registrations table (migration 006)
  is_active               boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),

  -- A user can have only one role per franchise
  CONSTRAINT franchise_members_user_unique UNIQUE (franchise_id, user_id)
);

-- Only one captain per franchise
CREATE UNIQUE INDEX franchise_members_captain_unique
  ON franchise_members(franchise_id)
  WHERE role = 'captain' AND is_active = true;

-- Only one vice_captain per franchise
CREATE UNIQUE INDEX franchise_members_vice_captain_unique
  ON franchise_members(franchise_id)
  WHERE role = 'vice_captain' AND is_active = true;

CREATE INDEX franchise_members_franchise_idx ON franchise_members(franchise_id);
CREATE INDEX franchise_members_user_idx ON franchise_members(user_id);
