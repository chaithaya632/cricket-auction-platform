// =============================================================================
// ACC Match System — Read-Side Queries
// =============================================================================

import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  DbMatch,
  DbMatchInnings,
  DbMatchPlayer,
  DbMatchDelivery,
  MatchDetails,
  InningsScorecard,
  MatchPlayerWithDetails,
} from './types';
import { deriveScorecard } from '@/domain/matches/scoring';

/**
 * Retrieves all matches for a season or active matches across seasons.
 * Uses public-safe views for franchises.
 */
export const getMatches = cache(async (
  supabase: SupabaseClient,
  seasonId?: string
): Promise<Array<DbMatch & { teamA: any; teamB: any; winnerTeam: any }>> => {
  let query = supabase
    .from('matches')
    .select(`
      *,
      teamA:team_a_id(id, name, short_name, logo_url, color_primary, color_secondary),
      teamB:team_b_id(id, name, short_name, logo_url, color_primary, color_secondary),
      winnerTeam:winner_id(id, name, short_name, logo_url)
    `)
    .order('scheduled_at', { ascending: true, nullsFirst: false });

  if (seasonId) {
    query = query.eq('season_id', seasonId);
  }

  const { data, error } = await query;
  if (error || !data) {
    return [];
  }

  return data as any[];
});

/**
 * Retrieves a single match by ID with high-level team info.
 */
export const getMatchById = cache(async (
  supabase: SupabaseClient,
  matchId: string
): Promise<DbMatch | null> => {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('id', matchId)
    .maybeSingle();

  if (error || !data) return null;
  return data as DbMatch;
});

/**
 * Retrieves full match details, innings, deliveries, and derived scorecards.
 * Uses public_players_view to strictly prevent exposing player mobile numbers.
 */
export const getMatchFullDetails = cache(async (
  supabase: SupabaseClient,
  matchId: string
): Promise<MatchDetails | null> => {
  // 1. Fetch match and teams
  const { data: match, error: matchError } = await supabase
    .from('matches')
    .select(`
      *,
      teamA:team_a_id(id, name, short_name, logo_url, color_primary, color_secondary),
      teamB:team_b_id(id, name, short_name, logo_url, color_primary, color_secondary)
    `)
    .eq('id', matchId)
    .maybeSingle();

  if (matchError || !match) return null;

  // 2. Fetch innings, match players, and deliveries concurrently
  const [inningsRes, playersRes, deliveriesRes] = await Promise.all([
    supabase
      .from('match_innings')
      .select('*')
      .eq('match_id', matchId)
      .order('innings_number', { ascending: true }),
    supabase
      .from('match_players')
      .select('*')
      .eq('match_id', matchId),
    supabase
      .from('match_deliveries')
      .select('*, match_innings!inner(match_id)')
      .eq('match_innings.match_id', matchId)
      .order('delivery_sequence', { ascending: true }),
  ]);

  const rawInnings = (inningsRes.data || []) as DbMatchInnings[];
  const rawPlayers = (playersRes.data || []) as DbMatchPlayer[];
  const rawDeliveries = (deliveriesRes.data || []) as DbMatchDelivery[];

  // 3. Fetch public-safe player profiles for all players associated with this match
  const registrationIds = rawPlayers.map((p) => p.player_registration_id);
  const playerMap = new Map<string, { name: string; photoUrl: string | null; type: string | null; bat: string | null; bowl: string | null }>();

  if (registrationIds.length > 0) {
    const { data: publicPlayers } = await supabase
      .from('public_players_view')
      .select('registration_id, full_name, photo_url, derived_player_type, batting_style, bowling_style')
      .in('registration_id', registrationIds);

    if (publicPlayers) {
      for (const p of publicPlayers) {
        playerMap.set(p.registration_id, {
          name: p.full_name,
          photoUrl: p.photo_url,
          type: p.derived_player_type,
          bat: p.batting_style,
          bowl: p.bowling_style,
        });
      }
    }
  }

  // Assemble MatchPlayerWithDetails
  const teamAPlayers: MatchPlayerWithDetails[] = [];
  const teamBPlayers: MatchPlayerWithDetails[] = [];

  for (const mp of rawPlayers) {
    const info = playerMap.get(mp.player_registration_id);
    const item: MatchPlayerWithDetails = {
      id: mp.id,
      matchId: mp.match_id,
      franchiseId: mp.franchise_id,
      playerRegistrationId: mp.player_registration_id,
      playerName: info?.name || 'Player',
      photoUrl: info?.photoUrl || null,
      playerType: info?.type || null,
      battingStyle: info?.bat || null,
      bowlingStyle: info?.bowl || null,
      isPlayingXI: mp.is_playing_xi,
      isCaptain: mp.is_captain,
      isWicketKeeper: mp.is_wicket_keeper,
    };
    if (mp.franchise_id === match.team_a_id) {
      teamAPlayers.push(item);
    } else {
      teamBPlayers.push(item);
    }
  }

  // 4. Derive scorecards for Innings 1 and Innings 2
  const buildScorecard = (inn: DbMatchInnings | undefined): InningsScorecard | null => {
    if (!inn) return null;
    const innDeliveries = rawDeliveries.filter((d) => d.innings_id === inn.id);
    const isTeamABatting = inn.batting_team_id === match.team_a_id;
    const batTeam = isTeamABatting ? match.teamA : match.teamB;
    const bowlTeam = isTeamABatting ? match.teamB : match.teamA;

    // Identify current striker, non-striker, bowler from latest delivery if active
    const activeDeliveries = innDeliveries.filter((d) => !d.is_reversed);
    const latest = activeDeliveries[activeDeliveries.length - 1];

    const currentStrikerId = latest ? latest.striker_id : null;
    const currentNonStrikerId = latest ? latest.non_striker_id : null;
    const currentBowlerId = latest ? latest.bowler_id : null;

    const derived = deriveScorecard(
      inn,
      innDeliveries,
      playerMap,
      match.max_overs,
      currentStrikerId,
      currentNonStrikerId,
      currentBowlerId
    );

    return {
      innings: inn,
      battingTeamName: batTeam.name,
      battingTeamShortName: batTeam.short_name,
      battingTeamLogo: batTeam.logo_url,
      bowlingTeamName: bowlTeam.name,
      bowlingTeamShortName: bowlTeam.short_name,
      bowlingTeamLogo: bowlTeam.logo_url,
      batters: derived.batters,
      bowlers: derived.bowlers,
      extras: derived.extras,
      fallOfWickets: derived.fallOfWickets,
      currentOverDeliveries: derived.currentOverDeliveries,
      recentDeliveries: activeDeliveries.slice(-12).reverse(),
      runRate: derived.runRate,
      requiredRunRate: derived.requiredRunRate,
      oversDisplay: derived.oversDisplay,
    };
  };

  const inn1 = rawInnings.find((i) => i.innings_number === 1);
  const inn2 = rawInnings.find((i) => i.innings_number === 2);

  const scorecard1 = buildScorecard(inn1);
  const scorecard2 = buildScorecard(inn2);

  const activeInningsNumber = match.current_innings_number || 1;
  const activeInnings = activeInningsNumber === 2 ? (scorecard2 || scorecard1) : scorecard1;

  // Resolve current active batsman/bowler details for quick hero view
  const striker = activeInnings?.batters.find((b) => b.isStriker) || null;
  const nonStriker = activeInnings?.batters.find((b) => b.isOnCrease && !b.isStriker) || null;
  const currentBowler = activeInnings?.bowlers.find((b) => b.isCurrentBowler) || null;

  return {
    match,
    teamA: {
      id: match.teamA.id,
      name: match.teamA.name,
      shortName: match.teamA.short_name,
      logoUrl: match.teamA.logo_url,
      colorPrimary: match.teamA.color_primary,
      colorSecondary: match.teamA.color_secondary,
    },
    teamB: {
      id: match.teamB.id,
      name: match.teamB.name,
      shortName: match.teamB.short_name,
      logoUrl: match.teamB.logo_url,
      colorPrimary: match.teamB.color_primary,
      colorSecondary: match.teamB.color_secondary,
    },
    innings1: scorecard1,
    innings2: scorecard2,
    activeInnings,
    currentStriker: striker,
    currentNonStriker: nonStriker,
    currentBowler: currentBowler,
    teamAPlayingXI: teamAPlayers,
    teamBPlayingXI: teamBPlayers,
  };
});

