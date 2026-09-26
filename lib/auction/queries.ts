// =============================================================================
// ACC Auction Portal — Application Layer: Auction Queries
// =============================================================================

import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AuctionLotWithDetails,
  AuctionEventDTO,
  AuctionConfigDTO,
  AuctionSessionState,
  FranchiseLiveSummaryItem,
} from './types';
import type { LotStatus, AuctionEventType } from '@/lib/constants';
import { detectBucketScarcity, type BucketScarcityReport, type FranchiseBucketNeed } from '@/domain/scarcity';
import { calculateMaxPermissibleBid, type MandatoryBucketDeficit } from '@/domain/franchises/max-bid';
import { validateBucketEligibility } from '@/domain/auction/bucket-eligibility';

/**
 * Fetches the single active auction lot currently 'in_progress' for the season.
 * Combines lot projection with public player and franchise views.
 * Memoized per server render cycle with React cache().
 */
export const getActiveLot = cache(async (
  supabase: SupabaseClient,
  seasonId: string
): Promise<AuctionLotWithDetails | null> => {
  // 1. Fetch current in-progress lot
  const { data: activeLot } = await supabase
    .from('auction_lots')
    .select('*')
    .eq('season_id', seasonId)
    .eq('status', 'in_progress')
    .maybeSingle();

  let lot = activeLot;

  // 2. If no lot is actively in progress, retrieve the most recently concluded lot (sold or unsold)
  // so the hammer / "SOLD TO" banner remains prominently visible across all 5 operational views
  // until the next player is brought to the floor.
  if (!lot) {
    const { data: recentLots } = await supabase
      .from('auction_lots')
      .select('*')
      .eq('season_id', seasonId)
      .in('status', ['sold', 'unsold'])
      .order('ended_at', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false })
      .limit(1);

    if (recentLots && recentLots.length > 0) {
      lot = recentLots[0];
    }
  }

  if (!lot) {
    return null;
  }

  // Fetch player details safely via public_players_view
  const { data: playerView } = await supabase
    .from('public_players_view')
    .select('player_id, full_name, photo_url, programme, academic_year, branch, cricheroes_url, derived_player_type, is_batter, is_bowler, is_wicket_keeper, batting_style, bowling_style, experience_years')
    .eq('registration_id', lot.registration_id)
    .maybeSingle();

  // Fetch questionnaire responses & stats from player_skill_profiles
  const { data: skillProfile } = await supabase
    .from('player_skill_profiles')
    .select('batting_order, fielding_position, experience_description')
    .eq('registration_id', lot.registration_id)
    .maybeSingle();

  let parsedStats: Record<string, any> | null = null;
  if (skillProfile?.experience_description) {
    try {
      parsedStats = JSON.parse(skillProfile.experience_description);
    } catch {
      parsedStats = null;
    }
  }

  // Fetch highest bidder franchise if exists
  let highestBidder = null;
  if (lot.highest_bidder_franchise_id) {
    const { data: franchiseView } = await supabase
      .from('public_franchises_view')
      .select('franchise_id, name, short_name, color_primary, color_secondary')
      .eq('franchise_id', lot.highest_bidder_franchise_id)
      .maybeSingle();

    if (franchiseView) {
      highestBidder = {
        id: franchiseView.franchise_id,
        name: franchiseView.name,
        short_name: franchiseView.short_name,
        primary_color: franchiseView.color_primary,
        secondary_color: franchiseView.color_secondary,
      };
    } else {
      // Fallback directly to franchises table if view didn't return
      const { data: fRaw } = await supabase
        .from('franchises')
        .select('id, name, short_name, color_primary, color_secondary')
        .eq('id', lot.highest_bidder_franchise_id)
        .maybeSingle();

      if (fRaw) {
        highestBidder = {
          id: fRaw.id,
          name: fRaw.name,
          short_name: fRaw.short_name,
          primary_color: fRaw.color_primary,
          secondary_color: fRaw.color_secondary,
        };
      }
    }
  }

  return {
    id: lot.id,
    season_id: lot.season_id,
    registration_id: lot.registration_id,
    bucket: lot.bucket,
    draw_number: lot.draw_number,
    base_price: lot.base_price,
    round: lot.round,
    status: lot.status as LotStatus,
    current_price: lot.current_price,
    highest_bidder_franchise_id: lot.highest_bidder_franchise_id,
    started_at: lot.started_at,
    ended_at: lot.ended_at,
    created_at: lot.created_at,
    updated_at: lot.updated_at,
    player: {
      id: playerView?.player_id || lot.registration_id,
      full_name: playerView?.full_name || 'Unknown Player',
      photo_url: playerView?.photo_url || null,
    },
    registration: {
      id: lot.registration_id,
      branch: playerView?.branch || '',
      academic_year: playerView?.academic_year || 1,
      programme: playerView?.programme || '',
      cricheroes_profile_url: playerView?.cricheroes_url || null,
    },
    highest_bidder: highestBidder,
    skills: {
      derived_player_type: playerView?.derived_player_type || null,
      is_batter: Boolean(playerView?.is_batter),
      is_bowler: Boolean(playerView?.is_bowler),
      is_wicket_keeper: Boolean(playerView?.is_wicket_keeper),
      batting_style: playerView?.batting_style || null,
      batting_order: skillProfile?.batting_order || null,
      bowling_style: playerView?.bowling_style || null,
      fielding_position: skillProfile?.fielding_position || null,
      experience_years: playerView?.experience_years ?? null,
      experience_description: skillProfile?.experience_description || null,
      parsed_stats: parsedStats,
    },
  };
});

