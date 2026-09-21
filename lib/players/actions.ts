'use server';

// =============================================================================
// ACC Auction Portal — Player Server Actions
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePlayer, requireAdmin } from '@/lib/permissions/guards';
import { parseRollNumber, calculateAcademicYear, deriveBucket } from '@/domain/academic';
import { validateSkills, derivePlayerType } from '@/domain/players';
import {
  playerProfileSchema,
  playerRegistrationSchema,
  playerSkillSchema,
  adminCreatePlayerSchema,
} from './validation';
import type {
  PlayerProfileInput,
  PlayerRegistrationInput,
  PlayerSkillInput,
  PlayerCareerStats,
  PlayerActionResult,
  AdminCreatePlayerInput,
  AdminDeletePlayerResult,
} from './types';
import type { DbPlayer, DbPlayerSeasonRegistration, DbPlayerSkillProfile } from '@/lib/db/types';

/**
 * Server action to create or update the permanent player profile.
 * Player ID is strictly derived from the authenticated user (auth.uid()).
 */
export async function savePlayerProfileAction(
  input: PlayerProfileInput
): Promise<PlayerActionResult<DbPlayer>> {
  try {
    const permContext = await requirePlayer();
    const userId = permContext.user.id;

    const validation = playerProfileSchema.safeParse(input);
    if (!validation.success) {
      return {
        success: false,
        error: validation.error.issues[0]?.message || 'Invalid profile information',
      };
    }

    const { full_name, roll_number, mobile, photo_url } = validation.data;

    // Academic roll number sanity check
    const parsedRoll = parseRollNumber(roll_number);
    if (!parsedRoll.isValid) {
      return {
        success: false,
        error: parsedRoll.error || 'Invalid roll number format',
      };
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from('players')
      .upsert(
        {
          id: userId,
          full_name,
          roll_number: parsedRoll.rawRollNumber,
          mobile,
          photo_url: photo_url || null,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      )
      .select('*')
      .single();

    if (error) {
      // Friendly message for roll number collision
      if (error.code === '23505' && error.message.includes('roll_number')) {
        return {
          success: false,
          error: 'This roll number is already registered by another student.',
        };
      }
      return {
        success: false,
        error: 'Unable to save profile details. Please verify your information.',
      };
    }

    revalidatePath('/player');
    return { success: true, data: data as DbPlayer };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    };
  }
}

/**
 * Server action to register the authenticated player for the active season.
 * Prevents duplicate season registrations and derives bucket automatically.
 */
export async function registerPlayerSeasonAction(
  input: PlayerRegistrationInput
): Promise<PlayerActionResult<DbPlayerSeasonRegistration>> {
  try {
    const permContext = await requirePlayer();
    const userId = permContext.user.id;
    const activeSeason = permContext.activeSeason;

    if (!activeSeason) {
      return {
        success: false,
        error: 'There is no active season open for registration.',
      };
    }

    const validation = playerRegistrationSchema.safeParse(input);
    if (!validation.success) {
      return {
        success: false,
        error: validation.error.issues[0]?.message || 'Invalid registration information',
      };
    }

    const { roll_number, base_price, cricheroes_url, cricheroes_registered_mobile } =
      validation.data;

    // 1. Authoritative academic derivation
    const parsedRoll = parseRollNumber(roll_number);
    if (!parsedRoll.isValid || !parsedRoll.programme || !parsedRoll.admissionYear) {
      return {
        success: false,
        error: parsedRoll.error || 'Could not parse roll number for academic derivation',
      };
    }

    const calculatedYear = calculateAcademicYear(
      parsedRoll.admissionYear,
      parsedRoll.programme,
      new Date()
    );

    const derivedPlayerBucket = deriveBucket(parsedRoll.programme, calculatedYear);

    const supabase = await createClient();

    // 2. Ensure player permanent profile exists
    const { data: existingPlayer } = await supabase
      .from('players')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (!existingPlayer) {
      return {
        success: false,
        error: 'Please complete your personal profile details before registering for the season.',
      };
    }

    // 3. Check for existing registration in this season
    const { data: existingRegistration } = await supabase
      .from('player_season_registrations')
      .select('id, registration_status')
      .eq('player_id', userId)
      .eq('season_id', activeSeason.id)
      .maybeSingle();

    if (existingRegistration) {
      return {
        success: false,
        error: 'You have already submitted a registration for this season.',
      };
    }

    // 4. Insert season registration
    const { data: registration, error: insertError } = await supabase
      .from('player_season_registrations')
      .insert({
        player_id: userId,
        season_id: activeSeason.id,
        registration_status: 'draft',
        programme: parsedRoll.programme,
        academic_year: calculatedYear,
        branch: parsedRoll.branchName || null,
        bucket: derivedPlayerBucket,
        base_price,
        cricheroes_url: cricheroes_url || null,
        cricheroes_registered_mobile: cricheroes_registered_mobile || null,
        cricheroes_status: 'unverified',
        payment_status: 'unpaid',
        is_auction_eligible: false,
      })
      .select('*')
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        return {
          success: false,
          error: 'A registration for this player and season already exists.',
        };
      }
      return {
        success: false,
        error: 'Could not complete season registration. Please try again.',
      };
    }

    revalidatePath('/player');
    return { success: true, data: registration as DbPlayerSeasonRegistration };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    };
  }
}

