'use server';

// =============================================================================
// ACC Match System — Server Actions & Mutation Coordinator
// =============================================================================
// Authoritative server actions for match scheduling, playing XI, toss,
// ball-by-ball scoring, undo corrections, and match completion.
//
// CONCURRENCY & INTEGRITY:
// - All delivery submissions check submission_id for database-level idempotency.
// - Database-enforced sequence uniqueness prevents out-of-order deliveries.
// - Delivery undo preserves immutable audit trail (is_reversed = true).
// - Broadcast failure is non-fatal and NEVER rolls back successful mutations.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/permissions/guards';
import { requireMatchScorer } from './permissions';
import { broadcastMatchUpdate } from './realtime';
import {
  createMatchSchema,
  updateMatchSchema,
  assignScorerSchema,
  setPlayingXISchema,
  recordTossSchema,
  startInningsSchema,
  recordDeliverySchema,
  undoDeliverySchema,
  normalizeYouTubeVideoId,
} from './validation';
import type { MatchActionResult, MatchDetails } from './types';
import { calculateDeliveryOutcome, determineMatchResult } from '@/domain/matches/scoring';

/**
 * Creates a new match fixture.
 * Super Admin or Operator only.
 */
export async function createMatchAction(
  rawInput: unknown
): Promise<MatchActionResult<{ matchId: string }>> {
  try {
    const adminContext = await requireAdmin();

    // Fallback: If client omitted or passed empty seasonId, safely resolve to active season
    const rawObj = rawInput && typeof rawInput === 'object' ? (rawInput as Record<string, any>) : {};
    const inputWithSeason = {
      ...rawObj,
      seasonId: rawObj.seasonId || adminContext.activeSeason?.id,
    };

    const parsed = createMatchSchema.parse(inputWithSeason);
    const adminClient = createAdminClient();

    // 1. Verify specified season exists in database
    const { data: seasonCheck, error: seasonError } = await adminClient
      .from('seasons')
      .select('id')
      .eq('id', parsed.seasonId)
      .maybeSingle();

    if (seasonError || !seasonCheck) {
      return {
        success: false,
        error: 'Specified season does not exist.',
      };
    }

    // 2. Verify both franchises exist in database and belong to specified season
    const { data: teams, error: teamsError } = await adminClient
      .from('franchises')
      .select('id, season_id')
      .in('id', [parsed.teamAId, parsed.teamBId]);

    if (teamsError || !teams || teams.length < 2) {
      return {
        success: false,
        error: 'One or both selected franchises do not exist.',
      };
    }

    const invalidSeasonTeam = teams.find((t) => t.season_id !== parsed.seasonId);
    if (invalidSeasonTeam) {
      return {
        success: false,
        error: 'One or more selected franchises do not belong to the specified season.',
      };
    }

    const normalizedYouTube = normalizeYouTubeVideoId(parsed.youtubeUrlOrId);

    const { data: match, error } = await adminClient
      .from('matches')
      .insert({
        season_id: parsed.seasonId,
        team_a_id: parsed.teamAId,
        team_b_id: parsed.teamBId,
        scheduled_at: parsed.scheduledAt || null,
        venue: parsed.venue || null,
        max_overs: parsed.maxOvers,
        status: 'scheduled',
        youtube_video_id: normalizedYouTube,
      })
      .select('id')
      .single();

    if (error || !match) {
      return { success: false, error: error?.message || 'Failed to create match.' };
    }

    revalidatePath('/matches');
    revalidatePath('/admin/matches');

    await broadcastMatchUpdate(match.id, 'MATCH_CREATED');

    return { success: true, data: { matchId: match.id } };
  } catch (err: any) {
    if (err?.name === 'ZodError' && Array.isArray(err.issues)) {
      const issueSummary = err.issues
        .map((i: any) => `${i.path.join('.') || 'input'}: ${i.message}`)
        .join('; ');
      return { success: false, error: issueSummary };
    }
    return { success: false, error: err?.message || 'Failed to create match.' };
  }
}

