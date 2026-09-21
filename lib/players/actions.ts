'use server';

// =============================================================================
// ACC Auction Portal — Player Server Actions
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requirePlayer } from '@/lib/permissions/guards';
import { parseRollNumber, calculateAcademicYear, deriveBucket } from '@/domain/academic';
import { validateSkills, derivePlayerType } from '@/domain/players';
import { playerProfileSchema, playerRegistrationSchema, playerSkillSchema } from './validation';
import type {
  PlayerProfileInput,
  PlayerRegistrationInput,
  PlayerSkillInput,
  PlayerActionResult,
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

    revalidatePath('/player');
    return { success: true, data: skillProfile as DbPlayerSkillProfile };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    };
  }
}
