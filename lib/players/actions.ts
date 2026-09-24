'use server';

// =============================================================================
// ACC Auction Portal — Player Server Actions
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePlayer, requireAdmin } from '@/lib/permissions/guards';
import { parseRollNumber, calculateAcademicYear, deriveBucket } from '@/domain/academic';
import { writeAuditLog } from '@/lib/audit/logger';
import { validateSkills, derivePlayerType } from '@/domain/players';
import { evaluatePlayerEligibility } from '@/domain/players/eligibility';
import type { CricHeroesStatus, RegistrationStatus } from '@/lib/constants';
import {
  playerProfileSchema,
  playerRegistrationSchema,
  playerSkillSchema,
  adminCreatePlayerSchema,
} from './validation';
import {
  uploadPlayerPhoto,
  ALLOWED_PHOTO_MIME_TYPES,
  MAX_PHOTO_FILE_SIZE,
} from '@/lib/storage';
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

    const {
      roll_number,
      base_price,
      cricheroes_url,
      cricheroes_registered_mobile,
      programme: inputProgramme,
      academic_year: inputYear,
      branch: inputBranch,
    } = validation.data;

    // 1. Authoritative academic derivation from explicit input or parsed metadata
    const parsedRoll = parseRollNumber(roll_number);
    if (!parsedRoll.isValid) {
      return {
        success: false,
        error: parsedRoll.error || 'Invalid roll number format',
      };
    }

    const programme = inputProgramme || parsedRoll.programme || 'btech_regular';
    const academicYear =
      inputYear ||
      (parsedRoll.admissionYear
        ? calculateAcademicYear(parsedRoll.admissionYear, programme, new Date())
        : 1);
    const branch = inputBranch || parsedRoll.branchName || null;
    const derivedPlayerBucket = deriveBucket(programme, academicYear);

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
      .select('id, registration_status, is_auction_eligible')
      .eq('player_id', userId)
      .eq('season_id', activeSeason.id)
      .maybeSingle();

    if (existingRegistration) {
      if (
        existingRegistration.is_auction_eligible ||
        existingRegistration.registration_status === 'eligible'
      ) {
        return {
          success: false,
          error: 'Your registration is approved and locked for the tournament auction. Modifications are not allowed.',
        };
      }

      // Update existing registration details
      const { data: updatedReg, error: updateError } = await supabase
        .from('player_season_registrations')
        .update({
          programme,
          academic_year: academicYear,
          branch,
          bucket: derivedPlayerBucket,
          base_price,
          cricheroes_url: cricheroes_url || null,
          cricheroes_registered_mobile: cricheroes_registered_mobile || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingRegistration.id)
        .select('*')
        .single();

      if (updateError) {
        return {
          success: false,
          error: 'Could not update season registration details. Please try again.',
        };
      }

      revalidatePath('/player');
      revalidatePath('/player/registration');
      return { success: true, data: updatedReg as DbPlayerSeasonRegistration };
    }

    // 4. Insert season registration
    const { data: registration, error: insertError } = await supabase
      .from('player_season_registrations')
      .insert({
        player_id: userId,
        season_id: activeSeason.id,
        registration_status: 'draft',
        programme,
        academic_year: academicYear,
        branch,
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
      .select('id, player_id, is_auction_eligible, registration_status')
      .eq('id', registrationId)
      .maybeSingle();

    if (regError || !registration || registration.player_id !== userId) {
      return {
        success: false,
        error: 'Unauthorized. You can only update your own skill profile.',
      };
    }

    if (registration.is_auction_eligible || registration.registration_status === 'eligible') {
      return {
        success: false,
        error: 'Your registration is approved and locked for the tournament auction. Skill questionnaire cannot be modified.',
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

    // 4. Update registration status to pending_verification (requires admin approval, payment & CricHeroes verification)
    await supabase
      .from('player_season_registrations')
      .update({
        registration_status: 'pending_verification',
        is_auction_eligible: false,
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
    const targetSeasonId = activeSeason?.id || '00000000-0000-0000-0000-000000000001';

    const validation = adminCreatePlayerSchema.safeParse(input);
    if (!validation.success) {
      const messages = validation.error.issues.map((i) => i.message).filter(Boolean);
      return {
        success: false,
        error: messages.length > 0 ? messages.join(', ') : 'Invalid player information',
      };
    }

    const data = validation.data;

    // Academic roll number & explicit academic inputs
    const parsedRoll = parseRollNumber(data.roll_number);
    if (!parsedRoll.isValid) {
      return {
        success: false,
        error: parsedRoll.error || 'Invalid roll number format',
      };
    }

    const programme = data.programme || parsedRoll.programme || 'btech_regular';
    const academicYear =
      data.academic_year ||
      (parsedRoll.admissionYear
        ? calculateAcademicYear(parsedRoll.admissionYear, programme, new Date())
        : 1);
    const branch = data.branch || parsedRoll.branchName || null;
    const derivedPlayerBucket = deriveBucket(programme, academicYear);

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
        season_id: targetSeasonId,
        registration_status: 'eligible',
        programme,
        academic_year: academicYear,
        branch,
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

/**
 * Super Admin Action to override a student's academic year (e.g. detained students, §4.1).
 * Re-derives the auction bucket and writes an entry to audit_logs.
 */
export async function adminOverridePlayerAcademicYearAction(
  registrationId: string,
  newAcademicYear: number,
  reason: string
): Promise<PlayerActionResult<{ registrationId: string; newBucket: string }>> {
  try {
    const adminContext = await requireAdmin();
    if (!adminContext.isSuperAdmin) {
      return { success: false, error: 'Unauthorized: Only Super Admin can override student academic years (§4.1).' };
    }

    if (!reason || reason.trim().length < 5) {
      return { success: false, error: 'A valid reason of at least 5 characters is required for year override.' };
    }

    if (newAcademicYear < 1 || newAcademicYear > 6) {
      return { success: false, error: 'Academic year must be between 1 and 6.' };
    }

    const adminClient = createAdminClient();

    // 1. Fetch current registration
    const { data: reg, error: fetchErr } = await adminClient
      .from('player_season_registrations')
      .select('id, player_id, season_id, programme, academic_year, bucket')
      .eq('id', registrationId)
      .single();

    if (fetchErr || !reg) {
      return { success: false, error: 'Player registration not found.' };
    }

    // 2. Re-derive bucket based on programme and overridden year
    const newBucket = deriveBucket(reg.programme as any, newAcademicYear);

    // 3. Update registration record
    const { error: updateErr } = await adminClient
      .from('player_season_registrations')
      .update({
        year_override: newAcademicYear,
        year_override_reason: reason.trim(),
        academic_year: newAcademicYear,
        bucket: newBucket,
        updated_at: new Date().toISOString(),
      })
      .eq('id', registrationId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    // 4. Record in audit_logs
    await writeAuditLog(
      {
        seasonId: reg.season_id,
        actorUserId: adminContext.user.id,
        action: 'YEAR_OVERRIDE',
        entityType: 'player_season_registration',
        entityId: registrationId,
        reason: reason.trim(),
        metadata: {
          previous_year: reg.academic_year,
          new_year: newAcademicYear,
          previous_bucket: reg.bucket,
          new_bucket: newBucket,
        },
      },
      adminClient
    );

    revalidatePath('/admin/players');
    revalidatePath('/admin');
    revalidatePath('/players');

    return { success: true, data: { registrationId, newBucket } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to override academic year',
    };
  }
}

/**
 * Internal helper to evaluate and synchronize a player's auction eligibility
 * based on the authoritative rules: profile complete, academic data valid,
 * skills submitted, payment verified, CricHeroes verified, and admin approval granted.
 */
async function syncPlayerEligibility(
  adminClient: any,
  registrationId: string
): Promise<{ isEligible: boolean; missingRequirements: string[] }> {
  const { data: reg, error } = await adminClient
    .from('player_season_registrations')
    .select(`
      id,
      player_id,
      season_id,
      programme,
      academic_year,
      branch,
      bucket,
      registration_status,
      payment_status,
      cricheroes_status,
      cricheroes_url,
      players (
        id,
        full_name,
        roll_number,
        mobile,
        photo_url,
        is_active
      ),
      player_skill_profiles (
        id
      )
    `)
    .eq('id', registrationId)
    .single();

  if (error || !reg) {
    return { isEligible: false, missingRequirements: ['Registration record not found'] };
  }

  const p = Array.isArray(reg.players) ? reg.players[0] : reg.players;
  const skills = Array.isArray(reg.player_skill_profiles)
    ? reg.player_skill_profiles[0]
    : reg.player_skill_profiles;

  const breakdown = evaluatePlayerEligibility({
    hasProfile: Boolean(p),
    fullName: p?.full_name,
    rollNumber: p?.roll_number,
    mobile: p?.mobile,
    photoUrl: p?.photo_url,
    hasRegistration: true,
    programme: reg.programme,
    academicYear: reg.academic_year,
    branch: reg.branch,
    bucket: reg.bucket,
    hasSkillProfile: Boolean(skills),
    paymentStatus: (reg.payment_status as 'paid' | 'unpaid') || 'unpaid',
    cricHeroesStatus: reg.cricheroes_status || 'unverified',
    cricHeroesUrl: reg.cricheroes_url,
    registrationStatus: reg.registration_status,
    isActive: p?.is_active !== false,
  });

  const nextRegStatus = breakdown.isEligible
    ? 'eligible'
    : reg.registration_status === 'ineligible'
    ? 'ineligible'
    : reg.registration_status === 'draft'
    ? 'draft'
    : 'pending_verification';

  await adminClient
    .from('player_season_registrations')
    .update({
      is_auction_eligible: breakdown.isEligible,
      registration_status: nextRegStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', registrationId);

  return {
    isEligible: breakdown.isEligible,
    missingRequirements: breakdown.missingRequirements,
  };
}

/**
 * Super Admin Action to verify payment and toggle auction eligibility (§5.2, §18).
 * Unpaid players remain registered and visible, but cannot enter the auction.
 * Eligibility is evaluated against all criteria (not blindly granted).
 */
export async function adminSetPlayerPaymentAction(
  registrationId: string,
  paymentStatus: 'paid' | 'unpaid'
): Promise<PlayerActionResult<{ registrationId: string; paymentStatus: string; isEligible: boolean; missingRequirements: string[] }>> {
  try {
    const adminContext = await requireAdmin();
    if (!adminContext.isSuperAdmin) {
      return { success: false, error: 'Unauthorized: Only Super Admin can verify payment status.' };
    }

    const adminClient = createAdminClient();

    const { error: updateErr } = await adminClient
      .from('player_season_registrations')
      .update({
        payment_status: paymentStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', registrationId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    // Re-evaluate eligibility with payment updated
    const syncResult = await syncPlayerEligibility(adminClient, registrationId);

    revalidatePath('/admin/players');
    revalidatePath('/admin/queue');
    revalidatePath('/admin');
    revalidatePath('/players');

    return {
      success: true,
      data: {
        registrationId,
        paymentStatus,
        isEligible: syncResult.isEligible,
        missingRequirements: syncResult.missingRequirements,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update payment status',
    };
  }
}

/**
 * Super Admin / Operator Action to verify or update a player's CricHeroes status (§13).
 */
export async function adminSetCricHeroesStatusAction(
  registrationId: string,
  cricheroesStatus: CricHeroesStatus
): Promise<PlayerActionResult<{ registrationId: string; cricheroesStatus: CricHeroesStatus; isEligible: boolean }>> {
  try {
    await requireAdmin();
    const adminClient = createAdminClient();

    const { error: updateErr } = await adminClient
      .from('player_season_registrations')
      .update({
        cricheroes_status: cricheroesStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', registrationId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    const syncResult = await syncPlayerEligibility(adminClient, registrationId);

    revalidatePath('/admin/players');
    revalidatePath('/admin/queue');
    revalidatePath('/admin');
    revalidatePath('/players');

    return {
      success: true,
      data: {
        registrationId,
        cricheroesStatus,
        isEligible: syncResult.isEligible,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update CricHeroes status',
    };
  }
}

/**
 * Super Admin Action to block or unblock a player account (§13).
 * Blocked players cannot become auction eligible or enter the queue.
 */
export async function adminTogglePlayerBlockAction(
  playerId: string,
  isBlocked: boolean,
  reason?: string
): Promise<PlayerActionResult<{ playerId: string; isBlocked: boolean }>> {
  try {
    const adminContext = await requireAdmin();
    if (!adminContext.isSuperAdmin) {
      return { success: false, error: 'Unauthorized: Only Super Admin can block or unblock players.' };
    }

    const adminClient = createAdminClient();
    const now = new Date().toISOString();

    // 1. Update player active state
    const { error: playerErr } = await adminClient
      .from('players')
      .update({
        is_active: !isBlocked,
        updated_at: now,
      })
      .eq('id', playerId);

    if (playerErr) {
      return { success: false, error: playerErr.message };
    }

    // 2. If blocked, immediately revoke auction eligibility on all active registrations
    if (isBlocked) {
      await adminClient
        .from('player_season_registrations')
        .update({
          is_auction_eligible: false,
          updated_at: now,
        })
        .eq('player_id', playerId);
    } else {
      // If unblocked, re-sync eligibility for this player's registrations
      const { data: regs } = await adminClient
        .from('player_season_registrations')
        .select('id')
        .eq('player_id', playerId);

      if (regs) {
        for (const reg of regs) {
          await syncPlayerEligibility(adminClient, reg.id);
        }
      }
    }

    // 3. Write audit log
    await writeAuditLog(
      {
        seasonId: adminContext.activeSeason?.id || '00000000-0000-0000-0000-000000000001',
        actorUserId: adminContext.user.id,
        action: isBlocked ? 'PLAYER_BLOCKED' : 'PLAYER_UNBLOCKED',
        entityType: 'player',
        entityId: playerId,
        reason: reason?.trim() || (isBlocked ? 'Blocked by Super Admin' : 'Unblocked by Super Admin'),
        metadata: { isBlocked },
      },
      adminClient
    );

    revalidatePath('/admin/players');
    revalidatePath('/admin/queue');
    revalidatePath('/admin');
    revalidatePath('/players');

    return { success: true, data: { playerId, isBlocked } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update player block state',
    };
  }
}

/**
 * Super Admin / Operator Action to review and approve/reject a player's season registration.
 * If all criteria are met upon approval, marks the player as auction eligible.
 */
export async function adminApprovePlayerRegistrationAction(
  registrationId: string,
  decision: 'approved' | 'rejected' | 'under_review'
): Promise<PlayerActionResult<{ registrationId: string; registrationStatus: string; isEligible: boolean; missingRequirements: string[] }>> {
  try {
    await requireAdmin();
    const adminClient = createAdminClient();
    const now = new Date().toISOString();

    if (decision === 'rejected') {
      await adminClient
        .from('player_season_registrations')
        .update({
          registration_status: 'ineligible',
          is_auction_eligible: false,
          updated_at: now,
        })
        .eq('id', registrationId);

      revalidatePath('/admin/players');
      revalidatePath('/admin/queue');

      return {
        success: true,
        data: {
          registrationId,
          registrationStatus: 'ineligible',
          isEligible: false,
          missingRequirements: ['Registration rejected by administrator'],
        },
      };
    }

    if (decision === 'under_review') {
      await adminClient
        .from('player_season_registrations')
        .update({
          registration_status: 'pending_verification',
          is_auction_eligible: false,
          updated_at: now,
        })
        .eq('id', registrationId);

      const syncResult = await syncPlayerEligibility(adminClient, registrationId);
      revalidatePath('/admin/players');
      revalidatePath('/admin/queue');

      return {
        success: true,
        data: {
          registrationId,
          registrationStatus: 'pending_verification',
          isEligible: syncResult.isEligible,
          missingRequirements: syncResult.missingRequirements,
        },
      };
    }

    // decision === 'approved': set to eligible status provisionally, then re-evaluate all requirements
    await adminClient
      .from('player_season_registrations')
      .update({
        registration_status: 'eligible',
        updated_at: now,
      })
      .eq('id', registrationId);

    const syncResult = await syncPlayerEligibility(adminClient, registrationId);

    revalidatePath('/admin/players');
    revalidatePath('/admin/queue');
    revalidatePath('/admin');
    revalidatePath('/players');

    return {
      success: true,
      data: {
        registrationId,
        registrationStatus: syncResult.isEligible ? 'eligible' : 'pending_verification',
        isEligible: syncResult.isEligible,
        missingRequirements: syncResult.missingRequirements,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update player registration status',
    };
  }
}

/**
 * Server action for uploading player photographs directly to Supabase Storage.
 * Restricts upload authority to authenticated players for their own profile.
 */
export async function uploadPlayerPhotoAction(
  formData: FormData
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const permContext = await requirePlayer();
    const userId = permContext.user.id;

    const file = formData.get('file') as File | null;
    if (!file) {
      return { success: false, error: 'No photo file provided.' };
    }

    if (!ALLOWED_PHOTO_MIME_TYPES.includes(file.type)) {
      return { success: false, error: 'Invalid photo format. Accepted formats: JPG, PNG, WebP.' };
    }

    if (file.size > MAX_PHOTO_FILE_SIZE) {
      return { success: false, error: 'Photo file size exceeds maximum 5 MB limit.' };
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await uploadPlayerPhoto(userId, buffer, file.type);
    if (!result.success) {
      return { success: false, error: result.error || 'Failed to upload photo to storage.' };
    }

    return { success: true, url: result.url };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to upload photo.' };
  }
}
