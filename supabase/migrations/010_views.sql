-- =============================================================================
-- Migration 010: Public-Safe Views
-- =============================================================================
-- Views that expose only non-sensitive data for public/authenticated
-- consumption. These views intentionally EXCLUDE:
--   - mobile numbers
--   - private contact data
--   - internal verification metadata
--   - security-sensitive fields
--
-- The base tables remain protected by RLS.
-- Views provide a safe read interface.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Public Players View
-- ---------------------------------------------------------------------------
-- Safe for public consumption. Excludes mobile, cricheroes_registered_mobile,
-- payment_status, year_override_reason, and internal metadata.
CREATE OR REPLACE VIEW public_players_view AS
SELECT
  psr.id AS registration_id,
  psr.season_id,
  p.id AS player_id,
  p.full_name,
  p.photo_url,
  psr.programme,
  psr.academic_year,
  psr.branch,
  psr.bucket,
  psr.base_price,
  psr.registration_status,
  psr.cricheroes_status,
  -- Only show CricHeroes URL if verified
  CASE WHEN psr.cricheroes_status = 'verified' THEN psr.cricheroes_url ELSE NULL END AS cricheroes_url,
  psr.is_auction_eligible,
  psp.derived_player_type,
  psp.is_batter,
  psp.is_bowler,
  psp.is_wicket_keeper,
  psp.batting_style,
  psp.bowling_style,
  psp.experience_years
FROM player_season_registrations psr
JOIN players p ON p.id = psr.player_id
LEFT JOIN player_skill_profiles psp ON psp.registration_id = psr.id
WHERE p.is_active = true;

-- ---------------------------------------------------------------------------
-- Public Franchises View
-- ---------------------------------------------------------------------------
-- Safe for public consumption. Excludes faculty_coordinator_mobile.
CREATE OR REPLACE VIEW public_franchises_view AS
SELECT
  f.id AS franchise_id,
  f.season_id,
  f.name,
  f.short_name,
  f.logo_url,
  f.color_primary,
  f.color_secondary,
  f.faculty_coordinator_name,
  f.is_active
FROM franchises f
WHERE f.is_active = true;

-- ---------------------------------------------------------------------------
-- Public Auction Lots View
-- ---------------------------------------------------------------------------
-- Safe for public consumption. Joins player name and franchise name.
-- Excludes all mobile/private fields.
CREATE OR REPLACE VIEW public_auction_lots_view AS
SELECT
  al.id AS lot_id,
  al.season_id,
  al.bucket,
  al.draw_number,
  al.base_price,
  al.round,
  al.status,
  al.current_price,
  al.started_at,
  al.ended_at,
  p.full_name AS player_name,
  p.photo_url AS player_photo_url,
  psr.programme,
  psr.academic_year,
  psr.branch,
  psp.derived_player_type,
  f.name AS highest_bidder_franchise_name,
  f.short_name AS highest_bidder_franchise_short_name,
  f.logo_url AS highest_bidder_franchise_logo_url
FROM auction_lots al
JOIN player_season_registrations psr ON psr.id = al.registration_id
JOIN players p ON p.id = psr.player_id
LEFT JOIN player_skill_profiles psp ON psp.registration_id = psr.id
LEFT JOIN franchises f ON f.id = al.highest_bidder_franchise_id;