/**
 * Fetches auction lots by status for a given season, populated with player & franchise details.
 * Memoized per server render cycle with React cache().
 */
export const getAuctionLotsByStatus = cache(async (
  supabase: SupabaseClient,
  seasonId: string,
  statuses: LotStatus[],
  limit = 100
): Promise<AuctionLotWithDetails[]> => {
  const { data: lots, error } = await supabase
    .from('auction_lots')
    .select('*')
    .eq('season_id', seasonId)
    .in('status', statuses)
    .order('round', { ascending: true })
    .order('draw_number', { ascending: true })
    .limit(limit);

  if (error || !lots || lots.length === 0) {
    return [];
  }

  const registrationIds = lots.map((l) => l.registration_id);
  const { data: playersView } = await supabase
    .from('public_players_view')
    .select('registration_id, player_id, full_name, photo_url, programme, academic_year, branch, cricheroes_url')
    .in('registration_id', registrationIds);

  const playerMap = new Map<string, any>();
  if (playersView) {
    for (const p of playersView) {
      playerMap.set(p.registration_id, p);
    }
  }

  // Fetch franchise details for highest_bidder_franchise_id if present
  const franchiseIds = Array.from(
    new Set(lots.map((l) => l.highest_bidder_franchise_id).filter(Boolean))
  ) as string[];

  const franchiseMap = new Map<string, any>();
  if (franchiseIds.length > 0) {
    const { data: franchises } = await supabase
      .from('public_franchises_view')
      .select('franchise_id, name, short_name, color_primary, color_secondary')
      .in('franchise_id', franchiseIds);

    if (franchises) {
      for (const f of franchises) {
        franchiseMap.set(f.franchise_id, f);
      }
    }
  }

  return lots.map((lot) => {
    const playerView = playerMap.get(lot.registration_id);
    const bidderFranchise = lot.highest_bidder_franchise_id
      ? franchiseMap.get(lot.highest_bidder_franchise_id)
      : null;

    return {
      id: lot.id,
      season_id: lot.season_id,
      registration_id: lot.registration_id,
      bucket: lot.bucket,
      draw_number: lot.draw_number,
      base_price: lot.base_price,
      round: lot.round,
      status: lot.status as LotStatus,
      current_price: lot.current_price,
      highest_bidder_franchise_id: lot.highest_bidder_franchise_id,
      started_at: lot.started_at,
      ended_at: lot.ended_at,
      created_at: lot.created_at,
      updated_at: lot.updated_at,
      player: {
        id: playerView?.player_id || lot.registration_id,
        full_name: playerView?.full_name || 'Tournament Player',
        photo_url: playerView?.photo_url || null,
      },
      registration: {
        id: lot.registration_id,
        branch: playerView?.branch || '',
        academic_year: playerView?.academic_year || 1,
        programme: playerView?.programme || '',
        cricheroes_profile_url: playerView?.cricheroes_url || null,
      },
      highest_bidder: bidderFranchise
        ? {
            id: bidderFranchise.franchise_id,
            name: bidderFranchise.name,
            short_name: bidderFranchise.short_name,
            primary_color: bidderFranchise.color_primary,
            secondary_color: bidderFranchise.color_secondary,
          }
        : null,
    };
  });
});

