-- =============================================================================
-- Migration 003: Users & Season Roles
-- =============================================================================
-- Users table provides application-level profile linked to Supabase Auth.
-- Season roles assign users to specific roles per ACC edition.
-- Auth integration itself is Phase 3; this is the schema foundation.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Users (application profile)
-- ---------------------------------------------------------------------------
-- The id column will reference auth.users(id) when Supabase Auth is
-- integrated in Phase 3. For now it is a standalone UUID primary key.
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         text NOT NULL UNIQUE,
  full_name     text NOT NULL,
  phone         text,
  avatar_url    text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Season Roles
-- ---------------------------------------------------------------------------
-- Assigns roles to users per season. A user can have different roles
-- in different seasons. franchise_id is required when role = 'franchise'.
CREATE TABLE season_roles (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season_id     uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  role          text NOT NULL
                  CHECK (role IN ('super_admin', 'operator', 'franchise', 'player', 'viewer')),
  franchise_id  uuid,  -- FK added after franchises table is created (migration 005)
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),

  -- One assignment per role per user per season
  CONSTRAINT season_roles_unique UNIQUE (user_id, season_id, role),

  -- franchise_id required for franchise role, must be null for others
  CONSTRAINT season_roles_franchise_check CHECK (
    (role = 'franchise' AND franchise_id IS NOT NULL) OR
    (role != 'franchise' AND franchise_id IS NULL)
  )
);

CREATE INDEX season_roles_user_idx ON season_roles(user_id);
CREATE INDEX season_roles_season_idx ON season_roles(season_id);
CREATE INDEX season_roles_franchise_idx ON season_roles(franchise_id) WHERE franchise_id IS NOT NULL;
