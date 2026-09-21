// =============================================================================
// ACC Auction Portal — Player Queries
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DbPlayer, DbPlayerSeasonRegistration, DbPlayerSkillProfile } from '@/lib/db/types';
import type { PlayerFullData } from './types';

/**
 * Retrieves a permanent player record by ID.
 * Bound to the user's authenticated ID via RLS.
 */
export async function getPlayerProfile(
  supabase: SupabaseClient,
  playerId: string
): Promise<DbPlayer | null> {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('id', playerId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as DbPlayer;
}

/**
 * Retrieves a player's season registration for a given season.
 */
export async function getPlayerRegistration(
  supabase: SupabaseClient,
  playerId: string,
  seasonId: string
): Promise<DbPlayerSeasonRegistration | null> {
  const { data, error } = await supabase
    .from('player_season_registrations')
    .select('*')
    .eq('player_id', playerId)
    .eq('season_id', seasonId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as DbPlayerSeasonRegistration;
}

/**
 * Retrieves a player's skill questionnaire answers by registration ID.
 */
export async function getPlayerSkillProfile(
  supabase: SupabaseClient,
  registrationId: string
): Promise<DbPlayerSkillProfile | null> {
  const { data, error } = await supabase
    .from('player_skill_profiles')
    .select('*')
    .eq('registration_id', registrationId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as DbPlayerSkillProfile;
}

/**
 * Aggregates player profile, season registration, and skill profile.
 */
export async function getPlayerFullData(
  supabase: SupabaseClient,
  playerId: string,
  seasonId: string
): Promise<PlayerFullData> {
  const player = await getPlayerProfile(supabase, playerId);
  if (!player) {
    return {
      player: null,
      registration: null,
      skillProfile: null,
    };
  }

  const registration = await getPlayerRegistration(supabase, playerId, seasonId);
  let skillProfile: DbPlayerSkillProfile | null = null;

  if (registration) {
    skillProfile = await getPlayerSkillProfile(supabase, registration.id);
  }

  return {
    player,
    registration,
    skillProfile,
  };
}