/**
 * Fetches upcoming pending lots in the queue for a given season.
 * Memoized per server render cycle with React cache().
 */
export const getAuctionQueue = cache(async (
  supabase: SupabaseClient,
  seasonId: string,
  limit = 25
): Promise<AuctionLotWithDetails[]> => {
  return getAuctionLotsByStatus(supabase, seasonId, ['pending'], limit);
});

/**
 * Fetches unsold lots for a given season.
 * Memoized per server render cycle with React cache().
 */
export const getUnsoldLots = cache(async (
  supabase: SupabaseClient,
  seasonId: string,
  limit = 50
): Promise<AuctionLotWithDetails[]> => {
  return getAuctionLotsByStatus(supabase, seasonId, ['unsold'], limit);
});

/**
 * Fetches completed/past lots (sold, unsold, skipped, allotted) for a given season.
 * Memoized per server render cycle with React cache().
 */
export const getCompletedLots = cache(async (
  supabase: SupabaseClient,
  seasonId: string,
  limit = 100
): Promise<AuctionLotWithDetails[]> => {
  return getAuctionLotsByStatus(supabase, seasonId, ['sold', 'unsold', 'skipped', 'allotted'], limit);
});

/**
 * Fetches all auction lots regardless of status for a given season.
 * Memoized per server render cycle with React cache().
 */
export const getAllAuctionLots = cache(async (
  supabase: SupabaseClient,
  seasonId: string,
  limit = 500
): Promise<AuctionLotWithDetails[]> => {
  return getAuctionLotsByStatus(
    supabase,
    seasonId,
    ['pending', 'in_progress', 'sold', 'unsold', 'skipped', 'recalled', 'allotted', 'scouted'],
    limit
  );
});

/**
 * Fetches the chronological event history for a specific auction lot.
 */
export async function getLotHistory(
  supabase: SupabaseClient,
  lotId: string
): Promise<AuctionEventDTO[]> {
  const { data: events, error } = await supabase
    .from('auction_events')
    .select('*')
    .eq('auction_lot_id', lotId)
    .order('sequence_number', { ascending: true });

  if (error || !events) {
    return [];
  }

  // Fetch franchise short names for bids
  const franchiseIds = Array.from(
    new Set(events.map((e) => e.franchise_id).filter(Boolean))
  ) as string[];

  const franchiseMap = new Map<string, any>();
  if (franchiseIds.length > 0) {
    const { data: franchises } = await supabase
      .from('public_franchises_view')
      .select('franchise_id, name, short_name, color_primary, color_secondary')
      .in('franchise_id', franchiseIds);

    if (franchises) {
      for (const f of franchises) {
        franchiseMap.set(f.franchise_id, {
          id: f.franchise_id,
          name: f.name,
          short_name: f.short_name,
          primary_color: f.color_primary,
          secondary_color: f.color_secondary,
        });
      }
    }
  }

  return events.map((e) => ({
    id: e.id,
    season_id: e.season_id,
    auction_lot_id: e.auction_lot_id,
    event_type: e.event_type as AuctionEventType,
    actor_user_id: e.actor_user_id,
    franchise_id: e.franchise_id,
    price: e.price,
    reason: e.reason,
    payload: e.payload,
    sequence_number: e.sequence_number,
    created_at: e.created_at,
    franchise: e.franchise_id ? franchiseMap.get(e.franchise_id) || null : null,
  }));
}

/**
 * Fetches recent auction events across the entire season for real-time stream.
 */
export async function getRecentAuctionEvents(
  supabase: SupabaseClient,
  seasonId: string,
  limit = 20
): Promise<AuctionEventDTO[]> {
  const { data: events, error } = await supabase
    .from('auction_events')
    .select('*')
    .eq('season_id', seasonId)
    .order('sequence_number', { ascending: false })
    .limit(limit);

  if (error || !events) {
    return [];
  }

  const franchiseIds = Array.from(
    new Set(events.map((e) => e.franchise_id).filter(Boolean))
  ) as string[];

  const franchiseMap = new Map<string, any>();
  if (franchiseIds.length > 0) {
    const { data: franchises } = await supabase
      .from('public_franchises_view')
      .select('franchise_id, name, short_name, color_primary, color_secondary')
      .in('franchise_id', franchiseIds);

    if (franchises) {
      for (const f of franchises) {
        franchiseMap.set(f.franchise_id, {
          id: f.franchise_id,
          name: f.name,
          short_name: f.short_name,
          primary_color: f.color_primary,
          secondary_color: f.color_secondary,
        });
      }
    }
  }

  return events.map((e) => ({
    id: e.id,
    season_id: e.season_id,
    auction_lot_id: e.auction_lot_id,
    event_type: e.event_type as AuctionEventType,
    actor_user_id: e.actor_user_id,
    franchise_id: e.franchise_id,
    price: e.price,
    reason: e.reason,
    payload: e.payload,
    sequence_number: e.sequence_number,
    created_at: e.created_at,
    franchise: e.franchise_id ? franchiseMap.get(e.franchise_id) || null : null,
  }));
}

