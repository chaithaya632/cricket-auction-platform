-- =============================================================================
-- Migration 012: Supabase Auth to Public Users Synchronization & User Policies
-- =============================================================================
-- Automatically syncs authenticated users from auth.users into public.users.
-- Adds own-profile INSERT and UPDATE policies for authenticated users.
-- Does NOT allow users to assign roles or elevate privileges.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Function: handle_new_user
-- ---------------------------------------------------------------------------
-- Runs with SECURITY DEFINER to safely insert into public.users on signup.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, avatar_url)
  VALUES (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        updated_at = now();
  RETURN new;
END;
$$;

-- ---------------------------------------------------------------------------
-- Trigger: on_auth_user_created
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Additional RLS Policies for public.users
-- ---------------------------------------------------------------------------
-- In migration 009, only users_select_own was created.
-- Allow authenticated users to insert their own profile row if not already synced.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'users_insert_own'
  ) THEN
    CREATE POLICY users_insert_own ON public.users
      FOR INSERT TO authenticated
      WITH CHECK (id = auth.uid());
  END IF;
END $$;

-- Allow authenticated users to update their own profile details.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'users_update_own'
  ) THEN
    CREATE POLICY users_update_own ON public.users
      FOR UPDATE TO authenticated
      USING (id = auth.uid())
      WITH CHECK (id = auth.uid());
  END IF;
END $$;
