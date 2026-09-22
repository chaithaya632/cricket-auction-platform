// =============================================================================
// ACC Auction Portal — Application Layer: Auction Queries
// =============================================================================

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
 */
export async function getActiveLot(
  supabase: SupabaseClient,
  seasonId: string
): Promise<AuctionLotWithDetails | null> {
  const { data: lot, error: lotErr } = await supabase
    .from('auction_lots')
    .select('*')
    .eq('season_id', seasonId)
    .eq('status', 'in_progress')
    .maybeSingle();

  if (lotErr || !lot) {
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
}

/**
 * Fetches upcoming lots in the queue for a given season.
 */
export async function getAuctionQueue(
  supabase: SupabaseClient,
  seasonId: string,
  limit = 25
): Promise<AuctionLotWithDetails[]> {
  const { data: lots, error } = await supabase
    .from('auction_lots')
    .select('*')
    .eq('season_id', seasonId)
    .eq('status', 'pending')
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

  return lots.map((lot) => {
    const playerView = playerMap.get(lot.registration_id);
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
        full_name: playerView?.full_name || 'Upcoming Player',
        photo_url: playerView?.photo_url || null,
      },
      registration: {
        id: lot.registration_id,
        branch: playerView?.branch || '',
        academic_year: playerView?.academic_year || 1,
        programme: playerView?.programme || '',
        cricheroes_profile_url: playerView?.cricheroes_url || null,
      },
      highest_bidder: null,
    };
  });
}

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
 */
export async function getSeasonAuctionConfig(
  supabase: SupabaseClient,
  seasonId: string
): Promise<AuctionConfigDTO> {
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
}

/**
 * Retrieves the authoritative session lifecycle state of the auction.
 * Evaluates seasons.status ('draft', 'registration', 'auction', 'completed'),
 * season_config ('auction_session_status' = 'live' | 'paused'),
 * and current active lot in progress.
 */
export async function getAuctionSessionState(
  supabase: SupabaseClient,
  seasonId: string
): Promise<AuctionSessionState> {
  const { data: season } = await supabase
    .from('seasons')
    .select('id, name, status')
    .eq('id', seasonId)
    .maybeSingle();

  const { data: configRows } = await supabase
    .from('season_config')
    .select('key, value')
    .eq('season_id', seasonId)
    .in('key', ['auction_session_status', 'auction_started_at']);

  const configMap: Record<string, string> = {};
  if (configRows) {
    for (const r of configRows as { key: string; value: string }[]) {
      configMap[r.key] = r.value;
    }
  }

  const { data: activeLot } = await supabase
    .from('auction_lots')
    .select('id')
    .eq('season_id', seasonId)
    .eq('status', 'in_progress')
    .maybeSingle();

  const seasonStatus = season?.status || 'draft';
  const sessionStatusConfig = configMap['auction_session_status'];
  const startedAt = configMap['auction_started_at'] || null;

  let computedStatus: 'not_started' | 'live' | 'paused' | 'completed' = 'not_started';

  if (seasonStatus === 'completed' || seasonStatus === 'archived' || sessionStatusConfig === 'completed') {
    computedStatus = 'completed';
  } else if (seasonStatus === 'auction') {
    if (sessionStatusConfig === 'paused') {
      computedStatus = 'paused';
    } else {
      computedStatus = 'live';
    }
  } else {
    computedStatus = 'not_started';
  }

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
}

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
 */
export async function getEligiblePlayersForLotQueue(
  supabase: SupabaseClient,
  seasonId: string
): Promise<EligiblePlayerQueueCandidate[]> {
  try {
    // 1. Fetch registrations for this season with player and skill details
    const { data: registrations, error: regErr } = await supabase
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
      .eq('is_auction_eligible', true);

    if (regErr || !registrations || registrations.length === 0) {
      return [];
    }

    // 2. Fetch existing auction lots in this season
    const { data: existingLots } = await supabase
      .from('auction_lots')
      .select('registration_id')
      .eq('season_id', seasonId);

    const queuedRegistrationIds = new Set(
      (existingLots || []).map((l) => l.registration_id)
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
}

/**
 * Computes live scarcity status for the active lot's bucket (§12.3, Cases 11-15).
 * Supply is counted against players needed, not teams.
 */
export async function getActiveLotScarcity(
  supabase: SupabaseClient,
  seasonId: string,
  bucket: string
): Promise<BucketScarcityReport | null> {
  if (!bucket || bucket === 'PG') return null;

  try {
    // 1. Fetch unsold supply in this bucket
    const { count: unsoldSupply } = await supabase
      .from('auction_lots')
      .select('id', { count: 'exact', head: true })
      .eq('season_id', seasonId)
      .eq('bucket', bucket)
      .in('status', ['pending', 'in_progress', 'skipped']);

    // 2. Fetch all active franchises in the season
    const { data: franchises } = await supabase
      .from('franchises')
      .select('id, name')
      .eq('season_id', seasonId)
      .eq('is_active', true);

    if (!franchises || franchises.length === 0) return null;

    // 3. For each franchise, calculate remaining needed in this bucket
    const franchiseNeeds: FranchiseBucketNeed[] = [];

    for (const f of franchises) {
      const { count: bought } = await supabase
        .from('auction_lots')
        .select('id', { count: 'exact', head: true })
        .eq('season_id', seasonId)
        .eq('highest_bidder_franchise_id', f.id)
        .eq('bucket', bucket)
        .in('status', ['sold', 'allotted']);

      const acquired = bought || 0;
      const minRequired = 2; // Spec §7: minimum 2 per mandatory bucket B1..B5
      const needed = Math.max(0, minRequired - acquired);
      franchiseNeeds.push({
        franchiseId: f.id,
        franchiseName: f.name,
        needed,
      });
    }

    return detectBucketScarcity({
      bucket,
      unsoldSupply: unsoldSupply || 0,
      franchiseNeeds,
    });
  } catch (err) {
    console.error('Failed to compute bucket scarcity:', err);
    return null;
  }
}

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