/**
 * Server action to create or update a player's skill profile questionnaire.
 * Validates fielder-only mutual exclusion and computes derived_player_type.
 */
export async function savePlayerSkillProfileAction(
  registrationId: string,
  input: PlayerSkillInput
): Promise<PlayerActionResult<DbPlayerSkillProfile>> {
  try {
    const permContext = await requirePlayer();
    const userId = permContext.user.id;

    // 1. Validate questionnaire input
    const validation = playerSkillSchema.safeParse(input);
    if (!validation.success) {
      return {
        success: false,
        error: validation.error.issues[0]?.message || 'Invalid skill profile details',
      };
    }

    const skillValidation = validateSkills(validation.data);
    if (!skillValidation.isValid || !skillValidation.derivedPlayerType) {
      return {
        success: false,
        error: skillValidation.error || 'Invalid skill selection',
      };
    }

    const supabase = await createClient();

    // 2. Authoritative ownership check: verify registration belongs to this authenticated user
    const { data: registration, error: regError } = await supabase
      .from('player_season_registrations')
      .select('id, player_id')
      .eq('id', registrationId)
      .maybeSingle();

    if (regError || !registration || registration.player_id !== userId) {
      return {
        success: false,
        error: 'Unauthorized. You can only update your own skill profile.',
      };
    }

    // 3. Upsert skill profile
    const {
      is_batter,
      batting_style,
      batting_order,
      is_bowler,
      bowling_style,
      is_wicket_keeper,
      is_fielder_only,
      fielding_position,
      experience_years,
      experience_description,
    } = validation.data;

    const { data: skillProfile, error: upsertError } = await supabase
      .from('player_skill_profiles')
      .upsert(
        {
          registration_id: registrationId,
          is_batter,
          batting_style: is_batter ? batting_style || null : null,
          batting_order: is_batter ? batting_order || null : null,
          is_bowler,
          bowling_style: is_bowler ? bowling_style || null : null,
          is_wicket_keeper,
          is_fielder_only,
          derived_player_type: skillValidation.derivedPlayerType,
          fielding_position: fielding_position || null,
          experience_years: experience_years ?? null,
          experience_description: experience_description || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'registration_id' }
      )
      .select('*')
      .single();

    if (upsertError) {
      return {
        success: false,
        error: 'Unable to save skill profile. Please verify your selections.',
      };
    }

    // 4. Automatically evaluate & activate auction eligibility upon completion of profile + registration + skill questionnaire
    await supabase
      .from('player_season_registrations')
      .update({
        registration_status: 'eligible',
        is_auction_eligible: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', registrationId);

    revalidatePath('/player');
    revalidatePath('/player/registration');
    revalidatePath('/player/profile');
    revalidatePath('/franchise/players');
    revalidatePath('/admin/players');

    return { success: true, data: skillProfile as DbPlayerSkillProfile };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    };
  }
}

/**
 * Server action for a player to update their own career statistics.
 * The statistics are serialized into JSON and stored in the native
 * player_skill_profiles.experience_description column without modifying schema.
 */
export async function savePlayerCareerStatsAction(
  registrationId: string,
  stats: PlayerCareerStats
): Promise<PlayerActionResult<PlayerCareerStats>> {
  try {
    const permContext = await requirePlayer();
    const userId = permContext.user.id;
    const supabase = await createClient();

    // 1. Authoritative ownership check: verify registration belongs to this authenticated user
    const { data: registration, error: regError } = await supabase
      .from('player_season_registrations')
      .select('id, player_id')
      .eq('id', registrationId)
      .maybeSingle();

    if (regError || !registration || registration.player_id !== userId) {
      return {
        success: false,
        error: 'Unauthorized. You can only update your own career statistics.',
      };
    }

    // Sanitize stats object
    const sanitizedStats: PlayerCareerStats = {
      matches: Math.max(0, Math.floor(Number(stats.matches) || 0)),
      runs: Math.max(0, Math.floor(Number(stats.runs) || 0)),
      battingAvg: Number((Number(stats.battingAvg) || 0).toFixed(2)),
      strikeRate: Number((Number(stats.strikeRate) || 0).toFixed(2)),
      highestScore: Math.max(0, Math.floor(Number(stats.highestScore) || 0)),
      wickets: Math.max(0, Math.floor(Number(stats.wickets) || 0)),
      bowlingAvg: Number((Number(stats.bowlingAvg) || 0).toFixed(2)),
      economy: Number((Number(stats.economy) || 0).toFixed(2)),
      catches: Math.max(0, Math.floor(Number(stats.catches) || 0)),
      stumpings: Math.max(0, Math.floor(Number(stats.stumpings) || 0)),
      notes: typeof stats.notes === 'string' ? stats.notes.slice(0, 500) : undefined,
    };

    const jsonString = JSON.stringify(sanitizedStats);
    const now = new Date().toISOString();

    // Check if skill profile exists
    const { data: existingProfile } = await supabase
      .from('player_skill_profiles')
      .select('registration_id')
      .eq('registration_id', registrationId)
      .maybeSingle();

    if (existingProfile) {
      const { error: updateError } = await supabase
        .from('player_skill_profiles')
        .update({
          experience_description: jsonString,
          updated_at: now,
        })
        .eq('registration_id', registrationId);

      if (updateError) {
        return { success: false, error: 'Failed to update career statistics.' };
      }
    } else {
      const { error: insertError } = await supabase
        .from('player_skill_profiles')
        .insert({
          registration_id: registrationId,
          is_batter: false,
          is_bowler: false,
          is_wicket_keeper: false,
          is_fielder_only: false,
          derived_player_type: 'all_rounder',
          experience_description: jsonString,
          updated_at: now,
        });

      if (insertError) {
        return { success: false, error: 'Failed to save career statistics.' };
      }
    }

    revalidatePath('/player');
    revalidatePath('/player/profile');
    revalidatePath('/franchise/players');
    revalidatePath('/admin/players');

    return { success: true, data: sanitizedStats };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    };
  }
}

