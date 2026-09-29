-- =============================================================================
-- Migration 014: Live Cricket Match Subsystem
-- =============================================================================
-- Tables:
--   1. matches
--   2. match_innings
--   3. match_players
--   4. match_deliveries (authoritative ball-by-ball history with idempotency & audit undo)
--   5. match_scorers (match-level scorer authorization)
--
-- RLS: Enabled on all tables. Public access restricted to published matches.
-- Mutations strictly executed via Server Actions using privileged server client.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Matches
-- ---------------------------------------------------------------------------
CREATE TABLE matches (
  id                      uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  season_id               uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  team_a_id               uuid NOT NULL REFERENCES franchises(id) ON DELETE RESTRICT,
  team_b_id               uuid NOT NULL REFERENCES franchises(id) ON DELETE RESTRICT,
  scheduled_at            timestamptz,
  venue                   text,
  max_overs               integer NOT NULL DEFAULT 20 CHECK (max_overs >= 1 AND max_overs <= 50),
  status                  text NOT NULL DEFAULT 'scheduled'
                            CHECK (status IN ('scheduled', 'toss', 'live', 'innings_break', 'completed', 'abandoned')),
  toss_winner_id          uuid REFERENCES franchises(id) ON DELETE SET NULL,
  toss_decision           text CHECK (toss_decision IS NULL OR toss_decision IN ('bat', 'bowl')),
  current_innings_number  integer CHECK (current_innings_number IS NULL OR current_innings_number IN (1, 2)),
  winner_id               uuid REFERENCES franchises(id) ON DELETE SET NULL,
  result_summary          text,
  youtube_video_id        text CHECK (youtube_video_id IS NULL OR length(trim(youtube_video_id)) <= 64),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  -- Teams must differ
  CONSTRAINT matches_different_teams CHECK (team_a_id <> team_b_id),
  -- Toss winner must be one of the playing teams
  CONSTRAINT matches_toss_winner_valid CHECK (
    toss_winner_id IS NULL OR toss_winner_id = team_a_id OR toss_winner_id = team_b_id
  ),
  -- Winner must be one of the playing teams
  CONSTRAINT matches_winner_valid CHECK (
    winner_id IS NULL OR winner_id = team_a_id OR winner_id = team_b_id
  ),
  -- Toss decision must accompany toss winner unless abandoned
  CONSTRAINT matches_toss_pairing_check CHECK (
    (toss_winner_id IS NULL AND toss_decision IS NULL) OR
    (toss_winner_id IS NOT NULL AND toss_decision IS NOT NULL) OR
    status = 'abandoned'
  )
);

CREATE INDEX matches_season_idx ON matches(season_id);
CREATE INDEX matches_status_idx ON matches(status);
CREATE INDEX matches_teams_idx ON matches(team_a_id, team_b_id);

-- ---------------------------------------------------------------------------
-- 2. Match Innings
-- ---------------------------------------------------------------------------
CREATE TABLE match_innings (
  id                  uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  match_id            uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  innings_number      integer NOT NULL CHECK (innings_number IN (1, 2)),
  batting_team_id     uuid NOT NULL REFERENCES franchises(id) ON DELETE RESTRICT,
  bowling_team_id     uuid NOT NULL REFERENCES franchises(id) ON DELETE RESTRICT,
  total_runs          integer NOT NULL DEFAULT 0 CHECK (total_runs >= 0),
  total_wickets       integer NOT NULL DEFAULT 0 CHECK (total_wickets >= 0 AND total_wickets <= 10),
  total_legal_balls   integer NOT NULL DEFAULT 0 CHECK (total_legal_balls >= 0),
  target_runs         integer CHECK (target_runs IS NULL OR target_runs > 0),
  is_completed        boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- Unique innings per match
  CONSTRAINT match_innings_unique_match_num UNIQUE (match_id, innings_number),
  -- Batting and bowling teams must differ
  CONSTRAINT match_innings_different_teams CHECK (batting_team_id <> bowling_team_id)
);

CREATE INDEX match_innings_match_idx ON match_innings(match_id);

-- ---------------------------------------------------------------------------
-- 3. Match Players (Roster / Playing XI)
-- ---------------------------------------------------------------------------
CREATE TABLE match_players (
  id                      uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  match_id                uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  franchise_id            uuid NOT NULL REFERENCES franchises(id) ON DELETE CASCADE,
  player_registration_id  uuid NOT NULL REFERENCES player_season_registrations(id) ON DELETE CASCADE,
  is_playing_xi           boolean NOT NULL DEFAULT false,
  is_captain              boolean NOT NULL DEFAULT false,
  is_wicket_keeper        boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),

  -- Player can only be listed once per match
  CONSTRAINT match_players_unique UNIQUE (match_id, player_registration_id),
  -- Captain and Keeper must be from Playing XI
  CONSTRAINT match_players_captain_xi CHECK (is_captain = false OR is_playing_xi = true),
  CONSTRAINT match_players_keeper_xi CHECK (is_wicket_keeper = false OR is_playing_xi = true)
);

CREATE INDEX match_players_match_idx ON match_players(match_id);
CREATE INDEX match_players_franchise_idx ON match_players(franchise_id);
CREATE INDEX match_players_registration_idx ON match_players(player_registration_id);

