-- =============================================================================
-- Migration 013: Player & Registration Row Level Security (RLS) Policies
-- =============================================================================
-- Enables own-row SELECT, INSERT, and UPDATE for authenticated players.
-- Enables admin SELECT for active super_admin and operator roles.
-- Does NOT weaken public data protection: mobile numbers remain private.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Players Policies
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  -- Player reads own permanent player identity
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'players' AND policyname = 'players_select_own'
  ) THEN
    CREATE POLICY players_select_own ON public.players
      FOR SELECT TO authenticated
      USING (id = auth.uid());
  END IF;

  -- Player inserts own permanent player record
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'players' AND policyname = 'players_insert_own'
  ) THEN
    CREATE POLICY players_insert_own ON public.players
      FOR INSERT TO authenticated
      WITH CHECK (id = auth.uid());
  END IF;

  -- Player updates own permanent player record
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'players' AND policyname = 'players_update_own'
  ) THEN
    CREATE POLICY players_update_own ON public.players
      FOR UPDATE TO authenticated
      USING (id = auth.uid())
      WITH CHECK (id = auth.uid());
  END IF;

  -- Admin reads all player records
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'players' AND policyname = 'players_select_admin'
  ) THEN
    CREATE POLICY players_select_admin ON public.players
      FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.season_roles sr
        WHERE sr.user_id = auth.uid()
          AND sr.role IN ('super_admin', 'operator')
          AND sr.is_active = true
      ));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Player Season Registrations Policies
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  -- Player reads own season registrations
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'player_season_registrations' AND policyname = 'psr_select_own'
  ) THEN
    CREATE POLICY psr_select_own ON public.player_season_registrations
      FOR SELECT TO authenticated
      USING (player_id = auth.uid());
  END IF;

  -- Player inserts own season registration
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'player_season_registrations' AND policyname = 'psr_insert_own'
  ) THEN
    CREATE POLICY psr_insert_own ON public.player_season_registrations
      FOR INSERT TO authenticated
      WITH CHECK (player_id = auth.uid());
  END IF;

  -- Player updates own season registration
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'player_season_registrations' AND policyname = 'psr_update_own'
  ) THEN
    CREATE POLICY psr_update_own ON public.player_season_registrations
      FOR UPDATE TO authenticated
      USING (player_id = auth.uid())
      WITH CHECK (player_id = auth.uid());
  END IF;

  -- Admin reads all season registrations
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'player_season_registrations' AND policyname = 'psr_select_admin'
  ) THEN
    CREATE POLICY psr_select_admin ON public.player_season_registrations
      FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.season_roles sr
        WHERE sr.user_id = auth.uid()
          AND sr.role IN ('super_admin', 'operator')
          AND sr.is_active = true
      ));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Player Skill Profiles Policies
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  -- Player reads own skill profile
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'player_skill_profiles' AND policyname = 'psp_select_own'
  ) THEN
    CREATE POLICY psp_select_own ON public.player_skill_profiles
      FOR SELECT TO authenticated
      USING (registration_id IN (
        SELECT psr.id FROM public.player_season_registrations psr
        WHERE psr.player_id = auth.uid()
      ));
  END IF;

  -- Player inserts own skill profile
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'player_skill_profiles' AND policyname = 'psp_insert_own'
  ) THEN
    CREATE POLICY psp_insert_own ON public.player_skill_profiles
      FOR INSERT TO authenticated
      WITH CHECK (registration_id IN (
        SELECT psr.id FROM public.player_season_registrations psr
        WHERE psr.player_id = auth.uid()
      ));
  END IF;

  -- Player updates own skill profile
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'player_skill_profiles' AND policyname = 'psp_update_own'
  ) THEN
    CREATE POLICY psp_update_own ON public.player_skill_profiles
      FOR UPDATE TO authenticated
      USING (registration_id IN (
        SELECT psr.id FROM public.player_season_registrations psr
        WHERE psr.player_id = auth.uid()
      ))
      WITH CHECK (registration_id IN (
        SELECT psr.id FROM public.player_season_registrations psr
        WHERE psr.player_id = auth.uid()
      ));
  END IF;

  -- Admin reads all skill profiles
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'player_skill_profiles' AND policyname = 'psp_select_admin'
  ) THEN
    CREATE POLICY psp_select_admin ON public.player_skill_profiles
      FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.season_roles sr
        WHERE sr.user_id = auth.uid()
          AND sr.role IN ('super_admin', 'operator')
          AND sr.is_active = true
      ));
  END IF;
END $$;
