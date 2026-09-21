-- =============================================================================
-- Migration 011: Seed Data
-- =============================================================================
-- Deterministic seed data for development and testing.
-- Creates a default ACC 2026 season with standard configuration.
-- Does NOT create fake players, franchises, bids, or auction history.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Default Season
-- ---------------------------------------------------------------------------
INSERT INTO seasons (id, name, code, year, status, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'ACC 2026',
  'acc-2026',
  2026,
  'draft',
  true
)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Season Configuration
-- ---------------------------------------------------------------------------
INSERT INTO season_config (season_id, key, value, value_type, description) VALUES
  ('00000000-0000-0000-0000-000000000001', 'default_purse', '1000', 'integer', 'Starting purse for each franchise'),
  ('00000000-0000-0000-0000-000000000001', 'min_auction_purchases', '15', 'integer', 'Minimum players purchased through auction per franchise'),
  ('00000000-0000-0000-0000-000000000001', 'max_squad_size', '22', 'integer', 'Maximum total squad size per franchise'),
  ('00000000-0000-0000-0000-000000000001', 'min_squad_size', '17', 'integer', 'Minimum total squad size per franchise'),
  ('00000000-0000-0000-0000-000000000001', 'max_referrals', '5', 'integer', 'Maximum referred players per franchise'),
  ('00000000-0000-0000-0000-000000000001', 'max_franchises', '11', 'integer', 'Maximum number of franchises in the season'),
  ('00000000-0000-0000-0000-000000000001', 'max_players', '500', 'integer', 'Maximum player registrations for the season'),
  ('00000000-0000-0000-0000-000000000001', 'first_bid_timer_seconds', '30', 'integer', 'Timer duration for first bid on a lot'),
  ('00000000-0000-0000-0000-000000000001', 'subsequent_bid_timer_seconds', '20', 'integer', 'Timer reset duration after each valid bid')
ON CONFLICT (season_id, key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Bucket Rules
-- ---------------------------------------------------------------------------
INSERT INTO bucket_rules (season_id, bucket, display_name, min_purchases, is_mandatory, auction_order) VALUES
  ('00000000-0000-0000-0000-000000000001', 'B1', 'B.Tech Year 1', 2, true, 5),
  ('00000000-0000-0000-0000-000000000001', 'B2', 'B.Tech Year 2', 2, true, 3),
  ('00000000-0000-0000-0000-000000000001', 'B3', 'B.Tech Year 3', 2, true, 1),
  ('00000000-0000-0000-0000-000000000001', 'B4', 'B.Tech Year 4', 2, true, 2),
  ('00000000-0000-0000-0000-000000000001', 'B5', 'Diploma', 2, true, 4),
  ('00000000-0000-0000-0000-000000000001', 'PG', 'Post Graduate', 0, false, 6)
ON CONFLICT (season_id, bucket) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Base Price Tiers
-- ---------------------------------------------------------------------------
INSERT INTO base_price_tiers (season_id, price, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000001', 20, 1),
  ('00000000-0000-0000-0000-000000000001', 30, 2),
  ('00000000-0000-0000-0000-000000000001', 40, 3),
  ('00000000-0000-0000-0000-000000000001', 50, 4),
  ('00000000-0000-0000-0000-000000000001', 60, 5),
  ('00000000-0000-0000-0000-000000000001', 70, 6),
  ('00000000-0000-0000-0000-000000000001', 80, 7),
  ('00000000-0000-0000-0000-000000000001', 90, 8),
  ('00000000-0000-0000-0000-000000000001', 100, 9),
  ('00000000-0000-0000-0000-000000000001', 120, 10),
  ('00000000-0000-0000-0000-000000000001', 140, 11),
  ('00000000-0000-0000-0000-000000000001', 160, 12),
  ('00000000-0000-0000-0000-000000000001', 180, 13),
  ('00000000-0000-0000-0000-000000000001', 200, 14),
  ('00000000-0000-0000-0000-000000000001', 230, 15),
  ('00000000-0000-0000-0000-000000000001', 250, 16)
ON CONFLICT (season_id, price) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Bid Increment Rules
-- ---------------------------------------------------------------------------
-- Below 100: +10, 100-199: +20, 200+: +30
INSERT INTO bid_increment_rules (season_id, min_price, max_price, increment, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000001', 0, 99, 10, 1),
  ('00000000-0000-0000-0000-000000000001', 100, 199, 20, 2),
  ('00000000-0000-0000-0000-000000000001', 200, NULL, 30, 3)
ON CONFLICT (season_id, sort_order) DO NOTHING;