/**
 * Privileged Admin Action to update any player's career statistics.
 * Guarded by requireAdmin() and uses createAdminClient().
 */
export async function adminSavePlayerCareerStatsAction(
  registrationId: string,
  stats: PlayerCareerStats
): Promise<PlayerActionResult<PlayerCareerStats>> {
  try {
    await requireAdmin();
    const adminClient = createAdminClient();

    // Verify registration exists
    const { data: registration, error: regError } = await adminClient
      .from('player_season_registrations')
      .select('id, player_id')
      .eq('id', registrationId)
      .maybeSingle();

    if (regError || !registration) {
      return { success: false, error: 'Player registration not found.' };
    }

    const sanitizedStats: PlayerCareerStats = {
      matches: Math.max(0, Math.floor(Number(stats.matches) || 0)),
      runs: Math.max(0, Math.floor(Number(stats.runs) || 0)),
      battingAvg: Number((Number(stats.battingAvg) || 0).toFixed(2)),
      strikeRate: Number((Number(stats.strikeRate) || 0).toFixed(2)),
      highestScore: Math.max(0, Math.floor(Number(stats.highestScore) || 0)),
      wickets: Math.max(0, Math.floor(Number(stats.wickets) || 0)),
      bowlingAvg: Number((Number(stats.bowlingAvg) || 0).toFixed(2)),
      economy: Number((Number(stats.economy) || 0).toFixed(2)),
      catches: Math.max(0, Math.floor(Number(stats.catches) || 0)),
      stumpings: Math.max(0, Math.floor(Number(stats.stumpings) || 0)),
      notes: typeof stats.notes === 'string' ? stats.notes.slice(0, 500) : undefined,
    };

    const jsonString = JSON.stringify(sanitizedStats);
    const now = new Date().toISOString();

    const { data: existingProfile } = await adminClient
      .from('player_skill_profiles')
      .select('registration_id')
      .eq('registration_id', registrationId)
      .maybeSingle();

    if (existingProfile) {
      const { error: updateError } = await adminClient
        .from('player_skill_profiles')
        .update({
          experience_description: jsonString,
          updated_at: now,
        })
        .eq('registration_id', registrationId);

      if (updateError) {
        return { success: false, error: 'Failed to update career statistics.' };
      }
    } else {
      const { error: insertError } = await adminClient
        .from('player_skill_profiles')
        .insert({
          registration_id: registrationId,
          is_batter: false,
          is_bowler: false,
          is_wicket_keeper: false,
          is_fielder_only: false,
          derived_player_type: 'all_rounder',
          experience_description: jsonString,
          updated_at: now,
        });

      if (insertError) {
        return { success: false, error: 'Failed to save career statistics.' };
      }
    }

    revalidatePath('/player');
    revalidatePath('/player/profile');
    revalidatePath('/players');
    revalidatePath('/admin/players');
    revalidatePath('/franchise/players');

    return { success: true, data: sanitizedStats };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    };
  }
}

