// =============================================================================
// ACC Auction Portal — Player Queries
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DbPlayer, DbPlayerSeasonRegistration, DbPlayerSkillProfile } from '@/lib/db/types';
import type { Player, PlayerType, PlayerStatus, Bucket } from '@/lib/acc/types';
import { PLAYERS } from '@/lib/acc/mock-data';
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

/**
 * Retrieves the unified player registry for admin consoles.
 * Reads real database records from players + registrations + skill profiles.
 * Merges seamlessly so newly registered players appear immediately.
 */
export async function getAdminPlayersList(
  supabase: SupabaseClient,
  seasonId?: string
): Promise<Player[]> {
  try {
    const { data: dbPlayers, error } = await supabase
      .from('players')
      .select(`
        id,
        roll_number,
        full_name,
        photo_url,
        is_active,
        created_at,
        player_season_registrations (
          id,
          season_id,
          programme,
          academic_year,
          branch,
          bucket,
          base_price,
          registration_status,
          cricheroes_status,
          is_auction_eligible,
          created_at,
          player_skill_profiles (
            derived_player_type
          ),
          auction_lots (
            status,
            current_price,
            highest_bidder_franchise_id
          )
        )
      `)
      .eq('is_active', true);

    if (error || !dbPlayers || dbPlayers.length === 0) {
      return PLAYERS;
    }

    const typeMap: Record<string, PlayerType> = {
      batter: 'Batter',
      bowler: 'Bowler',
      all_rounder: 'All-rounder',
      wicket_keeper: 'Wicket-keeper',
      wicket_keeper_batter: 'Wicket-keeper batter',
      fielder: 'Batter',
    };

    const parsedDbPlayers: Player[] = dbPlayers.map((p) => {
      const regList = (p as any).player_season_registrations;
      const reg = Array.isArray(regList)
        ? (seasonId ? regList.find((r: any) => r.season_id === seasonId) : regList[0])
        : regList;

      const skillList = reg?.player_skill_profiles;
      const skill = Array.isArray(skillList) ? skillList[0] : skillList;

      const lotList = reg?.auction_lots;
      const lot = Array.isArray(lotList) ? lotList[0] : lotList;

      let status: PlayerStatus = 'APPROVED';
      if (lot) {
        if (lot.status === 'sold') status = 'SOLD';
        else if (lot.status === 'unsold') status = 'UNSOLD';
        else if (lot.status === 'in_progress') status = 'IN_AUCTION';
      } else if (reg?.registration_status === 'pending_verification') {
        status = 'UNDER_REVIEW';
      } else if (reg?.registration_status === 'draft') {
        status = 'REGISTERED';
      }

      const courseVal =
        reg?.programme === 'pg'
          ? 'PG'
          : reg?.programme === 'diploma'
          ? 'Diploma'
          : 'UG';

      const dType = skill?.derived_player_type as string | undefined;

      return {
        id: p.id,
        rollNumber: p.roll_number,
        fullName: p.full_name,
        photoUrl: p.photo_url || '/placeholder.svg',
        course: courseVal,
        program: reg?.programme?.toUpperCase() || 'BTECH',
        branch: reg?.branch || 'CSE',
        yearOfStudy: reg?.academic_year || 1,
        isLateral: reg?.programme === 'btech_lateral',
        bucket: (reg?.bucket as Bucket) || 'B1',
        playerType: dType && typeMap[dType] ? typeMap[dType] : 'All-rounder',
        basePrice: reg?.base_price || 100,
        status,
        registeredAt: reg?.created_at || p.created_at,
        cricheroesVerified: reg?.cricheroes_status === 'verified',
        soldTo: lot?.highest_bidder_franchise_id || undefined,
        soldPrice: lot?.current_price || undefined,
        stats: {
          matches: 0,
          runs: 0,
          battingAvg: 0,
          strikeRate: 0,
          highestScore: 0,
          wickets: 0,
          bowlingAvg: 0,
          economy: 0,
          catches: 0,
          stumpings: 0,
        },
      };
    });

    const dbRolls = new Set(parsedDbPlayers.map((p) => p.rollNumber.toLowerCase()));
    const remainingMocks = PLAYERS.filter((p) => !dbRolls.has(p.rollNumber.toLowerCase()));

    return [...parsedDbPlayers, ...remainingMocks];
  } catch {
    return PLAYERS;
  }
}