-- ---------------------------------------------------------------------------
-- 4. Match Deliveries (Authoritative Ball-by-Ball History & Idempotency)
-- ---------------------------------------------------------------------------
CREATE TABLE match_deliveries (
  id                  uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  innings_id          uuid NOT NULL REFERENCES match_innings(id) ON DELETE CASCADE,
  delivery_sequence   integer NOT NULL CHECK (delivery_sequence >= 1),
  submission_id       uuid NOT NULL,
  over_number         integer NOT NULL CHECK (over_number >= 0),
  ball_number         integer NOT NULL CHECK (ball_number >= 1),
  striker_id          uuid NOT NULL REFERENCES player_season_registrations(id),
  non_striker_id      uuid NOT NULL REFERENCES player_season_registrations(id),
  bowler_id           uuid NOT NULL REFERENCES player_season_registrations(id),
  runs_batter         integer NOT NULL DEFAULT 0 CHECK (runs_batter >= 0 AND runs_batter <= 6),
  extras_runs         integer NOT NULL DEFAULT 0 CHECK (extras_runs >= 0),
  extras_type         text NOT NULL DEFAULT 'none'
                        CHECK (extras_type IN ('none', 'wide', 'no_ball', 'bye', 'leg_bye', 'penalty')),
  total_runs          integer NOT NULL CHECK (total_runs >= 0),
  is_legal_delivery   boolean NOT NULL,
  is_wicket           boolean NOT NULL DEFAULT false,
  wicket_type         text CHECK (wicket_type IS NULL OR wicket_type IN (
                        'bowled', 'caught', 'lbw', 'run_out', 'stumped', 'hit_wicket'
                      )),
  dismissed_player_id uuid REFERENCES player_season_registrations(id),
  is_reversed         boolean NOT NULL DEFAULT false,
  reversal_reason     text,
  reversed_at         timestamptz,
  commentary          text,
  created_at          timestamptz NOT NULL DEFAULT now(),

  -- Strict delivery sequence ordering per innings
  CONSTRAINT match_deliveries_sequence_unique UNIQUE (innings_id, delivery_sequence),
  -- Genuine database-enforced idempotency key
  CONSTRAINT match_deliveries_submission_unique UNIQUE (innings_id, submission_id),
  -- Distinct players on pitch
  CONSTRAINT match_deliveries_striker_distinct CHECK (striker_id <> non_striker_id),
  CONSTRAINT match_deliveries_bowler_distinct CHECK (bowler_id <> striker_id AND bowler_id <> non_striker_id),
  -- Total runs match breakdown
  CONSTRAINT match_deliveries_sum_runs_check CHECK (total_runs = runs_batter + extras_runs),
  -- Wicket integrity
  CONSTRAINT match_deliveries_wicket_check CHECK (
    (is_wicket = false AND wicket_type IS NULL AND dismissed_player_id IS NULL) OR
    (is_wicket = true AND wicket_type IS NOT NULL AND dismissed_player_id IS NOT NULL)
  )
);

CREATE INDEX match_deliveries_innings_seq_idx ON match_deliveries(innings_id, delivery_sequence);
CREATE INDEX match_deliveries_innings_active_idx ON match_deliveries(innings_id, is_reversed);

-- ---------------------------------------------------------------------------
-- 5. Match Scorers (Match-level Authorization)
-- ---------------------------------------------------------------------------
CREATE TABLE match_scorers (
  id          uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  match_id    uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT match_scorers_unique UNIQUE (match_id, user_id)
);

CREATE INDEX match_scorers_match_idx ON match_scorers(match_id);
CREATE INDEX match_scorers_user_idx ON match_scorers(user_id);

-- ---------------------------------------------------------------------------
-- Row Level Security (RLS)
-- ---------------------------------------------------------------------------
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_innings ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_scorers ENABLE ROW LEVEL SECURITY;

-- Matches: Public read for published/scheduled/live/completed matches
CREATE POLICY matches_select_public ON matches
  FOR SELECT TO anon, authenticated
  USING (
    status IN ('scheduled', 'toss', 'live', 'innings_break', 'completed', 'abandoned')
  );

-- Match Innings: Public read when parent match is public
CREATE POLICY match_innings_select_public ON match_innings
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_innings.match_id
        AND m.status IN ('scheduled', 'toss', 'live', 'innings_break', 'completed', 'abandoned')
    )
  );

-- Match Players: Public read when parent match is public
CREATE POLICY match_players_select_public ON match_players
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_players.match_id
        AND m.status IN ('scheduled', 'toss', 'live', 'innings_break', 'completed', 'abandoned')
    )
  );

-- Match Deliveries: Public read when parent match is public
CREATE POLICY match_deliveries_select_public ON match_deliveries
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM match_innings mi
      JOIN matches m ON m.id = mi.match_id
      WHERE mi.id = match_deliveries.innings_id
        AND m.status IN ('scheduled', 'toss', 'live', 'innings_break', 'completed', 'abandoned')
    )
  );

-- Match Scorers: Users see only their own assignments, or admin sees all
CREATE POLICY match_scorers_select_authorized ON match_scorers
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM season_roles sr
      WHERE sr.user_id = auth.uid()
        AND sr.role IN ('super_admin', 'operator')
        AND sr.is_active = true
    )
  );