/**
 * Privileged Admin Action to register a new player into the active season.
 * Validates roll number, derives academic year & bucket, creates player,
 * season registration, and initial skill profile.
 */
export async function adminCreatePlayerAction(
  input: AdminCreatePlayerInput
): Promise<PlayerActionResult<DbPlayer>> {
  try {
    const adminContext = await requireAdmin();
    const activeSeason = adminContext.activeSeason;

    if (!activeSeason) {
      return { success: false, error: 'No active season found for player registration.' };
    }

    const validation = adminCreatePlayerSchema.safeParse(input);
    if (!validation.success) {
      return {
        success: false,
        error: validation.error.issues[0]?.message || 'Invalid player information',
      };
    }

    const data = validation.data;

    // Academic roll number derivation
    const parsedRoll = parseRollNumber(data.roll_number);
    if (!parsedRoll.isValid || !parsedRoll.programme || !parsedRoll.admissionYear) {
      return {
        success: false,
        error: parsedRoll.error || 'Could not parse roll number for academic derivation',
      };
    }

    const calculatedYear = calculateAcademicYear(
      parsedRoll.admissionYear,
      parsedRoll.programme,
      new Date()
    );
    const derivedPlayerBucket = deriveBucket(parsedRoll.programme, calculatedYear);

    const adminClient = createAdminClient();

    // Check duplicate roll number
    const { data: existingPlayer } = await adminClient
      .from('players')
      .select('id, roll_number')
      .eq('roll_number', parsedRoll.rawRollNumber)
      .maybeSingle();

    if (existingPlayer) {
      return {
        success: false,
        error: `A player with roll number ${parsedRoll.rawRollNumber} already exists in the registry.`,
      };
    }

    // 1. Insert permanent player identity
    const { data: newPlayer, error: playerError } = await adminClient
      .from('players')
      .insert({
        roll_number: parsedRoll.rawRollNumber,
        full_name: data.full_name,
        mobile: data.mobile,
        photo_url: data.photo_url || null,
        is_active: true,
      })
      .select('*')
      .single();

    if (playerError || !newPlayer) {
      return {
        success: false,
        error: playerError?.message || 'Failed to create permanent player record.',
      };
    }

    // 2. Insert season registration
    const { data: newReg, error: regError } = await adminClient
      .from('player_season_registrations')
      .insert({
        player_id: newPlayer.id,
        season_id: activeSeason.id,
        registration_status: 'eligible',
        programme: parsedRoll.programme,
        academic_year: calculatedYear,
        branch: parsedRoll.branchName || null,
        bucket: derivedPlayerBucket,
        base_price: data.base_price || 100,
        cricheroes_url: data.cricheroes_url || null,
        payment_status: 'paid',
        is_auction_eligible: true,
      })
      .select('*')
      .single();

    if (regError || !newReg) {
      // Rollback inserted player
      await adminClient.from('players').delete().eq('id', newPlayer.id);
      return {
        success: false,
        error: regError?.message || 'Failed to register player for active season.',
      };
    }

    // 3. Insert skill profile
    const isBatter =
      data.player_type === 'batter' ||
      data.player_type === 'all_rounder' ||
      data.player_type === 'wicket_keeper_batter';
    const isBowler = data.player_type === 'bowler' || data.player_type === 'all_rounder';
    const isWk =
      data.player_type === 'wicket_keeper' || data.player_type === 'wicket_keeper_batter';

    await adminClient.from('player_skill_profiles').insert({
      registration_id: newReg.id,
      is_batter: isBatter,
      is_bowler: isBowler,
      is_wicket_keeper: isWk,
      is_fielder_only: data.player_type === 'fielder',
      derived_player_type: data.player_type,
      batting_style: data.batting_style || 'right_hand',
      bowling_style: data.bowling_style || null,
    });

    revalidatePath('/admin/players');
    revalidatePath('/admin');
    revalidatePath('/players');

    return { success: true, data: newPlayer as DbPlayer };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to create player',
    };
  }
}