/**
 * Fetches season auction configuration values.
 * Memoized per server render cycle with React cache().
 */
export const getSeasonAuctionConfig = cache(async (
  supabase: SupabaseClient,
  seasonId: string
): Promise<AuctionConfigDTO> => {
  const { data: rows } = await supabase
    .from('season_config')
    .select('key, value')
    .eq('season_id', seasonId);

  const configMap: Record<string, string> = {};
  if (rows) {
    for (const r of rows as { key: string; value: string }[]) {
      configMap[r.key] = r.value;
    }
  }

  return {
    firstBidTimerSeconds: parseInt(configMap['first_bid_timer_seconds'] || '30', 10),
    subsequentBidTimerSeconds: parseInt(configMap['subsequent_bid_timer_seconds'] || '20', 10),
    minAuctionPurchases: parseInt(configMap['min_auction_purchases'] || '15', 10),
    maxSquadSize: parseInt(configMap['max_squad_size'] || '22', 10),
    minSquadSize: parseInt(configMap['min_squad_size'] || '17', 10),
    defaultPurse: parseInt(configMap['default_purse'] || '1000', 10),
  };
});

/**
 * Retrieves the authoritative session lifecycle state of the auction.
 * Evaluates seasons.status ('draft', 'registration', 'auction', 'completed'),
 * season_config ('auction_session_status' = 'live' | 'paused'),
 * and current active lot in progress.
/**
 * Determines whether referenceDate is on a calendar day strictly after eventDate.
 * Authoritatively governed by Indian Standard Time (UTC+05:30, official ACC jurisdiction),
 * immune to Vercel/server timezone, container timezone, or browser client offsets.
 */
