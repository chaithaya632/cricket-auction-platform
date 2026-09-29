// =============================================================================
// ACC Match System — Input Validation & Normalization Schemas
// =============================================================================

import { z } from 'zod';

/**
 * Normalizes a YouTube URL or video ID into a clean 11-character video ID.
 * Returns null if input is empty or invalid.
 */
export function normalizeYouTubeVideoId(input: string | null | undefined): string | null {
  if (!input || !input.trim()) return null;
  const trimmed = input.trim();

  // If already clean 11-char ID (letters, numbers, hyphen, underscore)
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  // Matches https://www.youtube.com/watch?v=VIDEO_ID or &v=VIDEO_ID
  const watchMatch = trimmed.match(/(?:v=|vi=|\/v\/|\/vi\/)([a-zA-Z0-9_-]{11})/);
  if (watchMatch && watchMatch[1]) {
    return watchMatch[1];
  }

  // Matches https://youtu.be/VIDEO_ID
  const shortMatch = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch && shortMatch[1]) {
    return shortMatch[1];
  }

  // Matches https://www.youtube.com/live/VIDEO_ID
  const liveMatch = trimmed.match(/youtube\.com\/live\/([a-zA-Z0-9_-]{11})/);
  if (liveMatch && liveMatch[1]) {
    return liveMatch[1];
  }

  // Matches https://www.youtube.com/embed/VIDEO_ID
  const embedMatch = trimmed.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch && embedMatch[1]) {
    return embedMatch[1];
  }

  return null;
}

export const createMatchSchema = z
  .object({
    seasonId: z.string().uuid(),
    teamAId: z.string().uuid(),
    teamBId: z.string().uuid(),
    scheduledAt: z.string().optional().nullable(),
    venue: z.string().min(1).max(150).optional().nullable(),
    maxOvers: z.coerce.number().int().min(1).max(50).default(20),
    youtubeUrlOrId: z.string().optional().nullable(),
  })
  .refine((data) => data.teamAId !== data.teamBId, {
    message: 'Team A and Team B must be different franchises.',
    path: ['teamBId'],
  });

export const updateMatchSchema = z.object({
  matchId: z.string().uuid(),
  scheduledAt: z.string().optional().nullable(),
  venue: z.string().min(1).max(150).optional().nullable(),
  maxOvers: z.coerce.number().int().min(1).max(50).optional(),
  status: z.enum(['scheduled', 'toss', 'live', 'innings_break', 'completed', 'abandoned']).optional(),
  youtubeUrlOrId: z.string().optional().nullable(),
});

export const assignScorerSchema = z.object({
  matchId: z.string().uuid(),
  userId: z.string().uuid(),
  isActive: z.boolean().default(true),
});

export const setPlayingXISchema = z.object({
  matchId: z.string().uuid(),
  franchiseId: z.string().uuid(),
  playerRegistrationIds: z.array(z.string().uuid()).length(11, 'Playing XI must consist of exactly 11 players.'),
  captainRegistrationId: z.string().uuid(),
  wicketKeeperRegistrationId: z.string().uuid(),
}).refine((data) => data.playerRegistrationIds.includes(data.captainRegistrationId), {
  message: 'Captain must be selected from the Playing XI.',
  path: ['captainRegistrationId'],
}).refine((data) => data.playerRegistrationIds.includes(data.wicketKeeperRegistrationId), {
  message: 'Wicket Keeper must be selected from the Playing XI.',
  path: ['wicketKeeperRegistrationId'],
});

export const recordTossSchema = z.object({
  matchId: z.string().uuid(),
  tossWinnerId: z.string().uuid(),
  tossDecision: z.enum(['bat', 'bowl']),
});

export const startInningsSchema = z.object({
  matchId: z.string().uuid(),
  inningsNumber: z.union([z.literal(1), z.literal(2)]),
  strikerId: z.string().uuid(),
  nonStrikerId: z.string().uuid(),
  bowlerId: z.string().uuid(),
}).refine((data) => data.strikerId !== data.nonStrikerId, {
  message: 'Striker and Non-Striker must be different players.',
  path: ['nonStrikerId'],
}).refine((data) => data.bowlerId !== data.strikerId && data.bowlerId !== data.nonStrikerId, {
  message: 'Bowler cannot be on strike or non-strike.',
  path: ['bowlerId'],
});

export const recordDeliverySchema = z.object({
  matchId: z.string().uuid(),
  inningsId: z.string().uuid(),
  submissionId: z.string().uuid('Valid submission UUID required for idempotency.'),
  expectedSequence: z.number().int().min(1),
  overNumber: z.number().int().min(0),
  ballNumber: z.number().int().min(1),
  strikerId: z.string().uuid(),
  nonStrikerId: z.string().uuid(),
  bowlerId: z.string().uuid(),
  runsBatter: z.number().int().min(0).max(6).default(0),
  extrasRuns: z.number().int().min(0).max(10).default(0),
  extrasType: z.enum(['none', 'wide', 'no_ball', 'bye', 'leg_bye', 'penalty']).default('none'),
  isWicket: z.boolean().default(false),
  wicketType: z.enum(['bowled', 'caught', 'lbw', 'run_out', 'stumped', 'hit_wicket']).optional().nullable(),
  dismissedPlayerId: z.string().uuid().optional().nullable(),
  incomingBatterId: z.string().uuid().optional().nullable(),
  commentary: z.string().max(250).optional().nullable(),
});

export const undoDeliverySchema = z.object({
  matchId: z.string().uuid(),
  inningsId: z.string().uuid(),
  reason: z.string().min(1).max(200).default('Scorer corrected last ball'),
});