/**
 * Privileged Admin Action to delete or deactivate a player.
 * Protects immutable auction history:
 * - If player has auction lots or events, safely deactivates player instead of destroying logs.
 * - If player has never participated in an auction, permanently removes records.
 */
export async function adminDeletePlayerAction(
  playerId: string
): Promise<PlayerActionResult<AdminDeletePlayerResult>> {
  try {
    await requireAdmin();
    const adminClient = createAdminClient();

    // 1. Fetch targeted player
    const { data: player, error: fetchErr } = await adminClient
      .from('players')
      .select('id, full_name, roll_number')
      .eq('id', playerId)
      .maybeSingle();

    if (fetchErr || !player) {
      return { success: false, error: 'Player not found.' };
    }

    // 2. Fetch registrations
    const { data: registrations } = await adminClient
      .from('player_season_registrations')
      .select('id')
      .eq('player_id', playerId);

    const regIds = registrations?.map((r) => r.id) || [];

    // 3. Inspect auction participation
    let hasAuctionHistory = false;
    if (regIds.length > 0) {
      const { count: lotCount } = await adminClient
        .from('auction_lots')
        .select('id', { count: 'exact', head: true })
        .in('registration_id', regIds);

      if (lotCount && lotCount > 0) {
        hasAuctionHistory = true;
      }
    }

    // 4. Protect referential integrity & auction history
    if (hasAuctionHistory) {
      // Deactivate without deleting historical records
      await adminClient
        .from('players')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', playerId);

      await adminClient
        .from('player_season_registrations')
        .update({
          registration_status: 'ineligible',
          is_auction_eligible: false,
          updated_at: new Date().toISOString(),
        })
        .eq('player_id', playerId);

      revalidatePath('/admin/players');
      revalidatePath('/admin');
      revalidatePath('/players');

      return {
        success: true,
        mode: 'deactivated',
        data: {
          playerId,
          mode: 'deactivated',
          message: `Player ${player.full_name} (${player.roll_number}) has auction records and has been deactivated. Historical auction logs were preserved.`,
        },
      };
    }

    // 5. Clean delete for unauctioned player (Case A)
    if (regIds.length > 0) {
      await adminClient.from('player_skill_profiles').delete().in('registration_id', regIds);
      await adminClient.from('franchise_referrals').delete().in('registration_id', regIds);
      await adminClient.from('franchise_members').update({ player_registration_id: null }).in('player_registration_id', regIds);
      await adminClient.from('player_season_registrations').delete().eq('player_id', playerId);
    }

    const { error: deleteErr } = await adminClient.from('players').delete().eq('id', playerId);
    if (deleteErr) {
      return {
        success: false,
        error: `Could not delete player: ${deleteErr.message}`,
      };
    }

    revalidatePath('/admin/players');
    revalidatePath('/admin');
    revalidatePath('/players');

    return {
      success: true,
      mode: 'deleted',
      data: {
        playerId,
        mode: 'deleted',
        message: `Player ${player.full_name} (${player.roll_number}) was successfully deleted.`,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to delete player',
    };
  }
}