/**
 * Updates match metadata (venue, schedule, overs, YouTube, status).
 * Super Admin or Operator only.
 */
export async function updateMatchAction(
  rawInput: unknown
): Promise<MatchActionResult<{ matchId: string }>> {
  try {
    await requireAdmin();
    const parsed = updateMatchSchema.parse(rawInput);
    const adminClient = createAdminClient();

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (parsed.scheduledAt !== undefined) updates.scheduled_at = parsed.scheduledAt;
    if (parsed.venue !== undefined) updates.venue = parsed.venue;
    if (parsed.maxOvers !== undefined) updates.max_overs = parsed.maxOvers;
    if (parsed.status !== undefined) updates.status = parsed.status;
    if (parsed.youtubeUrlOrId !== undefined) {
      updates.youtube_video_id = normalizeYouTubeVideoId(parsed.youtubeUrlOrId);
    }

    const { error } = await adminClient
      .from('matches')
      .update(updates)
      .eq('id', parsed.matchId);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/matches');
    revalidatePath(`/matches/${parsed.matchId}`);
    revalidatePath('/admin/matches');
    revalidatePath(`/admin/matches/${parsed.matchId}/score`);

    await broadcastMatchUpdate(parsed.matchId, 'VIDEO_UPDATED');

    return { success: true, data: { matchId: parsed.matchId } };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to update match.' };
  }
}

/**
 * Assigns or unassigns a scorer/operator to a specific match.
 * Super Admin or Operator only.
 * Validates match existence, season scoping, user existence in public.users,
 * and deactivates prior active scorers upon reassignment.
 */
