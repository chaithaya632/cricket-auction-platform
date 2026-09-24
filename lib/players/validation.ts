// =============================================================================
// ACC Auction Portal — Player Validation Schemas
// =============================================================================

import { z } from 'zod';
import { BASE_PRICE_LADDER } from '@/lib/constants';

const mobilePattern = /^[6-9]\d{9}$/;

const isValidPhotoUrl = (val: string | null | undefined): boolean => {
  if (!val || typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    try {
      new URL(trimmed);
      return true;
    } catch {
      return false;
    }
  }
  // Disallow base64 data URIs from database persistence to prevent row size bloat
  return false;
};

export const playerProfileSchema = z.object({
  full_name: z.string().trim().min(2, 'Full name must be at least 2 characters'),
  roll_number: z.string().trim().min(1, 'Roll number is required').max(50, 'Roll number must not exceed 50 characters'),
  mobile: z
    .string()
    .trim()
    .regex(mobilePattern, 'Mobile must be a valid 10-digit Indian phone number starting with 6-9'),
  photo_url: z
    .string({ error: 'Player photograph is required.' })
    .trim()
    .min(1, 'Player photograph is required.')
    .refine(isValidPhotoUrl, 'Photo must be a valid HTTP or HTTPS storage/web URL'),
});

export const playerRegistrationSchema = z.object({
  roll_number: z.string().trim().min(1, 'Roll number is required').max(50, 'Roll number must not exceed 50 characters'),
  programme: z
    .enum(['btech_regular', 'btech_lateral', 'diploma', 'pg'])
    .optional()
    .default('btech_regular'),
  academic_year: z.coerce.number().int().min(1).max(6).optional().default(1),
  branch: z.string().trim().max(50).nullable().optional(),
  base_price: z
    .number()
    .int()
    .refine(
      (val) => (BASE_PRICE_LADDER as readonly number[]).includes(val),
      `Base price must be one of the permitted tiers: ${BASE_PRICE_LADDER.join(', ')}`
    ),
  cricheroes_url: z
    .string()
    .trim()
    .url('CricHeroes profile link must be a valid URL')
    .optional()
    .or(z.literal('')),
  cricheroes_registered_mobile: z
    .string()
    .trim()
    .regex(mobilePattern, 'CricHeroes mobile must be a valid 10-digit phone number')
    .optional()
    .or(z.literal('')),
});

export const playerSkillSchema = z.object({
  is_batter: z.boolean(),
  batting_style: z.enum(['right_hand', 'left_hand']).nullable().optional(),
  batting_order: z.enum(['opener', 'top_order', 'middle_order', 'lower_order']).nullable().optional(),
  is_bowler: z.boolean(),
  bowling_style: z
    .enum([
      'right_arm_fast',
      'right_arm_medium',
      'left_arm_fast',
      'left_arm_medium',
      'right_arm_off_spin',
      'right_arm_leg_spin',
      'left_arm_orthodox',
      'left_arm_chinaman',
    ])
    .nullable()
    .optional(),
  is_wicket_keeper: z.boolean(),
  is_fielder_only: z.boolean(),
  fielding_position: z.string().trim().max(50).nullable().optional(),
  experience_years: z.number().int().min(0).max(30).nullable().optional(),
  experience_description: z.string().trim().max(500).nullable().optional(),
});

export const adminCreatePlayerSchema = z.object({
  full_name: z.string().trim().min(2, 'Full name must be at least 2 characters'),
  roll_number: z.string().trim().min(1, 'Roll number is required').max(50, 'Roll number must not exceed 50 characters'),
  mobile: z
    .string()
    .trim()
    .regex(mobilePattern, 'Mobile must be a valid 10-digit phone number starting with 6-9'),
  photo_url: z
    .string()
    .trim()
    .refine((val) => !val || isValidPhotoUrl(val), 'Photo must be a valid HTTP or HTTPS storage/web URL')
    .or(z.literal(''))
    .nullable()
    .optional(),
  programme: z
    .enum(['btech_regular', 'btech_lateral', 'diploma', 'pg'])
    .optional()
    .default('btech_regular'),
  academic_year: z.coerce.number().int().min(1).max(6).optional().default(1),
  branch: z.string().trim().max(50).nullable().optional(),
  base_price: z
    .number()
    .int()
    .refine(
      (val) => (BASE_PRICE_LADDER as readonly number[]).includes(val),
      `Base price must be one of the permitted tiers: ${BASE_PRICE_LADDER.join(', ')}`
    )
    .default(100),
  player_type: z
    .enum(['batter', 'bowler', 'all_rounder', 'wicket_keeper', 'wicket_keeper_batter', 'fielder'])
    .default('all_rounder'),
  batting_style: z.enum(['right_hand', 'left_hand']).nullable().optional().default('right_hand'),
  bowling_style: z.string().nullable().optional(),
  cricheroes_url: z.string().trim().url('CricHeroes URL must be valid').or(z.literal('')).nullable().optional(),
});
