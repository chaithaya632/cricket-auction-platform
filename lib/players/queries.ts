// =============================================================================
// ACC Auction Portal — Player Queries
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DbPlayer, DbPlayerSeasonRegistration, DbPlayerSkillProfile } from '@/lib/db/types';
import type { Player, PlayerType, PlayerStatus, Bucket } from '@/lib/acc/types';
import type { PlayerFullData, PlayerCareerStats } from './types';
import { evaluatePlayerEligibility } from '@/domain/players/eligibility';

/**
 * Safely parses structured career statistics from player_skill_profiles.experience_description.
 */
export function parseCareerStats(experienceDescription?: string | null): PlayerCareerStats {
  const defaultStats: PlayerCareerStats = {
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
  };

  if (!experienceDescription || typeof experienceDescription !== 'string') {
    return defaultStats;
  }

  try {
    const parsed = JSON.parse(experienceDescription);
    if (parsed && typeof parsed === 'object') {
      return {
        matches: Number(parsed.matches) || 0,
        runs: Number(parsed.runs) || 0,
        battingAvg: Number(parsed.battingAvg) || 0,
        strikeRate: Number(parsed.strikeRate) || 0,
        highestScore: Number(parsed.highestScore) || 0,
        wickets: Number(parsed.wickets) || 0,
        bowlingAvg: Number(parsed.bowlingAvg) || 0,
        economy: Number(parsed.economy) || 0,
        catches: Number(parsed.catches) || 0,
        stumpings: Number(parsed.stumpings) || 0,
        notes: typeof parsed.notes === 'string' ? parsed.notes : undefined,
      };
    }
  } catch {
    // If it is plain text, keep notes
    return {
      ...defaultStats,
      notes: experienceDescription,
    };
  }

  return defaultStats;
}

/**
 * Retrieves the auction lot and result for a player's registration in a season.
 */