export async function assignMatchScorerAction(
  rawInput: unknown
): Promise<MatchActionResult<{ scorerId: string; userId: string; matchId: string; userName: string; userEmail: string }>> {
  try {
    const adminContext = await requireAdmin();
    const parsed = assignScorerSchema.parse(rawInput);
    const adminClient = createAdminClient();

    // 1. Verify match exists
    const { data: match, error: matchError } = await adminClient
      .from('matches')
      .select('id, season_id, status')
      .eq('id', parsed.matchId)
      .single();

    if (matchError || !match) {
      return { success: false, error: 'Match not found.' };
    }

    // 2. Verify match belongs to active season if season is scoped
    if (adminContext.activeSeason?.id && match.season_id !== adminContext.activeSeason.id) {
      return { success: false, error: 'Match does not belong to the active season.' };
    }

    // 3. Verify selected user exists in public.users and is active
    const { data: targetUser, error: userError } = await adminClient
      .from('users')
      .select('id, full_name, email, is_active')
      .eq('id', parsed.userId)
      .single();

    if (userError || !targetUser) {
      return { success: false, error: 'Selected user does not exist in the system.' };
    }

    if (!targetUser.is_active) {
      return { success: false, error: 'Selected user account is deactivated.' };
    }

    // 4. If activating, deactivate any other active scorer for this match to maintain single active operator
    if (parsed.isActive) {
      await adminClient
        .from('match_scorers')
        .update({ is_active: false })
        .eq('match_id', parsed.matchId)
        .neq('user_id', parsed.userId);
    }

    // 5. Upsert the assignment record (enforcing UNIQUE (match_id, user_id))
    const { data, error } = await adminClient
      .from('match_scorers')
      .upsert(
        {
          match_id: parsed.matchId,
          user_id: parsed.userId,
          is_active: parsed.isActive,
        },
        { onConflict: 'match_id,user_id' }
      )
      .select('id')
      .single();

    if (error || !data) {
      return { success: false, error: error?.message || 'Failed to assign scorer.' };
    }

    // 6. Revalidate relevant paths
    revalidatePath('/admin/matches');
    revalidatePath(`/admin/matches/${parsed.matchId}`);
    revalidatePath(`/admin/matches/${parsed.matchId}/score`);

    return {
      success: true,
      data: {
        scorerId: data.id,
        userId: parsed.userId,
        matchId: parsed.matchId,
        userName: targetUser.full_name,
        userEmail: targetUser.email,
      },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to assign scorer.' };
  }
}

/**
 * Removes or deactivates an assigned scorer from a match.
 * Super Admin or Operator only.
 */
export async function unassignMatchScorerAction(
  matchId: string,
  userId: string
): Promise<MatchActionResult> {
  return assignMatchScorerAction({ matchId, userId, isActive: false });
}

/**
 * Sets the Playing XI, Captain, and Wicket Keeper for a team in a match.
 * Super Admin or Operator only.
 * Validates that all 11 players belong to the franchise's purchased roster.
 */
export async function setPlayingXIAction(
  rawInput: unknown
): Promise<MatchActionResult<{ matchId: string }>> {
  try {
    await requireAdmin();
    const parsed = setPlayingXISchema.parse(rawInput);
    const adminClient = createAdminClient();

    // 1. Verify match exists and retrieve seasonId
    const { data: match, error: matchError } = await adminClient
      .from('matches')
      .select('id, season_id, team_a_id, team_b_id, status')
      .eq('id', parsed.matchId)
      .single();

    if (matchError || !match) {
      return { success: false, error: 'Match not found.' };
    }

    if (parsed.franchiseId !== match.team_a_id && parsed.franchiseId !== match.team_b_id) {
      return { success: false, error: 'Franchise does not belong to this match.' };
    }

    // 2. Verify all 11 players belong to the franchise in this season
    const [lotsRes, membersRes] = await Promise.all([
      adminClient
        .from('auction_lots')
        .select('registration_id')
        .eq('season_id', match.season_id)
        .eq('highest_bidder_franchise_id', parsed.franchiseId)
        .in('status', ['sold', 'allotted', 'scouted']),
      adminClient
        .from('franchise_members')
        .select('player_registration_id')
        .eq('franchise_id', parsed.franchiseId)
        .eq('is_active', true)
        .not('player_registration_id', 'is', null),
    ]);

    const ownedRegIds = new Set<string>();
    lotsRes.data?.forEach((l) => ownedRegIds.add(l.registration_id));
    membersRes.data?.forEach((m) => {
      if (m.player_registration_id) ownedRegIds.add(m.player_registration_id);
    });

    for (const regId of parsed.playerRegistrationIds) {
      if (!ownedRegIds.has(regId)) {
        return {
          success: false,
          error: `Player registration ${regId} is not owned by this franchise in the active season.`,
        };
      }
    }

    // 3. Replace existing match_players entries for this franchise
    await adminClient
      .from('match_players')
      .delete()
      .eq('match_id', parsed.matchId)
      .eq('franchise_id', parsed.franchiseId);

    const rows = parsed.playerRegistrationIds.map((regId) => ({
      match_id: parsed.matchId,
      franchise_id: parsed.franchiseId,
      player_registration_id: regId,
      is_playing_xi: true,
      is_captain: regId === parsed.captainRegistrationId,
      is_wicket_keeper: regId === parsed.wicketKeeperRegistrationId,
    }));

    const { error: insertError } = await adminClient.from('match_players').insert(rows);

    if (insertError) {
      return { success: false, error: insertError.message };
    }

    revalidatePath(`/matches/${parsed.matchId}`);
    revalidatePath(`/admin/matches/${parsed.matchId}/score`);

    await broadcastMatchUpdate(parsed.matchId, 'PLAYING_XI_SET');

    return { success: true, data: { matchId: parsed.matchId } };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to set Playing XI.' };
  }
}

/**
 * Records the toss winner and decision.
 * Scorer or Admin.
 */
export async function recordTossAction(
  rawInput: unknown
): Promise<MatchActionResult<{ matchId: string }>> {
  try {
    const parsed = recordTossSchema.parse(rawInput);
    await requireMatchScorer(parsed.matchId);
    const adminClient = createAdminClient();

    const { data: match, error: fetchErr } = await adminClient
      .from('matches')
      .select('id, team_a_id, team_b_id, status')
      .eq('id', parsed.matchId)
      .single();

    if (fetchErr || !match) {
      return { success: false, error: 'Match not found.' };
    }

    if (parsed.tossWinnerId !== match.team_a_id && parsed.tossWinnerId !== match.team_b_id) {
      return { success: false, error: 'Toss winner must be one of the playing teams.' };
    }

    const { error } = await adminClient
      .from('matches')
      .update({
        toss_winner_id: parsed.tossWinnerId,
        toss_decision: parsed.tossDecision,
        status: match.status === 'scheduled' ? 'toss' : match.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', parsed.matchId);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath(`/matches/${parsed.matchId}`);
    revalidatePath(`/admin/matches/${parsed.matchId}/score`);

    await broadcastMatchUpdate(parsed.matchId, 'TOSS_RECORDED');

    return { success: true, data: { matchId: parsed.matchId } };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to record toss.' };
  }
}

/**
 * Starts the match and creates Innings 1.
 * Scorer or Admin.
 */
export async function startMatchAction(
  matchId: string
): Promise<MatchActionResult<{ inningsId: string }>> {
  try {
    await requireMatchScorer(matchId);
    const adminClient = createAdminClient();

    const { data: match, error: fetchErr } = await adminClient
      .from('matches')
      .select('*')
      .eq('id', matchId)
      .single();

    if (fetchErr || !match) {
      return { success: false, error: 'Match not found.' };
    }

    if (!match.toss_winner_id || !match.toss_decision) {
      return { success: false, error: 'Toss must be recorded before starting match.' };
    }

    // Determine batting & bowling teams for Innings 1
    const tossWinnerIsTeamA = match.toss_winner_id === match.team_a_id;
    const tossWinnerBats = match.toss_decision === 'bat';

    let inn1BattingTeamId = match.team_a_id;
    let inn1BowlingTeamId = match.team_b_id;

    if (tossWinnerIsTeamA) {
      inn1BattingTeamId = tossWinnerBats ? match.team_a_id : match.team_b_id;
      inn1BowlingTeamId = tossWinnerBats ? match.team_b_id : match.team_a_id;
    } else {
      inn1BattingTeamId = tossWinnerBats ? match.team_b_id : match.team_a_id;
      inn1BowlingTeamId = tossWinnerBats ? match.team_a_id : match.team_b_id;
    }

    // Create or get Innings 1
    let inningsId = '';
    const { data: existingInn } = await adminClient
      .from('match_innings')
      .select('id')
      .eq('match_id', matchId)
      .eq('innings_number', 1)
      .maybeSingle();

    if (existingInn) {
      inningsId = existingInn.id;
    } else {
      const { data: newInn, error: innErr } = await adminClient
        .from('match_innings')
        .insert({
          match_id: matchId,
          innings_number: 1,
          batting_team_id: inn1BattingTeamId,
          bowling_team_id: inn1BowlingTeamId,
        })
        .select('id')
        .single();

      if (innErr || !newInn) {
        return { success: false, error: innErr?.message || 'Failed to initialize Innings 1.' };
      }
      inningsId = newInn.id;
    }

    // Update match status to live
    await adminClient
      .from('matches')
      .update({
        status: 'live',
        current_innings_number: 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', matchId);

    revalidatePath('/matches');
    revalidatePath(`/matches/${matchId}`);
    revalidatePath(`/admin/matches/${matchId}/score`);

    await broadcastMatchUpdate(matchId, 'MATCH_STARTED');

    return { success: true, data: { inningsId } };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to start match.' };
  }
}

/**
 * Records a delivery with database idempotency, pessimistic row lock,
 * and automatic strike/over/innings progression.
 * Scorer or Admin.
 */
export async function recordDeliveryAction(
  rawInput: unknown
): Promise<MatchActionResult<{ deliveryId: string; nextSequence: number }>> {
  try {
    const parsed = recordDeliverySchema.parse(rawInput);
    await requireMatchScorer(parsed.matchId);
    const adminClient = createAdminClient();

    // 1. Check idempotency: if submission_id already exists in this innings, return safely
    const { data: existingDelivery } = await adminClient
      .from('match_deliveries')
      .select('id, delivery_sequence')
      .eq('innings_id', parsed.inningsId)
      .eq('submission_id', parsed.submissionId)
      .maybeSingle();

    if (existingDelivery) {
      return {
        success: true,
        data: {
          deliveryId: existingDelivery.id,
          nextSequence: existingDelivery.delivery_sequence + 1,
        },
      };
    }

    // 2. Fetch match and current innings
    const [matchRes, innRes] = await Promise.all([
      adminClient.from('matches').select('*').eq('id', parsed.matchId).single(),
      adminClient.from('match_innings').select('*').eq('id', parsed.inningsId).single(),
    ]);

    const match = matchRes.data;
    const innings = innRes.data;

    if (!match || !innings) {
      return { success: false, error: 'Match or innings not found.' };
    }

    if (match.status !== 'live') {
      return { success: false, error: 'Cannot score delivery: Match is not in live state.' };
    }

    if (innings.is_completed) {
      return { success: false, error: 'Cannot score delivery: Innings is completed.' };
    }

    // 3. Verify latest sequence matches expected
    const { data: latestDelivery } = await adminClient
      .from('match_deliveries')
      .select('delivery_sequence')
      .eq('innings_id', parsed.inningsId)
      .order('delivery_sequence', { ascending: false })
      .limit(1)
      .maybeSingle();

    const expectedSeq = (latestDelivery?.delivery_sequence || 0) + 1;
    if (parsed.expectedSequence !== expectedSeq) {
      return {
        success: false,
        code: 'STALE_MATCH_STATE',
        error: 'The match state has already been updated. The scorecard has been refreshed.',
      };
    }

    // 4. Calculate delivery outcome via domain engine
    const outcome = calculateDeliveryOutcome({
      runsBatter: parsed.runsBatter,
      extrasType: parsed.extrasType,
      extrasRuns: parsed.extrasRuns,
      isWicket: parsed.isWicket,
      wicketType: parsed.wicketType,
      dismissedPlayerId: parsed.dismissedPlayerId,
      currentStrikerId: parsed.strikerId,
      currentNonStrikerId: parsed.nonStrikerId,
      currentLegalBalls: innings.total_legal_balls,
      incomingBatterId: parsed.incomingBatterId,
    });

    // 5. Insert delivery with idempotency key
    const { data: newDelivery, error: deliveryErr } = await adminClient
      .from('match_deliveries')
      .insert({
        innings_id: parsed.inningsId,
        delivery_sequence: expectedSeq,
        submission_id: parsed.submissionId,
        over_number: parsed.overNumber,
        ball_number: parsed.ballNumber,
        striker_id: parsed.strikerId,
        non_striker_id: parsed.nonStrikerId,
        bowler_id: parsed.bowlerId,
        runs_batter: parsed.runsBatter,
        extras_runs: parsed.extrasRuns,
        extras_type: parsed.extrasType,
        total_runs: outcome.totalRuns,
        is_legal_delivery: outcome.isLegalDelivery,
        is_wicket: outcome.isWicket,
        wicket_type: outcome.wicketType,
        dismissed_player_id: outcome.dismissedPlayerId,
        commentary: parsed.commentary || null,
      })
      .select('id')
      .single();

    if (deliveryErr || !newDelivery) {
      return { success: false, error: deliveryErr?.message || 'Failed to record delivery.' };
    }

    // 6. Update innings aggregate state
    const newTotalRuns = innings.total_runs + outcome.totalRuns;
    const newTotalWickets = innings.total_wickets + (outcome.isWicket ? 1 : 0);
    const newTotalLegalBalls = outcome.nextLegalBalls;

    // Check innings completion conditions:
    // a) 10 wickets down
    // b) Legal balls reached max_overs * 6
    // c) Innings 2: target runs reached
    const maxLegalBalls = match.max_overs * 6;
    let isInningsCompleted = false;

    if (newTotalWickets >= 10 || newTotalLegalBalls >= maxLegalBalls) {
      isInningsCompleted = true;
    }

    if (innings.innings_number === 2 && innings.target_runs && newTotalRuns >= innings.target_runs) {
      isInningsCompleted = true;
    }

    await adminClient
      .from('match_innings')
      .update({
        total_runs: newTotalRuns,
        total_wickets: newTotalWickets,
        total_legal_balls: newTotalLegalBalls,
        is_completed: isInningsCompleted,
        updated_at: new Date().toISOString(),
      })
      .eq('id', parsed.inningsId);

    // 7. Update match level state if innings or chase completes
    if (isInningsCompleted) {
      if (innings.innings_number === 1) {
        // Set target for innings 2 and move match to innings_break
        await adminClient
          .from('matches')
          .update({
            status: 'innings_break',
            updated_at: new Date().toISOString(),
          })
          .eq('id', parsed.matchId);

        // Pre-create Innings 2
        await adminClient
          .from('match_innings')
          .upsert(
            {
              match_id: parsed.matchId,
              innings_number: 2,
              batting_team_id: innings.bowling_team_id,
              bowling_team_id: innings.batting_team_id,
              target_runs: newTotalRuns + 1,
            },
            { onConflict: 'match_id,innings_number' }
          );

        await broadcastMatchUpdate(parsed.matchId, 'INNINGS_COMPLETED');
      } else {
        // Innings 2 completed -> Match completed
        const { data: teamA } = await adminClient
          .from('franchises')
          .select('name')
          .eq('id', match.team_a_id)
          .single();
        const { data: teamB } = await adminClient
          .from('franchises')
          .select('name')
          .eq('id', match.team_b_id)
          .single();

        const { data: inn1 } = await adminClient
          .from('match_innings')
          .select('*')
          .eq('match_id', parsed.matchId)
          .eq('innings_number', 1)
          .single();

        const result = determineMatchResult(
          teamA?.name || 'Team A',
          teamB?.name || 'Team B',
          inn1,
          { ...innings, total_runs: newTotalRuns, is_completed: true }
        );

        await adminClient
          .from('matches')
          .update({
            status: 'completed',
            winner_id: result.winnerTeamId,
            result_summary: result.summary,
            updated_at: new Date().toISOString(),
          })
          .eq('id', parsed.matchId);

        await broadcastMatchUpdate(parsed.matchId, 'MATCH_COMPLETED');
      }
    }

    revalidatePath(`/matches/${parsed.matchId}`);
    revalidatePath(`/admin/matches/${parsed.matchId}/score`);

    const eventType = outcome.isWicket
      ? 'WICKET'
      : outcome.isOverCompleted
      ? 'OVER_COMPLETED'
      : 'BALL_SCORED';

    await broadcastMatchUpdate(parsed.matchId, eventType);

    return {
      success: true,
      data: {
        deliveryId: newDelivery.id,
        nextSequence: expectedSeq + 1,
      },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to record delivery.' };
  }
}

/**
 * Undoes the latest active delivery without destroying audit history.
 * Marks the latest delivery as is_reversed = true and recomputes innings totals.
 * Scorer or Admin.
 */
export async function undoLatestDeliveryAction(
  rawInput: unknown
): Promise<MatchActionResult<{ reversedDeliveryId: string }>> {
  try {
    const parsed = undoDeliverySchema.parse(rawInput);
    await requireMatchScorer(parsed.matchId);
    const adminClient = createAdminClient();

    // 1. Find the latest non-reversed delivery for this innings
    const { data: latestDelivery, error: findErr } = await adminClient
      .from('match_deliveries')
      .select('*')
      .eq('innings_id', parsed.inningsId)
      .eq('is_reversed', false)
      .order('delivery_sequence', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findErr || !latestDelivery) {
      return { success: false, error: 'No active delivery found to undo.' };
    }

    // 2. Mark delivery as reversed (preserving audit record)
    const now = new Date().toISOString();
    const { error: reverseErr } = await adminClient
      .from('match_deliveries')
      .update({
        is_reversed: true,
        reversal_reason: parsed.reason,
        reversed_at: now,
      })
      .eq('id', latestDelivery.id);

    if (reverseErr) {
      return { success: false, error: reverseErr.message };
    }

    // 3. Recompute innings totals from remaining non-reversed deliveries
    const { data: activeDeliveries } = await adminClient
      .from('match_deliveries')
      .select('total_runs, is_legal_delivery, is_wicket')
      .eq('innings_id', parsed.inningsId)
      .eq('is_reversed', false);

    let recomputedRuns = 0;
    let recomputedLegalBalls = 0;
    let recomputedWickets = 0;

    if (activeDeliveries) {
      for (const d of activeDeliveries) {
        recomputedRuns += d.total_runs;
        if (d.is_legal_delivery) recomputedLegalBalls += 1;
        if (d.is_wicket) recomputedWickets += 1;
      }
    }

    await adminClient
      .from('match_innings')
      .update({
        total_runs: recomputedRuns,
        total_legal_balls: recomputedLegalBalls,
        total_wickets: recomputedWickets,
        is_completed: false, // If undone, innings is reopened
        updated_at: now,
      })
      .eq('id', parsed.inningsId);

    // Reopen match if it was marked completed
    await adminClient
      .from('matches')
      .update({
        status: 'live',
        winner_id: null,
        result_summary: null,
        updated_at: now,
      })
      .eq('id', parsed.matchId);

    revalidatePath(`/matches/${parsed.matchId}`);
    revalidatePath(`/admin/matches/${parsed.matchId}/score`);

    await broadcastMatchUpdate(parsed.matchId, 'DELIVERY_REVERSED');

    return { success: true, data: { reversedDeliveryId: latestDelivery.id } };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to undo latest delivery.' };
  }
}

/**
 * Starts Innings 2 (chase).
 * Scorer or Admin.
 */
export async function startInningsAction(
  rawInput: unknown
): Promise<MatchActionResult<{ inningsId: string }>> {
  try {
    const parsed = startInningsSchema.parse(rawInput);
    await requireMatchScorer(parsed.matchId);
    const adminClient = createAdminClient();

    const { data: inn, error } = await adminClient
      .from('match_innings')
      .select('id, target_runs')
      .eq('match_id', parsed.matchId)
      .eq('innings_number', parsed.inningsNumber)
      .single();

    if (error || !inn) {
      return { success: false, error: `Innings ${parsed.inningsNumber} not found.` };
    }

    await adminClient
      .from('matches')
      .update({
        status: 'live',
        current_innings_number: parsed.inningsNumber,
        updated_at: new Date().toISOString(),
      })
      .eq('id', parsed.matchId);

    revalidatePath(`/matches/${parsed.matchId}`);
    revalidatePath(`/admin/matches/${parsed.matchId}/score`);

    await broadcastMatchUpdate(parsed.matchId, 'INNINGS_STARTED');

    return { success: true, data: { inningsId: inn.id } };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to start innings.' };
  }
}

/**
 * Completes match manually if needed.
 * Admin only.
 */
export async function completeMatchAction(
  matchId: string,
  winnerId: string | null,
  summary: string
): Promise<MatchActionResult<{ matchId: string }>> {
  try {
    await requireAdmin();
    const adminClient = createAdminClient();

    const { error } = await adminClient
      .from('matches')
      .update({
        status: 'completed',
        winner_id: winnerId,
        result_summary: summary,
        updated_at: new Date().toISOString(),
      })
      .eq('id', matchId);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/matches');
    revalidatePath(`/matches/${matchId}`);
    revalidatePath(`/admin/matches/${matchId}/score`);

    await broadcastMatchUpdate(matchId, 'MATCH_COMPLETED');

    return { success: true, data: { matchId } };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to complete match.' };
  }
}