export function isLaterCalendarDay(eventDate: Date, referenceDate: Date): boolean {
  // Indian Standard Time (UTC+05:30)
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const eventIst = new Date(eventDate.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
  const refIst = new Date(referenceDate.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
  return refIst > eventIst;
}

/**
 * Pure, authoritative resolution of the current operational auction session status.
 *
 * State Model:
 * 1. Active auction: seasonStatus === 'auction' -> 'paused' (if configured) or 'live'
 * 2. Explicitly completed auction:
 *    - Persists as 'completed' for the active session and subsequent visits on the same day.
 *    - Automatically resolves to 'not_started' if visited on a subsequent calendar day
 *      WITHOUT mutating the database, events, or historical lots.
 * 3. Default: 'not_started'
 */
export function resolveAuctionSessionStatus(params: {
  seasonStatus: string;
  sessionConfigStatus?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  referenceDate?: Date;
}): 'not_started' | 'live' | 'paused' | 'completed' {
  const {
    seasonStatus,
    sessionConfigStatus,
    endedAt,
    referenceDate = new Date(),
  } = params;

  // 1. If season or session was explicitly marked completed
  const isExplicitlyCompleted =
    seasonStatus === 'completed' ||
    seasonStatus === 'archived' ||
    sessionConfigStatus === 'completed';

  if (isExplicitlyCompleted) {
    const sessionEndTime = endedAt || null;

    if (sessionEndTime) {
      const endDate = new Date(sessionEndTime);
      if (!isNaN(endDate.getTime())) {
        // If returning on a later calendar day without explicitly starting a new session:
        if (isLaterCalendarDay(endDate, referenceDate)) {
          return 'not_started';
        }
      }
    }

    // Persists for the current completed session
    return 'completed';
  }

  // 2. If currently in operational auction mode
  if (seasonStatus === 'auction') {
    if (sessionConfigStatus === 'paused') {
      return 'paused';
    }
    return 'live';
  }

  // 3. Unstarted (draft, registration, etc.)
  return 'not_started';
}

/**
 * Retrieves the current session status for an active season.
 * Memoized per server render cycle with React cache().
 */
export const getAuctionSessionState = cache(async (
  supabase: SupabaseClient,
  seasonId: string
): Promise<AuctionSessionState> => {
  const [seasonResult, configRowsResult, activeLotResult] = await Promise.all([
    supabase
      .from('seasons')
      .select('id, name, status, updated_at')
      .eq('id', seasonId)
      .maybeSingle(),
    supabase
      .from('season_config')
      .select('key, value')
      .eq('season_id', seasonId)
      .in('key', ['auction_session_status', 'auction_started_at', 'auction_ended_at']),
    supabase
      .from('auction_lots')
      .select('id')
      .eq('season_id', seasonId)
      .eq('status', 'in_progress')
      .maybeSingle(),
  ]);

  const season = seasonResult.data;
  const configRows = configRowsResult.data;
  const activeLot = activeLotResult.data;

  const configMap: Record<string, string> = {};
  if (configRows) {
    for (const r of configRows as { key: string; value: string }[]) {
      configMap[r.key] = r.value;
    }
  }

  const seasonStatus = season?.status || 'draft';
  const sessionStatusConfig = configMap['auction_session_status'];
  const startedAt = configMap['auction_started_at'] || null;
  const endedAt =
    configMap['auction_ended_at'] ||
    (seasonStatus === 'completed' ? season?.updated_at : null);

  const computedStatus = resolveAuctionSessionStatus({
    seasonStatus,
    sessionConfigStatus: sessionStatusConfig,
    startedAt,
    endedAt,
  });

  return {
    status: computedStatus,
    seasonId,
    seasonName: season?.name || 'ACC 2026',
    isLive: computedStatus === 'live',
    isPaused: computedStatus === 'paused',
    isNotStarted: computedStatus === 'not_started',
    isCompleted: computedStatus === 'completed',
    startedAt,
    activeLotId: activeLot?.id || null,
  };
});

export interface EligiblePlayerQueueCandidate {
  registrationId: string;
  playerId: string;
  fullName: string;
  rollNumber: string;
  photoUrl?: string;
  bucket: string;
  basePrice: number;
  playerType: string;
  branch?: string;
  academicYear?: number;
}

/**
 * Retrieves all registered players in the given season who are marked AUCTION ELIGIBLE,
 * active (not blocked), and do NOT yet have an auction lot assigned in this season.
 * Memoized per server render cycle with React cache().
 */
export const getEligiblePlayersForLotQueue = cache(async (
  supabase: SupabaseClient,
  seasonId: string
): Promise<EligiblePlayerQueueCandidate[]> => {
  try {
    // 1-2. Concurrently fetch eligible registrations and existing auction lots
    const [regResult, lotsResult] = await Promise.all([
      supabase
        .from('player_season_registrations')
        .select(`
          id,
          player_id,
          bucket,
          base_price,
          branch,
          academic_year,
          is_auction_eligible,
          registration_status,
          players (
            id,
            full_name,
            roll_number,
            photo_url,
            is_active
          ),
          player_skill_profiles (
            derived_player_type
          )
        `)
        .eq('season_id', seasonId)
        .eq('is_auction_eligible', true),
      supabase
        .from('auction_lots')
        .select('registration_id')
        .eq('season_id', seasonId),
    ]);

    const registrations = regResult.data;
    if (regResult.error || !registrations || registrations.length === 0) {
      return [];
    }

    const queuedRegistrationIds = new Set(
      (lotsResult.data || []).map((l) => l.registration_id)
    );

    // 3. Filter registrations not yet queued and ensure player is active
    const candidates: EligiblePlayerQueueCandidate[] = [];
    for (const r of registrations as any[]) {
      if (!queuedRegistrationIds.has(r.id) && r.is_auction_eligible) {
        const player = Array.isArray(r.players) ? r.players[0] : r.players;
        if (!player || player.is_active === false) {
          continue;
        }

        const skills = Array.isArray(r.player_skill_profiles)
          ? r.player_skill_profiles[0]
          : r.player_skill_profiles;

        candidates.push({
          registrationId: r.id,
          playerId: player.id,
          fullName: player.full_name,
          rollNumber: player.roll_number,
          photoUrl: player.photo_url || undefined,
          bucket: r.bucket,
          basePrice: r.base_price,
          playerType: skills?.derived_player_type || 'all_rounder',
          branch: r.branch || undefined,
          academicYear: r.academic_year || undefined,
        });
      }
    }

    return candidates;
  } catch {
    return [];
  }
});

/**
 * Computes live scarcity status for the active lot's bucket (§12.3, Cases 11-15).
 * Supply is counted against players needed, not teams.
 * Memoized per server render cycle with React cache().
 */
export const getActiveLotScarcity = cache(async (
  supabase: SupabaseClient,
  seasonId: string,
  bucket: string
): Promise<BucketScarcityReport | null> => {
  if (!bucket || bucket === 'PG') return null;

  try {
    // 1-3. Concurrently fetch unsold supply, franchises, and acquired lots in this bucket
    const [unsoldResult, franchisesResult, boughtLotsResult] = await Promise.all([
      supabase
        .from('auction_lots')
        .select('id', { count: 'exact', head: true })
        .eq('season_id', seasonId)
        .eq('bucket', bucket)
        .in('status', ['pending', 'in_progress', 'skipped']),
      supabase
        .from('franchises')
        .select('id, name')
        .eq('season_id', seasonId)
        .eq('is_active', true),
      supabase
        .from('auction_lots')
        .select('highest_bidder_franchise_id')
        .eq('season_id', seasonId)
        .eq('bucket', bucket)
        .in('status', ['sold', 'allotted']),
    ]);

    const franchises = franchisesResult.data;
    if (!franchises || franchises.length === 0) return null;

    // Count bought lots per franchise in memory
    const countMap = new Map<string, number>();
    for (const lot of boughtLotsResult.data || []) {
      if (lot.highest_bidder_franchise_id) {
        countMap.set(
          lot.highest_bidder_franchise_id,
          (countMap.get(lot.highest_bidder_franchise_id) || 0) + 1
        );
      }
    }

    const minRequired = 2; // Spec §7: minimum 2 per mandatory bucket B1..B5
    const franchiseNeeds: FranchiseBucketNeed[] = franchises.map((f) => {
      const acquired = countMap.get(f.id) || 0;
      return {
        franchiseId: f.id,
        franchiseName: f.name,
        needed: Math.max(0, minRequired - acquired),
      };
    });

    return detectBucketScarcity({
      bucket,
      unsoldSupply: unsoldResult.count || 0,
      franchiseNeeds,
    });
  } catch (err) {
    console.error('Failed to compute bucket scarcity:', err);
    return null;
  }
});

/**
 * Retrieves real-time summary for all franchises in the season, including purse,
 * max permissible bid, bucket completion progress, and active lot bidding status.
 * (Spec §14, §15)
 */
export async function getAllFranchisesLiveSummary(
  supabase: SupabaseClient,
  seasonId: string,
  activeLot: AuctionLotWithDetails | null
): Promise<FranchiseLiveSummaryItem[]> {
  try {
    // 1. Fetch active franchises
    const { data: franchises, error: fErr } = await supabase
      .from('franchises')
      .select('id, name, short_name, color_primary, color_secondary')
      .eq('season_id', seasonId)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (fErr || !franchises || franchises.length === 0) {
      return [];
    }

    // 2. Fetch season configuration
    const { data: configRows } = await supabase
      .from('season_config')
      .select('key, value')
      .eq('season_id', seasonId);

    const configMap: Record<string, string> = {};
    if (configRows) {
      for (const c of configRows as { key: string; value: string }[]) {
        configMap[c.key] = c.value;
      }
    }

    const startingPurse = parseInt(configMap['default_purse'] || '1000', 10);
    const minSquadSize = parseInt(configMap['min_squad_size'] || '17', 10);
    const maxSquadSize = parseInt(configMap['max_squad_size'] || '22', 10);
    const minAuctionPurchases = parseInt(configMap['min_auction_purchases'] || '15', 10);
    const minBasePrice = 20;

    // 3. Fetch bucket rules
    const { data: bucketRulesData } = await supabase
      .from('bucket_rules')
      .select('*')
      .eq('season_id', seasonId)
      .order('auction_order', { ascending: true });

    const mandatoryBucketNames = (bucketRulesData || [])
      .filter((r) => r.is_mandatory)
      .map((r) => r.bucket);

    // 4. Fetch all acquired lots in one query
    const { data: allLots } = await supabase
      .from('auction_lots')
      .select('id, highest_bidder_franchise_id, bucket, status, current_price, base_price')
      .eq('season_id', seasonId)
      .in('status', ['sold', 'allotted', 'scouted']);

    const lotsByFranchise: Record<string, any[]> = {};
    for (const lot of allLots || []) {
      if (lot.highest_bidder_franchise_id) {
        if (!lotsByFranchise[lot.highest_bidder_franchise_id]) {
          lotsByFranchise[lot.highest_bidder_franchise_id] = [];
        }
        lotsByFranchise[lot.highest_bidder_franchise_id].push(lot);
      }
    }

    const results: FranchiseLiveSummaryItem[] = [];

    for (const f of franchises) {
      const fLots = lotsByFranchise[f.id] || [];
      let spentPurse = 0;
      const bucketCounts: Record<string, number> = {
        B1: 0,
        B2: 0,
        B3: 0,
        B4: 0,
        B5: 0,
        PG: 0,
      };

      for (const lot of fLots) {
        const price =
          lot.current_price !== null && lot.current_price !== undefined
            ? lot.current_price
            : lot.status === 'sold'
            ? lot.base_price
            : 20;
        spentPurse += price;
        if (lot.bucket) {
          bucketCounts[lot.bucket] = (bucketCounts[lot.bucket] || 0) + 1;
        }
      }

      const remainingPurse = Math.max(0, startingPurse - spentPurse);
      const squadCount = fLots.length;
      const auctionPurchasesSoFar = fLots.length;

      // Calculate mandatory bucket deficits
      const mandatoryDeficits: MandatoryBucketDeficit[] = (
        mandatoryBucketNames.length > 0 ? mandatoryBucketNames : ['B1', 'B2', 'B3', 'B4', 'B5']
      ).map((b) => ({
        bucket: b,
        minRequired: 2,
        acquiredCount: bucketCounts[b] || 0,
      }));

      const mandatoryDeficitsRecord: Record<string, number> = {};
      for (const d of mandatoryDeficits) {
        mandatoryDeficitsRecord[d.bucket] = Math.max(0, d.minRequired - d.acquiredCount);
      }

      const maxBidResult = calculateMaxPermissibleBid({
        remainingPurse,
        auctionPurchasesSoFar,
        minAuctionPurchases,
        minBasePrice,
        mandatoryBucketDeficits: mandatoryDeficits,
      });

      // Determine real-time bidding status for active lot (§14)
      let status: 'leading' | 'in_play' | 'blocked' = 'in_play';
      let blockReason: string | undefined = undefined;

      if (activeLot && activeLot.status === 'in_progress') {
        if (activeLot.highest_bidder_franchise_id === f.id) {
          status = 'leading';
        } else if (squadCount >= maxSquadSize) {
          status = 'blocked';
          blockReason = `Squad Full (${squadCount}/${maxSquadSize})`;
        } else {
          const nextBid =
            activeLot.current_price !== null
              ? activeLot.current_price + 5
              : activeLot.base_price;

          if (maxBidResult.maxBid < nextBid) {
            status = 'blocked';
            blockReason = `Max Bid: ₹${maxBidResult.maxBid}`;
          } else {
            const remainingSlots = Math.max(0, minAuctionPurchases - auctionPurchasesSoFar);
            const bucketCheck = validateBucketEligibility({
              remainingSlots,
              unfilledMandatoryDeficits: mandatoryDeficits.map((d) => ({
                bucket: d.bucket,
                remainingNeeded: Math.max(0, d.minRequired - d.acquiredCount),
              })),
              targetBucket: activeLot.bucket,
              remainingPurse,
              proposedBid: nextBid,
              minBasePrice,
            });

            if (!bucketCheck.isEligible) {
              status = 'blocked';
              blockReason = 'Bucket Deficit';
            } else {
              status = 'in_play';
            }
          }
        }
      }

      results.push({
        id: f.id,
        name: f.name,
        shortName: f.short_name,
        primaryColor: f.color_primary,
        secondaryColor: f.color_secondary,
        remainingPurse,
        maxPermissibleBid: maxBidResult.maxBid,
        squadCount,
        maxSquadSize,
        minSquadSize,
        bucketCounts,
        mandatoryBucketDeficits: mandatoryDeficitsRecord,
        status,
        blockReason,
      });
    }

    return results;
  } catch (err) {
    console.error('Failed to get franchises live summary:', err);
    return [];
  }
}
