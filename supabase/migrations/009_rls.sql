-- =============================================================================
-- Migration 009: Row Level Security (RLS) Policies
-- =============================================================================
-- Establishes the security foundation for all tables.
-- Phase 2 strategy: DENY ALL by default, then add explicit grants.
-- Phase 3 will refine policies when Supabase Auth is integrated.
--
-- PRINCIPLES:
--   1. RLS is ENABLED on every table.
--   2. Default is DENY (no policies = no access).
--   3. Authenticated users get READ access to non-sensitive tables.
--   4. Mutations are restricted — auction events cannot be inserted by clients.
--   5. Mobile numbers and private data are never exposed via public policies.
--   6. audit_logs are admin-only.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enable RLS on ALL tables
-- ---------------------------------------------------------------------------
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE base_price_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_increment_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE franchises ENABLE ROW LEVEL SECURITY;
ALTER TABLE franchise_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_season_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_skill_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bucket_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE auction_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE auction_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE franchise_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Seasons — readable by all authenticated users
-- ---------------------------------------------------------------------------
CREATE POLICY seasons_select_authenticated ON seasons
  FOR SELECT TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- Season Config — readable by all authenticated users
-- ---------------------------------------------------------------------------
CREATE POLICY season_config_select_authenticated ON season_config
  FOR SELECT TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- Base Price Tiers — readable by all authenticated users
-- ---------------------------------------------------------------------------
CREATE POLICY base_price_tiers_select_authenticated ON base_price_tiers
  FOR SELECT TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- Bid Increment Rules — readable by all authenticated users
-- ---------------------------------------------------------------------------
CREATE POLICY bid_increment_rules_select_authenticated ON bid_increment_rules
  FOR SELECT TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- Bucket Rules — readable by all authenticated users
-- ---------------------------------------------------------------------------
CREATE POLICY bucket_rules_select_authenticated ON bucket_rules
  FOR SELECT TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- Users — users can read their own profile
-- (Admin read-all will be added in Phase 3)
-- ---------------------------------------------------------------------------
CREATE POLICY users_select_own ON users
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- ---------------------------------------------------------------------------
-- Season Roles — users can read their own role assignments
-- ---------------------------------------------------------------------------
CREATE POLICY season_roles_select_own ON season_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Players — no direct public read (use public view instead)
-- Players can read their own record via auth matching in Phase 3.
-- For now, deny all direct reads from the base table.
-- ---------------------------------------------------------------------------
-- (No SELECT policy = denied by RLS default)

-- ---------------------------------------------------------------------------
-- Franchises — readable by all authenticated users
-- (public info; coordinator mobile excluded from public views)
-- ---------------------------------------------------------------------------
CREATE POLICY franchises_select_authenticated ON franchises
  FOR SELECT TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- Franchise Members — members can read their own franchise's members
-- ---------------------------------------------------------------------------
CREATE POLICY franchise_members_select_own ON franchise_members
  FOR SELECT TO authenticated
  USING (
    franchise_id IN (
      SELECT fm.franchise_id FROM franchise_members fm
      WHERE fm.user_id = auth.uid() AND fm.is_active = true
    )
  );

-- ---------------------------------------------------------------------------
-- Player Season Registrations — no direct public read
-- (use public view instead to exclude mobile/private fields)
-- ---------------------------------------------------------------------------
-- (No SELECT policy = denied by RLS default)

-- ---------------------------------------------------------------------------
-- Player Skill Profiles — no direct public read
-- ---------------------------------------------------------------------------
-- (No SELECT policy = denied by RLS default)

-- ---------------------------------------------------------------------------
-- Auction Lots — readable by all authenticated users
-- ---------------------------------------------------------------------------
CREATE POLICY auction_lots_select_authenticated ON auction_lots
  FOR SELECT TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- Auction Events — readable by all authenticated users
-- NO INSERT/UPDATE/DELETE for regular clients.
-- Mutations happen only through server-side operations (Phase 3+).
-- ---------------------------------------------------------------------------
CREATE POLICY auction_events_select_authenticated ON auction_events
  FOR SELECT TO authenticated
  USING (true);

-- Explicitly deny client-side mutations on auction events.
-- (RLS default already denies, but this documents intent.)
-- No INSERT/UPDATE/DELETE policies are created for authenticated role.

-- ---------------------------------------------------------------------------
-- Franchise Referrals — franchise members can read their own referrals
-- ---------------------------------------------------------------------------
CREATE POLICY franchise_referrals_select_own ON franchise_referrals
  FOR SELECT TO authenticated
  USING (
    franchise_id IN (
      SELECT fm.franchise_id FROM franchise_members fm
      WHERE fm.user_id = auth.uid() AND fm.is_active = true
    )
  );

-- ---------------------------------------------------------------------------
-- Audit Logs — admin only (Phase 3 will add proper role checks)
-- For now, deny all access. Admin reads via service-role client.
-- ---------------------------------------------------------------------------
-- (No SELECT policy = denied by RLS default)