/**
 * Retrieves the eligible player pool for a franchise in the match's season.
 * Selects only players acquired via auction lots (sold/allotted/scouted)
 * or retained via franchise_members.
 */
export const getFranchiseEligibleSquad = cache(async (
  supabase: SupabaseClient,
  seasonId: string,
  franchiseId: string
): Promise<Array<{
  registrationId: string;
  playerId: string;
  fullName: string;
  photoUrl: string | null;
  derivedPlayerType: string | null;
  battingStyle: string | null;
  bowlingStyle: string | null;
}>> => {
  // 1. Fetch auction lots owned by this franchise
  const { data: lots } = await supabase
    .from('auction_lots')
    .select('registration_id')
    .eq('season_id', seasonId)
    .eq('highest_bidder_franchise_id', franchiseId)
    .in('status', ['sold', 'allotted', 'scouted']);

  // 2. Fetch franchise members (e.g. captain/VC pre-retentions)
  const { data: members } = await supabase
    .from('franchise_members')
    .select('player_registration_id')
    .eq('franchise_id', franchiseId)
    .eq('is_active', true)
    .not('player_registration_id', 'is', null);

  const regIdSet = new Set<string>();
  if (lots) {
    for (const l of lots) regIdSet.add(l.registration_id);
  }
  if (members) {
    for (const m of members) {
      if (m.player_registration_id) regIdSet.add(m.player_registration_id);
    }
  }

  const regIds = Array.from(regIdSet);
  if (regIds.length === 0) return [];

  // 3. Query public_players_view
  const { data: players } = await supabase
    .from('public_players_view')
    .select('registration_id, player_id, full_name, photo_url, derived_player_type, batting_style, bowling_style')
    .in('registration_id', regIds);

  if (!players) return [];

  return players.map((p) => ({
    registrationId: p.registration_id,
    playerId: p.player_id,
    fullName: p.full_name,
    photoUrl: p.photo_url,
    derivedPlayerType: p.derived_player_type,
    battingStyle: p.batting_style,
    bowlingStyle: p.bowling_style,
  }));
});