export async function getPlayerAuctionLot(
  supabase: SupabaseClient,
  registrationId: string
) {
  try {
    const { data: lot } = await supabase
      .from('auction_lots')
      .select(`
        id,
        draw_number,
        bucket,
        base_price,
        current_price,
        status,
        highest_bidder_franchise_id,
        franchises:highest_bidder_franchise_id (
          id,
          name,
          short_name
        )
      `)
      .eq('registration_id', registrationId)
      .maybeSingle();

    return lot || null;
  } catch {
    return null;
  }
}

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
        mobile,
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
          payment_status,
          cricheroes_url,
          cricheroes_registered_mobile,
          cricheroes_status,
          is_auction_eligible,
          year_override,
          year_override_reason,
          created_at,
          player_skill_profiles (
            derived_player_type,
            is_batter,
            is_bowler,
            is_wicket_keeper,
            batting_style,
            bowling_style,
            batting_order,
            experience_description
          ),
          auction_lots (
            status,
            current_price,
            highest_bidder_franchise_id
          )
        )
      `);

    const targetSeasonId = seasonId || '00000000-0000-0000-0000-000000000001';

    // 2. Fetch users assigned the player role in this season who may not have finished profile
    const { data: roleAssignedUsers } = await supabase
      .from('season_roles')
      .select('user_id, users(id, full_name, email, created_at)')
      .eq('season_id', targetSeasonId)
      .eq('role', 'player')
      .eq('is_active', true);

    const typeMap: Record<string, PlayerType> = {
      batter: 'Batter',
      bowler: 'Bowler',
      all_rounder: 'All-rounder',
      wicket_keeper: 'Wicket-keeper',
      wicket_keeper_batter: 'Wicket-keeper batter',
      fielder: 'Batter',
    };

    const parsedDbPlayers: Player[] = (dbPlayers || []).map((p) => {
      const regList = (p as any).player_season_registrations;
      const reg = Array.isArray(regList)
        ? (seasonId ? regList.find((r: any) => r.season_id === seasonId) : regList[0])
        : regList;

      const skillList = reg?.player_skill_profiles;
      const skill = Array.isArray(skillList) ? skillList[0] : skillList;

      const lotList = reg?.auction_lots;
      const lot = Array.isArray(lotList) ? lotList[0] : lotList;

      let status: PlayerStatus = 'UNDER_REVIEW';
      if (lot) {
        if (lot.status === 'sold') status = 'SOLD';
        else if (lot.status === 'unsold') status = 'UNSOLD';
        else if (lot.status === 'in_progress') status = 'IN_AUCTION';
      } else if (p.is_active === false) {
        status = 'UNDER_REVIEW';
      } else if (reg?.is_auction_eligible) {
        status = 'APPROVED';
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

      // Evaluate detailed eligibility
      const eligibilityBreakdown = evaluatePlayerEligibility({
        hasProfile: true,
        fullName: p.full_name,
        rollNumber: p.roll_number,
        mobile: p.mobile,
        photoUrl: p.photo_url,
        hasRegistration: Boolean(reg),
        programme: reg?.programme,
        academicYear: reg?.academic_year,
        branch: reg?.branch,
        bucket: reg?.bucket,
        hasSkillProfile: Boolean(skill),
        paymentStatus: (reg?.payment_status as 'paid' | 'unpaid') || 'unpaid',
        cricHeroesStatus: reg?.cricheroes_status || 'unverified',
        cricHeroesUrl: reg?.cricheroes_url,
        registrationStatus: reg?.registration_status || 'draft',
        isActive: p.is_active !== false,
      });

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
        registrationId: reg?.id,
        registrationStatus: reg?.registration_status || 'draft',
        paymentStatus: reg?.payment_status || 'unpaid',
        cricheroesStatus: reg?.cricheroes_status || 'unverified',
        cricheroesUrl: reg?.cricheroes_url || null,
        cricheroesMobile: reg?.cricheroes_registered_mobile || null,
        mobile: p.mobile || null,
        isAuctionEligible: reg?.is_auction_eligible ?? false,
        isActive: p.is_active !== false,
        hasSkillProfile: Boolean(skill),
        hasRegistration: Boolean(reg),
        yearOverride: reg?.year_override || null,
        yearOverrideReason: reg?.year_override_reason || null,
        eligibilityReasons: eligibilityBreakdown.missingRequirements,
        skillDetails: {
          battingStyle: skill?.batting_style || null,
          bowlingStyle: skill?.bowling_style || null,
          battingOrder: skill?.batting_order || null,
          isWk: Boolean(skill?.is_wicket_keeper),
        },
        stats: parseCareerStats(skill?.experience_description),
      };
    });

    // 3. Map pending role-assigned accounts that have not created players record yet
    const existingPlayerIds = new Set(parsedDbPlayers.map((p) => p.id));
    const pendingPlayers: Player[] = [];

    if (roleAssignedUsers) {
      for (const rau of roleAssignedUsers) {
        const u = (rau as any).users;
        if (u && !existingPlayerIds.has(u.id)) {
          pendingPlayers.push({
            id: u.id,
            rollNumber: 'PENDING',
            fullName: u.full_name || u.email?.split('@')[0] || 'Registered Player',
            photoUrl: '/placeholder.svg',
            course: 'UG',
            program: 'BTECH',
            branch: 'PENDING',
            yearOfStudy: 1,
            isLateral: false,
            bucket: 'B1',
            playerType: 'All-rounder',
            basePrice: 100,
            status: 'UNDER_REVIEW',
            registeredAt: u.created_at || new Date().toISOString(),
            cricheroesVerified: false,
            registrationStatus: 'pending_profile',
            paymentStatus: 'unpaid',
            cricheroesStatus: 'unverified',
            isAuctionEligible: false,
            isActive: true,
            hasSkillProfile: false,
            hasRegistration: false,
            eligibilityReasons: [
              'Student has not completed personal profile or registration at /player/registration',
            ],
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
          });
        }
      }
    }

    return [...pendingPlayers, ...parsedDbPlayers];
  } catch {
    return [];
  }
}
